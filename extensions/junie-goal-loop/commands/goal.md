---
description: Set / show / clear a persistent goal with a dynamic checklist
---

`/goal` manages the active goal for this project, stored in `<project>/.junie/goal.md`.

Interpret the argument:

- **No argument** (`/goal`): read `.junie/goal.md` and report status — the goal, checklist progress
  (X/Y done), the current step, and any blocker. If no goal file exists, say "No active goal" and
  stop.
- **`clear`** or **`off`** (`/goal clear`): delete `.junie/goal.md` and confirm in one line that the
  goal is cleared. Stop.
- **Anything else** (`/goal <objective>`): set or replace the active goal.

When setting a goal:

1. Write `<project>/.junie/goal.md` (create `.junie/` if missing) with: the objective, an initial
   `Success criteria` list (observable, checkable conditions), and a first-cut `Plan` checklist. The
   plan is a living document — expect to revise it as you work.
2. Start on the first step now.

Follow the goal-loop guideline for how to maintain and advance the checklist while you work.
