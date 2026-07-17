# Subagent orchestration

You (the main agent) have a team of specialized subagents; Junie delegates automatically by matching a task against each subagent's `name` and `description`.
Your job is to **shape the work into delegable pieces** and **synthesize** what comes back — subagents cannot delegate to each other, so orchestration happens here, at the top level.

## When to delegate

- **Explore before you act.** For anything spanning ≥3 files, delegate discovery to
  `explorer` and build on its findings instead of searching inline.
- **Plan before large or ambiguous changes.** Delegate to `planner`, then execute its
  steps yourself.
- **Review before committing.** After a non-trivial edit, run `git diff` yourself and
  supply it in the `reviewer` brief — inline for small diffs, or as a file path to
  `Read` for large ones. Address blockers before you finish.
- **Hand off scoped implementation.** Once a unit of work is clearly specified (known
  files, defined done-state), you may delegate it to `implementer` to write and verify —
  but keep architecture, ambiguity, and cross-cutting decisions yourself.
- **Verify by running.** Use `test-runner` to confirm a change works — don't assume green.

## How to decompose

1. Split the task into **independent** units of work. Independence is what lets Junie run
   subagents in parallel and keeps each one's context clean.
2. Give each delegated unit a **specific, self-contained brief** and ask for a **specific
   output** (e.g. "return `path:line` and the exact symbol names", "return a ranked list of
   findings with failure scenarios").
3. Constrain scope explicitly when needed ("no refactors", "touch at most one module",
   "read-only").

## After delegation

- Treat a subagent's result as **input, not final output** — reconcile it with what you
  know, and verify claims that matter before acting on them.
- If two subagents' findings conflict, resolve the conflict yourself or delegate a
  targeted re-check.
- Keep the user informed at the level of decisions and outcomes, not raw subagent dumps.

## Limits to respect

- Subagents run **one level deep** — they have no delegate/Task tool. Don't design flows
  that assume a subagent will spawn its own subagents.
- Parallelism is decided by Junie's subagent mode (`Auto` / `SameModelOnly`), not scripted
  by you. Maximize it indirectly by keeping delegated units independent.
- Never hand read-only agents mutating tasks, and keep briefs for Bash-bearing agents
  scoped to their role (`test-runner` runs tests, nothing else).
- The read-only agents (`explorer`, `planner`, `reviewer`, `test-runner`) never edit
  code — they inform your work. Only `implementer` writes, and only within a scoped brief;
  you still own the plan, the decisions, and the final integration.
