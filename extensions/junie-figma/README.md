# junie-figma

Figma design access for Junie CLI. Paste a Figma link and Junie pulls the design — backed by a local
MCP server (`figma`) that calls Figma's REST API with a **Personal Access Token**.

This is the workaround for the remote Figma MCP (`https://mcp.figma.com/mcp`) refusing Junie at
OAuth (`DCR failed with 403 Forbidden` — Junie isn't on Figma's client allowlist of Cursor / VS Code
/ Claude Code / Codex / Xcode). A PAT has **no** client allowlist, so it works where the remote
server 403s.

## What's inside

| Piece   | Type       | Purpose                                                                                                                       |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `figma` | skill      | Auto-invoked when a Figma link is pasted or a design→code task starts. Tells the agent to call the `figma` MCP tools and how. |
| `figma` | MCP server | Owns the Figma calls. See [`../../servers/figma-mcp/`](../../servers/figma-mcp/).                                             |

## One-time setup

1. **Create a Figma Personal Access Token** (Settings → Account → Personal access tokens) and
   register the MCP server. Full steps are in the
   [server README](../../servers/figma-mcp/README.md#one-time-setup). In short, add to
   `<project>/.junie/mcp/mcp.json` (project scope):

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

2. **Install the extension:**

   ```
   /extensions install junie-figma
   ```

3. **Verify** with `/mcp` — the `figma` server should be **Active**.

## Use

Paste a Figma link that includes a `node-id` and ask for the design, e.g.:

> Implement this screen in Compose:
> https://www.figma.com/design/oZbZewuJDrJLXBBKgXLKVb/Noah?node-id=1123-747

The agent calls `get_figma_design` (node tree) and, if useful, `get_figma_image` (a render), then
implements it. If the link has no `node-id`, the agent asks for a frame-level link.

## Design notes

- **PAT over OAuth.** Avoids the remote MCP's client allowlist entirely.
- **Skill, not a guideline.** Triggered only when a Figma link / design task is in play — not loaded
  into every prompt.
- **Local server, one repo.** Mirrors `junie-knowledge`'s pattern: a `servers/*-mcp` Deno stdio
  server + a thin extension wrapper that documents and points the agent at it.
