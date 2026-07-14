# junie-memory

Cross-session memory for Junie CLI, modeled on how Claude Code implements memory: a
**file convention plus an always-loaded protocol** — not a runtime feature. No server.

## What's inside

| Piece | Type | Purpose |
|-------|------|---------|
| `memory` | guideline | Auto-loaded into every task. Tells the agent to recall from the index and persist durable facts. |
| `/remember` | slash command | Explicitly save a fact: `/remember fact="…"`. |
| `/memories` | slash command | List, inspect, and clean up stored memories. |

## Storage convention (created at runtime, not shipped)

```
~/.junie/memory/
  MEMORY.md          # index — one line per memory, loaded during recall
  <slug>.md          # one fact per file, with frontmatter (name, description, type)
```

`type` is one of `user` / `feedback` / `project` / `reference`.

## How recall works

Junie reads guidelines into **every** task. The bundled `memory` guideline therefore always
sits in context and instructs the agent to read `~/.junie/memory/MEMORY.md` before acting,
then open any relevant memory file. Saving uses the agent's normal Write tool — no special
tool is needed, exactly as in Claude Code.

## Design notes

- **Index location.** This extension keeps the index in a separate `MEMORY.md` (clean
  separation, matches Claude Code). Recall then costs one Read per task and depends on the
  agent following the guideline. For guaranteed zero-effort recall you could instead embed
  the index inside `~/.junie/AGENTS.md` (always injected) — more invasive, so not the
  default here.
- **No MCP.** A file convention is enough. An MCP server would only add validated writes and
  semantic ranking of recall, which matter only once the store grows large — and even then
  the guideline is still required, because MCP recall is never automatic.
- **Verify on first run.** Confirm that extension-bundled guidelines are injected into every
  task as reliably as `~/.junie/AGENTS.md`. If not, copy the contents of `guidelines/memory.md`
  into your global `~/.junie/AGENTS.md`.
