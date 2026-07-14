---
description: List and clean up long-term memories in ~/.junie/memory/
---

Manage the long-term memory store at `~/.junie/memory/`.

1. Read `~/.junie/memory/MEMORY.md` and present the memories grouped by `type`
   (`user` / `feedback` / `project` / `reference`). If the store is empty or missing, say so
   and stop.
2. Offer to inspect a specific memory (read its `~/.junie/memory/<slug>.md`) or to clean up
   stale, duplicate, or wrong entries.
3. Never delete a memory without first confirming exactly which one. When deleting, remove
   both the `<slug>.md` file and its line in `MEMORY.md`.
