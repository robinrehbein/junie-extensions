# Memory

You have a persistent, cross-session memory stored as files under `~/.junie/memory/`.
It survives across sessions and projects. This is the **always-present** layer: a small, bounded
index of who the user is, their preferences, and how they want you to work. Its whole value is
being tiny and injected into (almost) every prompt — so keep it small.

Durable project facts, codebase maps, and session recaps do **not** belong here — they go to the
**knowledge store** (`junie-knowledge`), which retrieves them on demand. Memory is persona only.

## Recall — at the start of every non-trivial task

Read `~/.junie/memory/MEMORY.md` (one line per memory; if the optional `UserPromptSubmit` recall
hook is installed it's already injected — skip the read). If an entry looks relevant, open its
`<slug>.md` for the full fact, and verify any file/command/flag it names still exists before
relying on it.

## Save — when you learn something durable

Save a memory when the user states a lasting preference or gives feedback on how you should
work — persona and working-style only. Do **not** save one-off task details or anything already
recorded in `AGENTS.md` / the repo / git.

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
