// One-shot importer: moves legacy `type: project` memories (the part of junie-memory that now
// overlaps junie-knowledge) into the knowledge store as `kind: project`.
//
// Reuses KnowledgeStore + selectEmbedder directly — no MCP stdio round-trip, no new deps.
// Dry-run by default; pass --commit to write the store and remove the migrated memory files +
// their MEMORY.md index lines. Clean no-op if there are no `type: project` memories.
//
//   deno task migrate-memory            # dry run (default)
//   deno task migrate-memory --commit   # migrate + clean up
//   deno task migrate-memory --selfcheck
import { KnowledgeStore, type Entry } from "./db.ts";
import { selectEmbedder } from "./embeddings.ts";
import { tokenEstimate } from "./tools.ts";

interface ParsedMemory {
  slug: string;
  path: string;
  type: string;
  title: string;
  body: string;
}

interface Plan {
  migrate: Array<{ mem: ParsedMemory; id: string }>;
  already: ParsedMemory[]; // idempotency skip: knowledge already has this id
}

function memoryDir(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return Deno.env.get("JUNIE_MEMORY_DIR") ?? `${home}/.junie/memory`;
}

/** Minimal YAML frontmatter parser: the block between the first two `---` fences. */
export function parseFrontmatter(
  text: string,
): { fm: Record<string, string>; body: string } | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (key) fm[key] = val;
  }
  return { fm, body: m[2].trim() };
}

/** Read + parse every `*.md` in the memory dir (skipping `MEMORY.md`). Malformed → warn + skip. */
export function listMemories(dir: string): ParsedMemory[] {
  const out: ParsedMemory[] = [];
  let entries: Deno.DirEntry[];
  try {
    entries = Array.from(Deno.readDirSync(dir));
  } catch {
    return out; // dir missing → nothing to migrate
  }
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith(".md") || e.name === "MEMORY.md") continue;
    const path = `${dir}/${e.name}`;
    const slug = e.name.replace(/\.md$/, "");
    let parsed: ReturnType<typeof parseFrontmatter>;
    try {
      parsed = parseFrontmatter(Deno.readTextFileSync(path));
    } catch {
      console.warn(`  ! skip ${e.name}: unreadable`);
      continue;
    }
    if (!parsed) {
      console.warn(`  ! skip ${e.name}: no frontmatter`);
      continue;
    }
    const type = parsed.fm.type ?? "";
    const title = parsed.fm.description ?? parsed.fm.name ?? slug;
    out.push({ slug, path, type, title, body: parsed.body });
  }
  return out;
}

/** Route: only `type: project` memories migrate; a deterministic id makes re-runs idempotent. */
export function buildPlan(store: KnowledgeStore, memories: ParsedMemory[]): Plan {
  const migrate: Plan["migrate"] = [];
  const already: ParsedMemory[] = [];
  for (const mem of memories) {
    if (mem.type !== "project") continue;
    const id = `mem:${mem.slug}`; // stable across runs → skip if already present
    if (store.exists(id)) already.push(mem);
    else migrate.push({ mem, id });
  }
  return { migrate, already };
}

/** Find MEMORY.md index lines pointing at the given slugs (`- [Title](<slug>.md) — …`). */
function indexLinesToRemove(dir: string, slugs: string[]): string[] {
  let text: string;
  try {
    text = Deno.readTextFileSync(`${dir}/MEMORY.md`);
  } catch {
    return [];
  }
  return text.split(/\r?\n/).filter((line) => slugs.some((s) => line.includes(`](${s}.md)`)));
}

async function main(commit: boolean): Promise<void> {
  const dir = memoryDir();
  const memories = listMemories(dir);
  if (!memories.length) {
    console.log(`No memory files found in ${dir} — nothing to migrate.`);
    return;
  }

  const store = new KnowledgeStore();
  const { migrate, already } = buildPlan(store, memories);
  const projectSlugs = [...migrate.map((m) => m.mem.slug), ...already.map((m) => m.slug)];
  const removeIndex = indexLinesToRemove(dir, projectSlugs);

  console.log(`Scanned ${memories.length} memory file(s) in ${dir}`);
  console.log(`  project memories to migrate: ${migrate.length}`);
  console.log(`  already migrated (skip):      ${already.length}`);

  if (projectSlugs.length === 0) {
    console.log("No `type: project` memories — nothing to do.");
    store.close();
    return;
  }

  if (migrate.length) {
    // Embed only when committing — dry-run just reports the plan (no model download, offline).
    const embedder = commit ? selectEmbedder() : null;
    for (const { mem, id } of migrate) {
      if (commit && embedder) {
        const [vec] = await embedder.embed([`${mem.title}\n${mem.body}`]);
        const ts = new Date().toISOString();
        const entry: Entry = {
          id,
          kind: "project",
          title: mem.title,
          body: mem.body,
          tags: ["migrated:memory"],
          project: null,
          source: "migrated:memory",
          token_est: tokenEstimate(mem.body),
          created_at: ts,
          updated_at: ts,
        };
        store.saveEntry(entry, vec);
      }
      console.log(`  ${commit ? "migrated" : "would migrate"}  ${mem.slug}  →  knowledge id ${id}`);
    }
  }

  console.log("\nMemory cleanup (run with --commit to apply):");
  for (const slug of projectSlugs) console.log(`  - delete ${dir}/${slug}.md`);
  for (const line of removeIndex) console.log(`  - MEMORY.md:  ${line}`);

  if (!commit) {
    store.close();
    console.log("\nDry run — no changes written. Re-run with --commit to migrate + clean up.");
    return;
  }

  for (const slug of projectSlugs) {
    try {
      Deno.removeSync(`${dir}/${slug}.md`);
    } catch { /* already gone */ }
  }
  if (removeIndex.length) {
    const text = Deno.readTextFileSync(`${dir}/MEMORY.md`);
    const kept = text.split(/\r?\n/).filter((l) => !removeIndex.includes(l)).join("\n");
    Deno.writeTextFileSync(`${dir}/MEMORY.md`, kept);
  }
  store.close();
  console.log(`\nDone: ${migrate.length} migrated, ${projectSlugs.length} memory file(s) removed.`);
}

/** Assert-based runnable check: parse + filter + idempotency. No network/embedder needed. */
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("✗ " + msg);
    Deno.exit(1);
  }
  console.log("✓ " + msg);
}

export function selfcheck(): void {
  const tmp = Deno.makeTempDirSync();
  Deno.env.set("JUNIE_MEMORY_DIR", tmp);
  Deno.env.set("KNOWLEDGE_DB", `${tmp}/test.db`);

  Deno.writeTextFileSync(
    `${tmp}/proj-widget.md`,
    "---\nname: proj-widget\ndescription: Widget pipeline runs nightly\ntype: project\n---\n\nThe widget pipeline runs at 02:00 UTC.\n",
  );
  Deno.writeTextFileSync(
    `${tmp}/fb-style.md`,
    "---\nname: fb-style\ndescription: Keep diffs small\ntype: feedback\n---\n\nKeep diffs small.\n",
  );
  Deno.writeTextFileSync(`${tmp}/notes.md`, "no frontmatter here\n");
  Deno.writeTextFileSync(
    `${tmp}/MEMORY.md`,
    "- [Widget pipeline runs nightly](proj-widget.md) — nightly widget run\n- [Keep diffs small](fb-style.md) — working style\n",
  );

  const memories = listMemories(tmp);
  assert(memories.length === 2, "parses 2 memories, skips malformed (no frontmatter)");

  const store = new KnowledgeStore();
  const plan1 = buildPlan(store, memories);
  assert(plan1.migrate.length === 1, "routes the 1 project memory to migrate");
  assert(plan1.migrate[0].mem.slug === "proj-widget", "picks the project file (proj-widget)");
  assert(!plan1.migrate.some((m) => m.mem.type !== "project"), "leaves non-project memories alone");
  assert(plan1.migrate[0].id === "mem:proj-widget", "uses a stable deterministic id");

  const lines = indexLinesToRemove(tmp, ["proj-widget"]);
  assert(lines.length === 1 && lines[0].includes("proj-widget.md"), "finds the MEMORY.md line to drop");

  // Idempotency: once the id is present in the store, a re-run skips it (→ already), not migrate.
  const ts = new Date().toISOString();
  store.saveEntry(
    { id: "mem:proj-widget", kind: "project", title: "x", body: "x", tags: [], project: null, source: "migrated:memory", token_est: 1, created_at: ts, updated_at: ts },
    [0.1, 0.2],
  );
  const plan2 = buildPlan(store, memories);
  assert(plan2.migrate.length === 0 && plan2.already.length === 1, "re-run is idempotent (skips migrated id)");

  store.close();
  try {
    Deno.removeSync(tmp, { recursive: true });
  } catch { /* best effort */ }
  console.log("\nmigrate-memory self-check passed.");
}

if (import.meta.main) {
  const args = new Set(Deno.args);
  if (args.has("--selfcheck")) selfcheck();
  else await main(args.has("--commit"));
}
