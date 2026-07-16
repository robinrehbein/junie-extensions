# junie-plane

Drive a **self-hosted Plane** issue/ticket tracker from Junie CLI via a thin
`scripts/plane.sh` helper (plain `curl` + `jq`). No MCP server — the old Plane MCP
was broken in this setup, so the helper does the REST calls directly.

## What's inside

| Piece | Type | Purpose |
|-------|------|---------|
| `plane` | skill | Auto-invoked when working with tickets/Plane. Documents the workspace → project → state model and the full `plane.sh` command surface. |
| `scripts/plane.sh` | script | The actual REST client: list/get/create/move issues, comment, update, cycles, raw escape hatch. |

## Activation (per consuming repo)

The skill calls `scripts/plane.sh`, i.e. a script expected at the **repo's**
`scripts/` root (extension-bundled scripts are not auto-exposed on the host). Copy
it in once:

```sh
cp extensions/junie-plane/scripts/plane.sh /path/to/repo/scripts/plane.sh
chmod +x /path/to/repo/scripts/plane.sh
```

Then configure the environment (the script header documents every var):

```sh
export PLANE_API_KEY=...        # Profile → API Tokens in Plane
export PLANE_BASE_URL=https://plane.join-noah.de   # your instance
export PLANE_WORKSPACE=noah                        # workspace slug
export PLANE_PROJECT=DEV                           # default project: PROD|DEV|FND|<uuid>
```

## Design notes

- **No MCP.** MCPs don't currently work in this setup; a `curl`+`jq` helper is
  simpler, debuggable, and dependency-light (`curl`, `jq`).
- **Client-side filtering.** Self-hosted Plane ignores list filters server-side, so
  list/issue lookups fetch then filter with `jq` (mirrors the old MCP behaviour).
- **Noah-specific defaults.** The bundled `plane.sh` ships the Noah workspace slug,
  project UUIDs, and member names for readable output. For another instance, edit the
  `PROJ`/`USER` maps and defaults at the top of the script.
