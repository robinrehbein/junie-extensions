# knowledge-mcp

A shared MCP server that owns a **cross-session knowledge store** (SQLite + embeddings) and
exposes tools to save, **semantically search**, and manage distilled knowledge. It is the core
of the `junie-knowledge` extension and is designed so Claude Code and Pi can reuse the **same
server** later.

The token-saving mechanism: knowledge is **distilled to a few lines at save time** and **retrieved
on demand** (top-k semantic search), so an agent stops re-reading large files and re-deriving the
same facts every session.

## Tools

| Tool | Purpose |
|------|---------|
| `save_knowledge` | Distill + store an entry (embeds it). Returns `id`, `token_est`, and a `dedup_hint`. |
| `search_knowledge` | Semantic top-k over the store (default `k=5`). Optional `kind`/`project` scope. |
| `get_knowledge` | Fetch one entry by `id`. |
| `list_knowledge` | List entries, filter by `kind`/`tag`/`project`. |
| `delete_knowledge` | Remove an entry **and its embedding**. |
| `export_knowledge` | Dump the store to Markdown (backup / portability). |

**Kinds:** `project` (durable dev facts / decisions), `codebase` (module maps / API contracts /
data flow), `recap` (session handoff: what was done, open threads).

## Requirements

- **Deno 2.x** (the project runtime). No Node/npm/bun needed.

## Run

```sh
# from this directory
deno task serve
# or directly
deno run -A src/index.ts
```

First run downloads the local embedding model (~25MB) into `~/.junie/knowledge/models`; subsequent
runs are offline.

### Self-check (no test framework — one runnable check)

```sh
deno task selfcheck
```

Saves entries across all three kinds and asserts: top-k retrieval, semantic (non-substring) match,
kind/project scoping, distillation truncation, dedup hint, update-on-existing-id re-embed, and
delete-cleans-embedding. Uses a throwaway DB, so it never touches your real store.

## Storage

- DB: `~/.junie/knowledge/knowledge.db` (override with `KNOWLEDGE_DB`)
- Model cache: `~/.junie/knowledge/models`
- SQLite via Deno's built-in `node:sqlite` — **no native dependency to install**.

> `// ponytail:` the server loads matching embeddings into RAM and ranks them with plain-JS cosine
> similarity. Ceiling is ~tens of thousands of entries (single-user store); swap in `sqlite-vec`
> when the store outgrows it.

## Embedding providers (configurable, local default)

Controlled by env vars:

| Variable | Values | Default |
|----------|--------|---------|
| `KNOWLEDGE_EMBED_PROVIDER` | `local` \| `openai` \| `voyage` \| `zai` | `local` |
| `KNOWLEDGE_EMBED_MODEL` | override the model id | provider default |
| `KNOWLEDGE_SOURCE` | default `source` provenance tag | `junie` |

- **`local`** (default): `@huggingface/transformers` v3 `all-MiniLM-L6-v2`, 384-dim, runs on the
  pure-WASM ONNX backend so nothing native loads under Deno. Offline and free.
  > The v2 `@xenova/transformers` package was rejected: it eagerly loads native `sharp`, which
  > fails to build under Deno.
- **`openai`**: `text-embedding-3-small` (1536-dim). Needs `OPENAI_API_KEY`.
- **`voyage`**: `voyage-3-lite` (512-dim). Needs `VOYAGE_API_KEY`.
- **`zai`**: `embedding-3` (1024-dim). Needs `Z_AI_API_KEY`.

If the provider changes between saves, entries keep their original-dim embeddings; cosine search
silently skips dimension-mismatched candidates instead of returning garbage similarity.

## Register in Junie

Add to `~/.junie/config.json` (`mcpServers`), using the absolute path on your machine:

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

For an API provider instead of local, add an `env` block:

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "deno",
      "args": ["run", "-A", "/.../src/index.ts"],
      "env": { "KNOWLEDGE_EMBED_PROVIDER": "openai", "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```
