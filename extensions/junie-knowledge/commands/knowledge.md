---
description: Browse, search, and clean up the cross-session knowledge store
---

Manage the cross-session knowledge store (the `knowledge` MCP server —
`save_knowledge` / `search_knowledge` / `get_knowledge` / `list_knowledge` /
`delete_knowledge` / `export_knowledge`).

1. Call `list_knowledge({ project?: <current project> })` and present the entries grouped by
   `kind` (`project` / `codebase` / `recap`). If the store is empty or missing, say so and stop.
2. Offer to **search** (`search_knowledge`), **inspect** one entry (`get_knowledge`), or
   **delete** a stale/wrong one (`delete_knowledge`).
3. Never delete an entry without first confirming exactly which one — `delete_knowledge` removes
   both the entry and its embedding.
