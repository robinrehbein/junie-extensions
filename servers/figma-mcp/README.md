# figma-mcp

A local MCP server that gives Junie **Figma design access via the REST API + a Personal Access Token
(PAT)** — the same "paste a Figma link, get the design" workflow as the remote Figma MCP, without
OAuth.

## Why this exists

The remote Figma MCP server (`https://mcp.figma.com/mcp`) refuses OAuth registration
(`DCR failed
with 403 Forbidden`) for any client not on Figma's catalog: only Cursor, VS Code,
Claude Code, Codex, and Xcode are allowlisted. **Junie is not on the list**, so the remote server
can't be used.

This server sidesteps OAuth entirely. It talks to Figma's public REST API with a PAT, which has no
client allowlist, and exposes two MCP tools the agent can call with a pasted Figma URL.

## Tools

| Tool                                        | What it returns                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_figma_design({ url, depth? })`         | The full node tree (layout, styles, text, fills, components) for the frame in the URL — the design spec. Pass `depth` (2–4) to keep big frames small. |
| `get_figma_image({ url, format?, scale? })` | A signed PNG/SVG/JPG/PDF render URL for the frame. URLs expire after ~30 days.                                                                        |

The URL is any Figma share link that includes a `node-id`, e.g.
`https://www.figma.com/design/<key>/<title>?node-id=1123-747`. In Figma: right-click the frame →
**Copy/paste as → Copy link to selection** to get a node-specific link.

> Node-id note: Figma share URLs use a dash (`1123-747`); the REST API wants a colon (`1123:747`).
> `parseFigmaUrl` normalizes this — don't pass a hand-edited id.

## One-time setup

1. **Create a PAT.** Figma → Settings → Account → **Personal access tokens** → new token (any scope
   that can read the file; "File content" read is enough). Copy it — it's shown once.

2. **Register the server** in your MCP config, at **project scope**. Junie reads MCP servers from
   `<project>/.junie/mcp/mcp.json`; user scope (`~/.junie/mcp/mcp.json`) is also supported but
   project scope is the recommended default:

   ```json
   {
     "mcpServers": {
       "figma": {
         "command": "deno",
         "args": ["run", "-A", "/absolute/path/to/junie-extensions/servers/figma-mcp/src/index.ts"],
         "env": { "FIGMA_TOKEN": "figd_XXXXXXXXXX" }
       }
     }
   }
   ```

   If `deno` isn't on PATH (e.g. mise-managed), use its absolute path in `command`.

3. **Verify** in Junie: run `/mcp` — the `figma` server should be **Active**.

## Develop / test

```bash
deno task serve        # run the stdio server (what Junie spawns)
deno task selfcheck    # offline URL-parsing checks (+ optional live fetch — see below)
```

`deno check src/index.ts` type-checks the server. The self-check covers the part that breaks — URL
parsing (file key + node-id normalization across `/design`, `/file`, `/proto`, encoded colons,
multi-node, missing node-id, non-Figma hosts). To run the optional **live** end-to-end fetch, export
both `FIGMA_TOKEN` and `FIGMA_SELFTEST_URL=<a figma link you can access>` first.

## Design notes

- **PAT, not OAuth.** The PAT has no client allowlist, so it works where the remote MCP 403s.
- **Two focused tools, one shared parser.** `get_figma_design` and `get_figma_image` reuse a single
  `parseFigmaUrl` + one authed `fetch`; no models, no SDK bloat.
- **`depth` is the cost knob.** A large frame's node tree can be big; the tool description tells the
  agent to pass `depth` to cap recursion and keep the context payload small.
