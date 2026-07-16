# junie-memory

Cross-session memory for Junie CLI, modeled on how Claude Code implements memory: a
**file convention plus an always-loaded protocol** — not a runtime feature. No server. It is the
**always-present** layer: a small, always-injected index of persona / preferences / working-style.
Durable technical knowledge lives in the companion [`junie-knowledge`](../junie-knowledge/) store.

## What's inside

| Piece | Type | Purpose |
|-------|------|---------|
| `memory` | guideline | Auto-loaded into every task. Tells the agent to recall from the index and persist persona/working-style notes (always-injected small index). |
| `/remember` | slash command | Explicitly save a fact: `/remember fact="…"`. |
| `/memories` | slash command | List, inspect, and clean up stored memories. |

## Storage convention (created at runtime, not shipped)

```
~/.junie/memory/
  MEMORY.md          # index — one line per memory, loaded during recall
  <slug>.md          # one fact per file, with frontmatter (name, description, type)
```

`type` is one of `user` / `feedback` / `reference`. (Durable project facts, codebase maps, and
session recaps live in the **knowledge store** — see [`junie-knowledge`](../junie-knowledge/).)

## How recall works

Junie reads guidelines into **every** task. The bundled `memory` guideline therefore always
sits in context and instructs the agent to read `~/.junie/memory/MEMORY.md` before acting,
then open any relevant memory file. Saving uses the agent's normal Write tool — no special
tool is needed, exactly as in Claude Code.

The guideline is reliable but soft: recall only happens if the model chooses to follow it.
For **guaranteed** recall with zero model discipline, install the eager-recall hook below —
it injects the index into every prompt automatically.

## Eager recall hook (optional, per-machine)

`scripts/recall-memory.sh` prints the memory index to stdout. Junie CLI's `UserPromptSubmit`
hook prepends hook stdout to the prompt as `additionalContext`, so the index is present on
every prompt — recall can no longer be forgotten. It stays light: only the one-line index is
injected; the agent still fetches a specific `<slug>.md` only when an entry is relevant.

Hooks are **not packageable in an extension** — Junie only runs hooks from user
`~/.junie/config.json` (or a file passed with `--config-location`); hooks in a project's
`.junie/config.json` are ignored for safety. So this is a one-time, per-machine setup:

1. Copy the script onto your machine, from this marketplace repo's root:

   ```sh
   mkdir -p ~/.junie/scripts
   cp extensions/junie-memory/scripts/recall-memory.sh ~/.junie/scripts/recall-memory.sh
   chmod +x ~/.junie/scripts/recall-memory.sh
   ```

2. Add the hook to `~/.junie/config.json`:

   ```json
   {
     "hooks": {
       "UserPromptSubmit": [
         {
           "hooks": [
             { "type": "command", "command": "sh ~/.junie/scripts/recall-memory.sh", "timeout": 5 }
           ]
         }
       ]
     }
   }
   ```

`UserPromptSubmit` takes no `matcher` and runs on every prompt, which is exactly what we want.

**One-liner alternative** — skip the script and inject the index directly:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "cat \"$HOME/.junie/memory/MEMORY.md\" 2>/dev/null || true" } ] }
    ]
  }
}
```

Caveats:

- Hooks are an **EAP/nightly** feature; install the Early Access Junie CLI to use them.
- `UserPromptSubmit` fires only in the interactive TUI (not batch/headless/ACP/server). In
  those modes the always-loaded guideline remains the recall fallback.
- Remove the hook at any time — nothing breaks; the guideline still drives recall.

## Design notes

- **Index location.** This extension keeps the index in a separate `MEMORY.md` (clean
  separation, matches Claude Code). Recall then costs one Read per task and depends on the
  agent following the guideline. For guaranteed zero-effort recall, use the
  `UserPromptSubmit` hook above rather than bloating `~/.junie/AGENTS.md` — only the small
  index is injected, not the whole memory store.
- **No MCP, by design.** A file convention is enough for the small persona index. Durable
  project facts, codebase maps, and session recaps belong in the companion **knowledge store**
  ([`junie-knowledge`](../junie-knowledge/)) — a server-backed, semantic, on-demand layer — not
  here, so the always-injected index never bloats the prompt.
- **Guidelines are injected every task.** Extension-bundled guidelines load as reliably as
  `~/.junie/AGENTS.md` (verified: the `memory` guideline is active in every session). The hook
  above then makes recall eager instead of on-demand.
