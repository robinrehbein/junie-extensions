// SQLite store for distilled knowledge entries + their embeddings.
// Uses Deno's built-in node:sqlite — no native dependency to install.
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export const KINDS = ["project", "codebase", "recap"] as const;
export type Kind = (typeof KINDS)[number];

export interface Entry {
  id: string;
  kind: string;
  title: string;
  body: string;
  tags: string[];
  project: string | null;
  source: string | null;
  token_est: number;
  created_at: string;
  updated_at: string;
}

export const SCHEMA_VERSION = "1";

function home(): string {
  return Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
}

/** DB location; overridable via KNOWLEDGE_DB (used by the self-check). */
export function dbPath(): string {
  return Deno.env.get("KNOWLEDGE_DB") ?? `${home()}/.junie/knowledge/knowledge.db`;
}

type Row = Record<string, unknown>;

// ponytail: tolerate a corrupt tags/vec cell instead of throwing inside a map() that would
// kill every search/list/export. Bad vec → [] (cosine skips it); bad tags → [].
function safeJsonArray<T>(s: unknown, fallback: T[]): T[] {
  try {
    const v = JSON.parse(String(s));
    return Array.isArray(v) ? v as T[] : fallback;
  } catch {
    return fallback;
  }
}

function toEntry(r: Row): Entry {
  return {
    id: String(r.id),
    kind: String(r.kind),
    title: String(r.title),
    body: String(r.body),
    tags: safeJsonArray<string>(r.tags, []),
    project: r.project == null ? null : String(r.project),
    source: r.source == null ? null : String(r.source),
    token_est: Number(r.token_est),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export interface EntryWithVec extends Entry {
  vec: number[];
}

export class KnowledgeStore {
  private db: DatabaseSync;

  constructor(path: string = dbPath()) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tags TEXT,
      project TEXT,
      source TEXT,
      token_est INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`);
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_entries_kind_project ON entries(kind, project);",
    );
    this.db.exec(`CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      vec TEXT NOT NULL
    );`);
    this.db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | Row
      | undefined;
    if (!row) {
      this.db.prepare("INSERT INTO meta(key, value) VALUES('schema_version', ?)").run(SCHEMA_VERSION);
    } else if (String(row.value) !== SCHEMA_VERSION) {
      // Loud, not silent: a drifting schema must stop the server until a real migration exists.
      throw new Error(
        `knowledge DB has schema_version ${String(row.value)} but this server expects ${SCHEMA_VERSION}. ` +
          `No migrations are implemented yet — back up ~/.junie/knowledge, delete knowledge.db, and restart.`,
      );
    }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as Row | undefined;
    return row ? String(row.value) : null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare(
      "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(key, value);
  }

  /** Run fn inside a transaction; roll back on error (keeps entry + embedding consistent). */
  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  saveEntry(e: Entry, vec: number[]): void {
    this.tx(() => {
      this.db.prepare(
        `INSERT INTO entries(id, kind, title, body, tags, project, source, token_est, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind=excluded.kind, title=excluded.title, body=excluded.body, tags=excluded.tags,
           project=excluded.project, source=excluded.source, token_est=excluded.token_est,
           updated_at=excluded.updated_at`,
      ).run(
        e.id,
        e.kind,
        e.title,
        e.body,
        JSON.stringify(e.tags ?? []),
        e.project,
        e.source,
        e.token_est,
        e.created_at,
        e.updated_at,
      );
      this.db.prepare(
        "INSERT INTO embeddings(id, vec) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET vec=excluded.vec",
      ).run(e.id, JSON.stringify(vec));
    });
  }

  getEntry(id: string): Entry | null {
    const r = this.db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as Row | undefined;
    return r ? toEntry(r) : null;
  }

  exists(id: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM entries WHERE id = ?").get(id);
  }

  listEntries(filter: { kind?: string | null; project?: string | null; limit?: number }): Entry[] {
    const limit = filter.limit ?? 50;
    let sql = "SELECT * FROM entries";
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (filter.kind) {
      where.push("kind = ?");
      args.push(filter.kind);
    }
    if (filter.project) {
      where.push("project = ?");
      args.push(filter.project);
    }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY created_at DESC LIMIT ?";
    args.push(limit);
    return (this.db.prepare(sql).all(...args) as Row[]).map(toEntry);
  }

  // ponytail: loads all matching embeddings into RAM for cosine search.
  // Ceiling ~tens of thousands of entries (single-user store); drop-in sqlite-vec when outgrown.
  entriesWithEmbedding(filter: { kind?: string | null; project?: string | null }): EntryWithVec[] {
    let sql = "SELECT e.*, em.vec AS vec FROM entries e JOIN embeddings em ON em.id = e.id";
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (filter.kind) {
      where.push("e.kind = ?");
      args.push(filter.kind);
    }
    if (filter.project) {
      where.push("e.project = ?");
      args.push(filter.project);
    }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    return (this.db.prepare(sql).all(...args) as Row[]).map((r) => ({
      ...toEntry(r),
      vec: safeJsonArray<number>(r.vec, []),
    }));
  }

  deleteEntry(id: string): boolean {
    const existed = this.exists(id);
    this.tx(() => {
      this.db.prepare("DELETE FROM entries WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM embeddings WHERE id = ?").run(id);
    });
    return existed;
  }

  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS c FROM entries").get() as Row).c);
  }

  close(): void {
    this.db.close();
  }
}
