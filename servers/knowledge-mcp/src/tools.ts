// MCP tool handlers + their JSON-Schema definitions for tools/list.
import { type Entry, type Kind, KINDS, KnowledgeStore } from "./db.ts";
import type { Embedder } from "./embeddings.ts";

export const MAX_BODY = 4000; // ~1k tokens — distillation target is "a few lines"
const DEDUP_THRESHOLD = 0.8; // surface a near-duplicate hint at/above this cosine
const DEFAULT_K = 5;
const MAX_K = 50;

export function tokenEstimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function ulid(): string {
  const ts = Date.now().toString(36).padStart(9, "0");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
  const rand = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return ts + rand;
}

// Normalised cosine. Dim mismatch → 0 (silently skipped): keeps search correct if the
// embedding provider changes, instead of returning garbage cross-provider similarity.
function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function now(): string {
  return new Date().toISOString();
}

function asKind(v: unknown): Kind | null {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v) ? v as Kind : null;
}

export interface Handlers {
  [tool: string]: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

export function createHandlers(store: KnowledgeStore, embedder: Embedder): Handlers {
  // Embedding-dimension drift guard: the first save records which embedder built the store;
  // every later save/search must match it. Switching provider after data exists throws with a
  // recovery path instead of silently returning [] (cross-provider cosine is meaningless).
  function guardEmbedder(firstWrite: boolean): void {
    const storedName = store.getMeta("embedder_name");
    const storedDim = store.getMeta("embedder_dim");
    if (storedName === null && storedDim === null) {
      if (firstWrite) {
        store.setMeta("embedder_name", embedder.name);
        store.setMeta("embedder_dim", String(embedder.dim));
      }
      return;
    }
    if (storedName !== embedder.name || Number(storedDim) !== embedder.dim) {
      throw new Error(
        `Embedder mismatch: this store was built with '${storedName}' (dim ${storedDim}) but the ` +
          `configured embedder is '${embedder.name}' (dim ${embedder.dim}). Recovery: delete ` +
          `~/.junie/knowledge/knowledge.db and re-save, or export_knowledge with the old embedder, ` +
          `wipe the store, and re-import.`,
      );
    }
  }

  // Near-duplicate detection against existing same-kind/same-project entries.
  function dedup(kind: string, project: string | null, vec: number[], excludeId?: string) {
    return store
      .entriesWithEmbedding({ kind, project })
      .filter((c) => c.id !== excludeId)
      .map((c) => ({ id: c.id, title: c.title, score: cosine(vec, c.vec) }))
      .filter((c) => c.score >= DEDUP_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => ({ id: c.id, title: c.title, score: Number(c.score.toFixed(3)) }));
  }

  return {
    async save_knowledge(args) {
      const kind = asKind(args.kind);
      if (!kind) throw new Error(`kind must be one of: ${KINDS.join(", ")}`);
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (!title) throw new Error("title is required");
      const bodyRaw = typeof args.body === "string" ? args.body : "";
      if (!bodyRaw.trim()) throw new Error("body is required");

      const tags: string[] = Array.isArray(args.tags)
        ? args.tags.filter((t): t is string => typeof t === "string")
        : [];
      const project = typeof args.project === "string" && args.project.trim()
        ? args.project.trim()
        : null;
      const source = typeof args.source === "string" && args.source.trim()
        ? args.source.trim()
        : (Deno.env.get("KNOWLEDGE_SOURCE") ?? "junie");

      let body = bodyRaw;
      let truncated = false;
      if (body.length > MAX_BODY) {
        body = body.slice(0, MAX_BODY);
        truncated = true;
      }

      // Trust boundary: an LLM-supplied id may collide with an unrelated entry. Only reuse an id
      // to UPDATE when it's the same kind+project; if the id is taken by a different entry, mint a
      // fresh id instead of clobbering it (the UPSERT would otherwise overwrite the unrelated row).
      const requestedId = typeof args.id === "string" && args.id ? args.id : null;
      const candidate = requestedId ? store.getEntry(requestedId) : null;
      const existing = candidate && candidate.kind === kind && candidate.project === project
        ? candidate
        : null;
      const id = existing?.id ?? (candidate ? ulid() : (requestedId ?? ulid()));
      guardEmbedder(true); // first write records the embedder identity; later writes must match
      const [vec] = await embedder.embed([`${title}\n${body}`]);
      const dedup_hint = dedup(kind, project, vec, id);

      const ts = now();
      const entry: Entry = {
        id,
        kind,
        title,
        body,
        tags,
        project,
        source,
        token_est: tokenEstimate(body),
        created_at: existing?.created_at ?? ts,
        updated_at: ts,
      };
      store.saveEntry(entry, vec);

      const result: Record<string, unknown> = { id, kind, token_est: entry.token_est };
      if (truncated) {
        result.truncated = true;
        result.hint = `body truncated to ${MAX_BODY} chars — distil to a few lines`;
      }
      if (dedup_hint.length) result.dedup_hint = dedup_hint;
      if (existing) result.updated = true;
      return result;
    },

    async search_knowledge(args) {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) throw new Error("query is required");
      const kind = asKind(args.kind);
      const project = typeof args.project === "string" && args.project.trim()
        ? args.project.trim()
        : null;
      const k = Number.isInteger(args.k) && (args.k as number) > 0
        ? Math.min(args.k as number, MAX_K)
        : DEFAULT_K;

      guardEmbedder(false); // never set meta from a search; only compare when data exists
      const [qvec] = await embedder.embed([query]);
      // ponytail: in-memory cosine over all matching embeddings.
      // Ceiling ~tens of thousands of entries; drop-in sqlite-vec when the store outgrows it.
      const ranked = store
        .entriesWithEmbedding({ kind, project })
        .map((r) => ({ r, score: cosine(qvec, r.vec) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

      return ranked.map(({ r, score }) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        tags: r.tags,
        project: r.project,
        token_est: r.token_est,
        score: Number(score.toFixed(3)),
      }));
    },

    get_knowledge(args) {
      const id = typeof args.id === "string" ? args.id : "";
      if (!id) throw new Error("id is required");
      // Not-found → { found: false }, not bare null, so a missing id is never mistaken for a
      // store failure. Recover a prior-session id via search/list before calling this.
      return store.getEntry(id) ?? { found: false };
    },

    list_knowledge(args) {
      const kind = asKind(args.kind);
      const project = typeof args.project === "string" && args.project.trim()
        ? args.project.trim()
        : null;
      const tag = typeof args.tag === "string" && args.tag.trim()
        ? args.tag.trim().toLowerCase()
        : null;
      const limit = Number.isInteger(args.limit) && (args.limit as number) > 0
        ? Math.min(args.limit as number, 500)
        : 50;
      // tag lives in a JSON column — filter in JS (cheap at single-user scale).
      let entries = store.listEntries({ kind, project, limit: tag ? 500 : limit });
      if (tag) {
        entries = entries.filter((e) => e.tags.some((t) => t.toLowerCase() === tag)).slice(
          0,
          limit,
        );
      }
      return entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        tags: e.tags,
        project: e.project,
        token_est: e.token_est,
        updated_at: e.updated_at,
      }));
    },

    delete_knowledge(args) {
      const id = typeof args.id === "string" ? args.id : "";
      if (!id) throw new Error("id is required");
      const deleted = store.deleteEntry(id);
      return { ok: true, id, deleted };
    },

    export_knowledge(args) {
      const entries = store.listEntries({ limit: 5000 });
      const dir = `${Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "."}/.junie/knowledge`;
      // Trust boundary: `path` is LLM-controlled — confine the write under the knowledge dir
      // (reject absolutes / parent traversal) so an injected prompt can't clobber dotfiles.
      let path = `${dir}/export.md`;
      if (typeof args.path === "string" && args.path.trim()) {
        const requested = args.path.trim();
        if (requested.startsWith("/") || requested.includes("..")) {
          throw new Error("export path must be relative to ~/.junie/knowledge and contain no '..'");
        }
        path = `${dir}/${requested}`;
      }
      Deno.mkdirSync(dir, { recursive: true });
      const md: string[] = [
        "# Knowledge export",
        "",
        `_Generated ${now()} · ${entries.length} entries_`,
        "",
      ];
      for (const k of KINDS) {
        const subset = entries.filter((e) => e.kind === k);
        if (!subset.length) continue;
        md.push(`## ${k} (${subset.length})`, "");
        for (const e of subset) {
          md.push(`### ${e.title}`, "");
          if (e.tags.length) md.push(`- **tags:** ${e.tags.join(", ")}`);
          if (e.project) md.push(`- **project:** ${e.project}`);
          md.push("", e.body, "", `_id: ${e.id} · updated: ${e.updated_at}_`, "");
        }
      }
      Deno.writeTextFileSync(path, md.join("\n"));
      return { count: entries.length, path };
    },
  };
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

const stringArray = { type: "array", items: { type: "string" } };
const kindEnum = { type: "string", enum: [...KINDS] };

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "save_knowledge",
    description:
      "Save a distilled knowledge entry (embeds it for semantic search). Keep `body` to a few lines. " +
      "kind: project (durable dev facts/decisions) | codebase (module maps/API contracts/data flow) | " +
      "recap (session handoff). Returns id, token_est, and a dedup_hint if a near-duplicate exists.",
    inputSchema: {
      type: "object",
      properties: {
        kind: kindEnum,
        title: { type: "string", description: "Short human-readable title" },
        body: { type: "string", description: "Distilled content (a few lines)" },
        tags: stringArray,
        project: {
          type: "string",
          description: "Optional scope (project id / cwd) to avoid cross-project leakage",
        },
        id: {
          type: "string",
          description: "Optional; if it exists, the entry is updated and re-embedded",
        },
        source: {
          type: "string",
          description:
            "Optional provenance (agent name). Defaults to KNOWLEDGE_SOURCE env or 'junie'",
        },
      },
      required: ["kind", "title", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "search_knowledge",
    description:
      "Semantic top-k search over stored knowledge. Call at task start / before re-reading a large file. " +
      "Returns id, title, body, score. Optional kind/project narrow the scope; default k=5.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kind: kindEnum,
        project: { type: "string" },
        k: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_knowledge",
    description: "Fetch one entry by id (full body).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_knowledge",
    description: "List entries (newest first), optionally filtered by kind/project/tag.",
    inputSchema: {
      type: "object",
      properties: {
        kind: kindEnum,
        project: { type: "string" },
        tag: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "delete_knowledge",
    description: "Delete an entry and its embedding by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "export_knowledge",
    description:
      "Export the whole store to a Markdown file (backup / portability). Defaults to ~/.junie/knowledge/export.md.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      additionalProperties: false,
    },
  },
];
