# junie-knowledge

A cross-session **knowledge store** for Junie CLI that cuts agent token usage. It pairs an
auto-loaded guideline (when to search / when to save / distil to a few lines) with a shared
**MCP server** that does the heavy lifting: SQLite storage + local embeddings + semantic top-k
retrieval.

The mechanism, in one line: **distil at save time, recall on demand.** The agent compresses a fact
to a few lines when saving, and searches for the relevant slice only when it would otherwise re-read
a file or re-trace code — so it stops burning tokens rediscovering the same things every session.

## What's inside

| Piece | Type | Purpose |
|-------|------|---------|
| `knowledge` | guideline | Auto-loaded into every task. Tells the agent to `search_knowledge` before re-reading large files and `save_knowledge` (distilled) after learning durable facts. |
| `/knowledge` | slash command | List, search, inspect, and clean up entries. |
| `knowledge` | MCP server | Owns the store. See [`../../servers/knowledge-mcp/`](../../servers/knowledge-mcp/). |

Three knowledge kinds, mapped to what you save:

- **`project`** — durable dev facts, gotchas, decisions (the "why").
- **`codebase`** — compressed module maps, API contracts, data flow (avoid re-reading whole files).
- **`recap`** — session handoff: what was done, open threads.

## Relationship to `junie-memory`

They're complementary and **non-overlapping by construction** — each fact has exactly one home:

- **`junie-memory`** (`user` · `feedback` · `reference`) — the **always-present** layer: a small
  file convention (`~/.junie/memory/`) for persona / preferences / working-style, whose index is
  injected into almost every prompt. No server.
- **`junie-knowledge`** (`project` · `codebase` · `recap`) — this store: a server-backed,
  **on-demand** semantic layer for durable project facts, codebase maps, and session recaps.

The one-line rule: persona / preferences / working-style → memory; durable project facts,
decisions, codebase maps, and session recaps → knowledge. `project` facts live **only** here.

## One-time setup: register the MCP server

Junie loads MCP servers from `~/.junie/mcp/mcp.json` (user scope) or
`<project>/.junie/mcp/mcp.json` (project scope), under `mcpServers`. The server lives in this repo
at [`../servers/knowledge-mcp/`](../servers/knowledge-mcp/). Register it with the **absolute path**
on your machine:

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "deno",
      "args": ["run", "-A", "/absolute/path/to/junie-extensions/servers/knowledge-mcp/src/index.ts"]
    }
  }
}
```

The default embedding provider is **local** (`all-MiniLM-L6-v2`, offline, free — first run downloads
~25MB). To use an API provider instead, add an `env` block. Full provider/env reference is in the
[server README](../servers/knowledge-mcp/README.md#embedding-providers-configurable-local-default):

```json
"env": { "KNOWLEDGE_EMBED_PROVIDER": "openai", "OPENAI_API_KEY": "sk-..." }
```

Then install the extension:

```
/extensions install junie-knowledge
```

The guideline auto-loads on the next task; `/knowledge` browses the store.

## Other agents (next step)

The MCP server is shared by design — Claude Code and Pi reuse the **same server**, no logic
duplicated:

- **Claude Code** — register it in `.mcp.json` (project) or `~/.claude.json`, and add the
  search/save protocol to `CLAUDE.md` (mirroring this guideline).
- **Pi** — register it via the `.pi` mcp-gateway, and add a short skill describing when to
  search/save.

Each agent only needs its own thin glue; the store and retrieval stay in one place.

## Design notes

- **On-demand recall.** Knowledge is never injected per-prompt — the agent calls `search_knowledge`
  only when it's about to read code. Auto-injecting would add tokens, working against the goal.
- **Distillation is enforced.** `body` over a few thousand characters is truncated with a hint; the
  guideline requires few-line bodies.
- **Single-user scale.** Retrieval is in-memory cosine (no `sqlite-vec` native dep); the ceiling is
  marked in the server with a `ponytail:` comment for a future drop-in upgrade.
