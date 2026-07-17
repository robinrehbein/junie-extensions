# Knowledge

You have a **cross-session knowledge store** backed by the `knowledge` MCP server (SQLite +
embeddings). It holds distilled facts about this project and codebase so you stop re-reading large
files and re-deriving the same things every session.

The dividing line with `~/.junie/memory/` is sharp and **non-overlapping**:

- **`junie-memory`** (`user` · `feedback` · `reference`) — the always-present persona layer: who the
  user is, their preferences, and how they want you to work. Injected into almost every prompt, so
  it stays tiny.
- **`junie-knowledge`** (`project` · `codebase` · `recap`) — this store: technical knowledge an
  agent should _look up_ on demand to save tokens — module maps, API contracts, decisions, session
  handoffs.

`project` is **the** home for durable project facts, decisions, and gotchas — never memory.

## Search — on demand, before you read

Call `search_knowledge({ query, project?, kind?, k? })` (semantic top-k, default `k=5`) **instead
of** re-reading a file or re-tracing code, when:

- at the **start of a task** that touches a module you don't fully recall;
- **before re-opening a large file** — a compressed note may already answer it;
- you need a decision or rationale ("why does X do Y") that isn't in a comment.

Scope with `kind` (`project` | `codebase` | `recap`) and `project` (the project id / cwd) to keep
results precise and avoid cross-project leakage. Don't call it reflexively — only when you'd
otherwise read code or dig through history.

## Fetch by id — same session only

`get_knowledge({ id })` fetches one entry by its exact `id`. Only pass an `id` **you received
earlier in this same session** — from a `save_knowledge` / `search_knowledge` / `list_knowledge`
result. A `get` on an `id` that isn't in the store returns `{ found: false }` (the entry isn't
lost — the id was wrong).

To **recover a prior session's recap** (whose `id` the current session never saw), don't guess an
id: run `search_knowledge` / `list_knowledge` first, then `get_knowledge` on the id they return.
`search` already returns the full body, so a separate `get` is usually unnecessary.

## Save — after you distil

When you learn something durable, call `save_knowledge({ kind, title, body, tags?, project? })`.
Distilling at save time is where the tokens are saved (see **Distil honestly** below).

Save when you've:

- **codebase** — mapped a module, or captured an API contract / data flow you'll likely need again;
- **project** — learned a durable fact, gotcha, or decision not derivable from the code or comments;
- **recap** — at **session end**, record what was done and the open threads so the next session
  starts warm.

Always set `project` (e.g. the repo / cwd) so search can scope to it. If `save_knowledge` returns a
`dedup_hint`, prefer **updating** the existing entry (pass its `id`) over creating a duplicate.

## Distil honestly

- `body` is the distilled content — a few lines, not the file. Oversized bodies are truncated.
- Don't dump stack traces, full files, or transient errors.
- One idea per entry; group related ones with `tags`.
