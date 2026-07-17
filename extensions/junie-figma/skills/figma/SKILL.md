---
name: figma
description: Pull a Figma design into context from its share URL. Use when the user pastes a figma.com link (with a node-id) or asks to build/recreate/inspect a screen, component, or layout from a Figma design. Backed by the `figma` MCP server (Figma REST API + a Personal Access Token) since the remote Figma MCP 403s Junie.
---

# Figma (design → context via REST API + PAT)

When a Figma link is in play, use the **`figma` MCP server** tools to read the design, then
implement it following the project's existing UI conventions. This replaces the remote Figma MCP,
which rejects Junie at OAuth (`DCR failed with 403 Forbidden` — Junie isn't on Figma's client
allowlist).

## Tools

- `get_figma_design({ url, depth? })` — the design spec: the node tree (layout, styles, text, fills,
  components) for the frame in the URL. This is the primary tool.
- `get_figma_image({ url, format?, scale? })` — a signed PNG/SVG/JPG/PDF render URL for the frame.
  Use it to also see the design visually. URLs expire (~30 days).

Both take the **raw Figma URL the user pasted** — pass it through unchanged. The server handles
parsing (file key + node-id) and the dash→colon node-id normalization.

## When to use

- The user pastes a `figma.com/design/...` (or `/file/`, `/proto/`) URL and wants the design.
- The user says "implement / recreate / match this screen" and supplies a Figma link.
- You need layout, spacing, colors, type, or component structure for a design.

Don't use it for a plain web URL or a non-Figma asset — the parser rejects non-`figma.com` hosts.

## Workflow

1. **Confirm the link has a `node-id`.** If `?node-id=…` is missing, ask the user to copy a link to
   the specific frame (Figma → right-click frame → _Copy/paste as → Copy link to selection_). A
   file-level link has no frame and can't be fetched.
2. **Fetch the spec** with `get_figma_design({ url })`. For a large frame, pass `depth` (2–4) first
   to get an overview, then deepen if needed — the node tree can be big.
3. **Optionally get a render** with `get_figma_image({ url })` if a visual helps you match it.
4. **Implement** following the project's UI stack (e.g. Jetpack Compose + Material 3 for this
   Android project), reusing existing theme tokens / components rather than hardcoding values.

## Notes

- Auth is a **Personal Access Token** passed as `FIGMA_TOKEN` in the server's MCP config — no OAuth,
  no allowlist. If a call fails with 401/403, the token is wrong or can't see the file; tell the
  user to regenerate a PAT with read access to that file.
- Render URLs from `get_figma_image` are signed and expire — don't store them long-term.
