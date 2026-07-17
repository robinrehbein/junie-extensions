---
description: Save a fact to long-term memory under ~/.junie/memory/
---

The user wants you to remember this: $fact

1. Distill it to a single durable fact. If it is a one-off task detail, or already recorded in
   `AGENTS.md` / the repo, say so and do not save it — ask what was non-obvious about it and save
   that instead.
2. Check `~/.junie/memory/` for an existing file that already covers this. If found, update that
   file rather than creating a duplicate.
3. Otherwise write `~/.junie/memory/<slug>.md` with frontmatter (`name`, `description`,
   `type: user|feedback|reference`) and the fact in the body, and add a one-line pointer to
   `~/.junie/memory/MEMORY.md` (create it if missing).
4. If the fact is a durable project detail, decision, gotcha, codebase map, or session recap,
   **don't** save it to memory — save it to the knowledge store instead (`save_knowledge`, kind
   `project`/`codebase`/`recap`); see `junie-knowledge`.
5. Confirm to the user in one line what you stored and where.

Follow the full protocol in the memory guideline.
