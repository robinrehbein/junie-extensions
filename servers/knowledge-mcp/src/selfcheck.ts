// Runnable self-check: exercises the real store + embeddings + search end-to-end.
// Run: deno task selfcheck   (or: deno run -A src/selfcheck.ts)
// First run downloads the MiniLM model (~25MB) into ~/.junie/knowledge/models.
import { KnowledgeStore, type Entry } from "./db.ts";
import { LocalEmbedder, type Embedder } from "./embeddings.ts";
import { createHandlers } from "./tools.ts";

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    failures++;
    console.error(`  ✗ FAIL: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// Isolate the test in a throwaway DB + model cache so it never touches the real store.
const tmpDb = await Deno.makeTempFile({ prefix: "knowledge-selfcheck-", suffix: ".db" });
const tmpModels = await Deno.makeTempDir({ prefix: "knowledge-models-" });
Deno.env.set("KNOWLEDGE_DB", tmpDb);
Deno.env.set("HF_HOME", tmpModels);

const store = new KnowledgeStore();
const embedder = new LocalEmbedder();
const h = createHandlers(store, embedder);

interface SaveResult {
  id: string;
  truncated?: boolean;
  updated?: boolean;
  dedup_hint?: Array<{ id: string; title: string; score: number }>;
}

interface SearchHit {
  id: string;
  title: string;
  score: number;
}

async function save(args: Record<string, unknown>): Promise<SaveResult> {
  return await h.save_knowledge(args) as SaveResult;
}
async function search(args: Record<string, unknown>): Promise<SearchHit[]> {
  return await h.search_knowledge(args) as SearchHit[];
}

console.log("\n[1/8] save across all three kinds");
const auth = await save({
  kind: "codebase",
  title: "auth module",
  body:
    "Handles user login and authentication. The auth module issues JWT tokens after password " +
    "verification, manages sessions, and guards protected routes via a middleware.",
  tags: ["auth", "security"],
  project: "demo",
});
const payments = await save({
  kind: "codebase",
  title: "payments module",
  body: "Handles billing, invoices, and credit-card processing through the Stripe API.",
  tags: ["billing"],
  project: "demo",
});
const stack = await save({
  kind: "project",
  title: "tech stack",
  body: "This project uses Deno for the server and SQLite for storage. Tests run via deno test.",
  project: "demo",
});
const handoff = await save({
  kind: "recap",
  title: "session handoff",
  body: "Finished wiring the auth flow. Open thread: add refresh tokens; pending review of the payments refund path.",
  project: "other",
});
assert(typeof auth.id === "string", "save returns an id");
assert(store.count() === 4, "store has 4 entries after saves");

console.log("\n[2/8] semantic search ranks the right entry");
const authHits = await search({ query: "how does login work" });
console.log("    top hit:", authHits[0]?.title, "score", authHits[0]?.score);
assert(authHits.length > 0, "search returns hits");
assert(authHits[0]?.id === auth.id, "auth module is the top hit for 'how does login work'");
assert((authHits[0]?.score ?? 0) > 0.2, "top score is meaningfully positive");

console.log("\n[3/8] semantic match (different wording, not substring)");
const signinHits = await search({ query: "how do users sign in and get a token" });
assert(signinHits[0]?.id === auth.id, "auth module matches a differently-phrased login query");

console.log("\n[4/8] kind/project scoping excludes other kinds/projects");
const recapOther = await search({ query: "what was done", kind: "recap", project: "other" });
assert(recapOther.length === 1 && recapOther[0].id === handoff.id, "recap@other returns only the handoff");
const recapDemo = await search({ query: "what was done", kind: "recap", project: "demo" });
assert(recapDemo.length === 0, "recap@demo has no entries (no leakage)");

console.log("\n[5/8] distillation enforcement truncates oversized body");
const longBody = "x".repeat(6000);
const big = await save({ kind: "project", title: "too big", body: longBody, project: "demo" });
assert(big.truncated === true, "oversized body is flagged truncated");
const bigEntry = h.get_knowledge({ id: big.id }) as Entry | null;
assert(bigEntry?.body.length === 4000, "stored body is truncated to MAX_BODY");

console.log("\n[6/8] dedup hint on a near-duplicate");
const dup = await save({
  kind: "codebase",
  title: "authentication module",
  body: "Manages user login, issues JWT tokens after password verification, and guards routes.",
  tags: ["auth", "login"],
  project: "demo",
});
assert(Array.isArray(dup.dedup_hint) && dup.dedup_hint.length > 0, "near-duplicate surfaces a dedup_hint");
assert(dup.dedup_hint?.[0]?.id === auth.id, "dedup_hint points at the existing auth module");

console.log("\n[7/8] update-on-existing-id re-embeds");
const updated = await save({
  id: auth.id,
  kind: "codebase",
  title: "auth module",
  body: "The auth module now supports OAuth2 login in addition to password-based JWT login.",
  project: "demo",
});
assert(updated.updated === true, "saving with an existing id returns updated=true");
const oauthHits = await search({ query: "oauth2 sign in" });
assert(oauthHits[0]?.id === auth.id, "after update, the re-embedded entry matches the new content");

console.log("\n[8/8] delete removes entry + embedding");
const before = store.count();
h.delete_knowledge({ id: payments.id });
assert(store.count() === before - 1, "count drops by one after delete");
assert(store.getEntry(payments.id) === null, "deleted entry is gone");
assert(store.entriesWithEmbedding({}).every((e) => e.id !== payments.id), "embedding row is gone too");

console.log("\n[bonus] list with tag filter");
const authTagged = h.list_knowledge({ tag: "auth" }) as Array<{ tags: string[] }>;
assert(authTagged.length >= 1 && authTagged.every((e) => e.tags.includes("auth")), "tag filter returns only matching entries");

console.log("\n[bonus] cross-kind id collision does not clobber the existing entry");
const stackBefore = h.get_knowledge({ id: stack.id }) as Entry | null;
const countBefore = store.count();
const collide = await save({
  id: stack.id,      // belongs to a `project` entry
  kind: "codebase",  // different kind → must NOT reuse the id
  title: "tech stack (codebase)",
  body: "Attempt to overwrite the project entry as a codebase entry.",
  project: "demo",
});
assert(collide.id !== stack.id, "a colliding id (different kind) gets a fresh id, not a clobber");
const stackAfter = h.get_knowledge({ id: stack.id }) as Entry | null;
assert(stackAfter?.kind === "project" && stackAfter?.body === stackBefore?.body, "original entry is untouched");
assert(store.count() === countBefore + 1, "a new entry is created, not an overwrite");

console.log("\n[bonus] embedder-dimension drift throws instead of silently returning []");
// The store was built by the 384-dim local embedder; re-seed the meta explicitly so this
// case is self-contained, then exercise save/search under a simulated 1536-dim embedder.
store.setMeta("embedder_name", embedder.name);
store.setMeta("embedder_dim", "384");
const dim1536: Embedder = {
  name: "simulated:dim1536",
  dim: 1536,
  embed: () => Promise.reject(new Error("guard must throw before any embed call")),
};
const h1536 = createHandlers(store, dim1536);
async function expectDimMismatch(fn: () => Promise<unknown>, what: string): Promise<void> {
  try {
    await fn();
    assert(false, `${what} throws on embedder dim mismatch`);
  } catch (e) {
    const msg = (e as Error).message;
    assert(
      msg.includes("Embedder mismatch") && msg.includes("384") && msg.includes("1536"),
      `${what} throws the descriptive mismatch error naming both dims`,
    );
  }
}
await expectDimMismatch(
  () => h1536.save_knowledge({ kind: "project", title: "drift", body: "drift" }) as Promise<unknown>,
  "save_knowledge under a 1536-dim embedder",
);
await expectDimMismatch(
  () => h1536.search_knowledge({ query: "drift" }) as Promise<unknown>,
  "search_knowledge under a 1536-dim embedder",
);
const stillOk = await search({ query: "login" });
assert(stillOk.length > 0, "search with the matching embedder still works after the mismatch checks");

store.close();
Deno.removeSync(tmpDb);
Deno.removeSync(tmpModels, { recursive: true });

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) FAILED`);
  Deno.exit(1);
}
console.log("✅ all knowledge-mcp self-checks passed");
