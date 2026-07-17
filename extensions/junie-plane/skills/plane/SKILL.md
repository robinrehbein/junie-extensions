---
name: plane
description: Issue and ticket tracking via the self-hosted Plane REST API (https://plane.join-noah.de). Use the scripts/plane.sh helper to fetch, create, move, and comment on issues and cycles. Replaces the broken Plane MCP. Use whenever reading or updating Plane tickets.
---

# Plane (issue & ticket tracking)

Self-hosted Plane at **https://plane.join-noah.de**, workspace slug **`noah`**. Three projects:
**PROD** (product), **DEV** (engineering — default), **FND** (founding). All access goes through
`scripts/plane.sh` (curl + jq) — **no MCP**.

Copy this extension's `scripts/plane.sh` into `<project>/scripts/` before first use — the commands
below call it from the project root.

## Configuration (environment)

| Variable          | Default                      | Notes                                                   |
| ----------------- | ---------------------------- | ------------------------------------------------------- |
| `PLANE_API_KEY`   | —                            | **Required.** Generate in Plane → Profile → API Tokens. |
| `PLANE_BASE_URL`  | `https://plane.join-noah.de` |                                                         |
| `PLANE_WORKSPACE` | `noah`                       | workspace slug                                          |
| `PLANE_PROJECT`   | `DEV`                        | default project: `PROD` \| `DEV` \| `FND` \| `<uuid>`   |

Project UUIDs: `PROD=031c984b-1609-4dce-bf38-cd9c47c40cfe`,
`DEV=56fb4930-19e3-4fee-8ec6-8959367d6ba1`, `FND=1bbd88f5-7007-4c5d-b95b-31fdd12709f3`. DEV default
assignee: Robin `714ee8f1-463f-4c9d-bae3-22cc007ccc1d`.

## Ticket references

Refs are **project-prefixed sequence IDs**: `DEV-123`, `PROD-45`, `FND-7`. A bare number uses the
default project; a full UUID is also accepted. The old `NOAH-xxx` convention is **stale** — the
workspace was migrated from a single NOAH project on 2026-05-08.

## Commands (via `scripts/plane.sh`)

```bash
scripts/plane.sh projects                              # list projects
scripts/plane.sh states [DEV]                          # state name [group] | uuid
scripts/plane.sh issues [DEV]                          # <seq> | <state> | <name>
scripts/plane.sh issue DEV-123                         # full ticket digest (desc + acceptance criteria)
scripts/plane.sh comments DEV-123                      # thread
scripts/plane.sh comment DEV-123 "PR: https://codeberg.org/.../pulls/42"
scripts/plane.sh move DEV-123 "In Progress"            # move state
scripts/plane.sh create-issue DEV --name "[Send Money] API: Create Transfer" \
    --state "Todo" --priority high --assignee 714ee8f1-463f-4c9d-bae3-22cc007ccc1d
scripts/plane.sh update-issue DEV-123 --priority urgent
scripts/plane.sh cycles DEV                            # sprint cycles
scripts/plane.sh raw GET "/projects/56fb4930-19e3-4fee-8ec6-8959367d6ba1/issues/"   # escape hatch
```

## States (same 5 across all projects; UUIDs differ per project)

| State       | Group     | Use for                   |
| ----------- | --------- | ------------------------- |
| Backlog     | backlog   | Not planned               |
| Todo        | unstarted | Planned, waiting          |
| In Progress | started   | Currently being worked on |
| Done        | completed | Merged & verified         |
| Cancelled   | cancelled | No longer needed          |

There is **no** "In Review" state — keep a ticket `In Progress` while its PR is open; move to `Done`
only after the PR is merged. Always comment the PR URL on the ticket when opening it.

## Workflow usage

1. **Start work**: `scripts/plane.sh move <ref> "In Progress"` + comment "Starting work".
2. **Open PR**: comment the Codeberg PR URL on the ticket (`scripts/plane.sh comment`).
3. **Merge**: `scripts/plane.sh move <ref> "Done"` + a one-line summary comment.

## Notes

- Self-hosted Plane **silently ignores** list filters (`state`/`search`), so `issues` fetches the
  full set and filters client-side. Rate limit ~60 req/min — avoid tight loops.
- Direct REST base: `https://plane.join-noah.de/api/v1/workspaces/noah/projects/{PROJECT_ID}`,
  header `X-API-Key: $PLANE_API_KEY`.
- DEV issue naming: `[Feature] Layer: Short Description` (e.g.
  `[Send Money] API: Create Transfer Endpoint`).
