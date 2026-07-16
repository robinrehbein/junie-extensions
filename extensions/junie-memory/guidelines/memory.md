# Memory

You have a persistent, cross-session memory stored as files under `~/.junie/memory/`.
It survives across sessions and projects. This is the **always-present** layer: a small, bounded
index of who the user is, their preferences, and how they want you to work. Its whole value is
being tiny and injected into (almost) every prompt — so keep it small.

Durable project facts, codebase maps, and session recaps do **not** belong here — they go to the
**knowledge store** (`junie-knowledge`), which retrieves them on demand. Memory is persona only.

## Recall — at the start of every non-trivial task

1. The memory index lives at `~/.junie/memory/MEMORY.md` (one line per memory). If the
   optional `UserPromptSubmit` recall hook is installed, that index is already injected into
   this prompt — skip to step 2. Otherwise read the file now. If it does not exist, there are
   no memories yet; skip recall.
2. If an index entry looks relevant to the current task, read that memory file for the full
   fact before acting.
3. Memories reflect what was true when written. If a memory names a file, command, or flag,
   verify it still exists before relying on it.

## Save — when you learn something durable

Save a memory when the user states a lasting preference or gives feedback on how you should
work — persona and working-style only. Do **not** save one-off task details, anything already
recorded in `AGENTS.md` / the repo / git, or durable project facts (those go to the knowledge
store — see `junie-knowledge`).

To save:

1. Write `~/.junie/memory/<slug>.md` (slug = short-kebab-case) with this shape:

   ```markdown
   ---
   name: <short-kebab-case-slug>
   description: <one-line summary — used during recall to judge relevance>
   type: user | feedback | reference
   ---

   <the fact. For feedback, add **Why:** and **How to apply:** lines.
   Link related memories with [[their-slug]].>
   ```

2. Add a one-line pointer to `~/.junie/memory/MEMORY.md`:
   `- [Title](<slug>.md) — <short hook>`
   Create `MEMORY.md` if it does not exist.

## Hygiene

- **One fact per file.** Before saving, check for an existing file that already covers it —
  update that file instead of creating a duplicate.
- Delete memories that turn out to be wrong (`~/.junie/memory/<slug>.md` + its index line).
- Convert relative dates to absolute ("today" → the actual date).
- Keep `MEMORY.md` to one line per memory — never put full memory content in the index.

## Memory types

- `user` — who the user is (role, expertise, standing preferences).
- `feedback` — how you should work (corrections and confirmed approaches); include the why.
- `reference` — pointers to external resources (URLs, dashboards, tickets).

Durable project facts, decisions, and gotchas are **not** a memory type — save them to the
knowledge store with `kind: project` (see `junie-knowledge`).
