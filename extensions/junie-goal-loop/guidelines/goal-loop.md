# Goal & Loop — persistent goal, dynamic checklist, self-judge loop

Modeled on Claude Code's `/goal` and `/loop`. Two ideas:

- **`/goal`** sets a north-star objective and a **living checklist** that you revise as the
  real work reveals more, fewer, or different steps than you first planned.
- **`/loop`** runs a **self-judge loop**: do a focused pass, evaluate yourself against explicit
  success criteria, repeat until they're met or you stall.

## Active-goal state

The active goal lives in **one project-scoped file**: `<project>/.junie/goal.md`. It is optional.

- **If the file does not exist**, there is no active goal — do nothing. (Don't create one
  unless `/goal` was used.)
- **If the file exists**, it is your active goal for this task. Read it before you start
  working; its checklist is authoritative for what "done" means.

`goal.md` shape:

```markdown
# Goal

<objective in one or two sentences>

## Success criteria
- [ ] <observable, checkable condition>
- [ ] ...

## Plan (dynamic)
- [x] a finished step
- [ ] the next step
- [ ] ...

## Revisions
- <date>: <what changed about the plan and why>
```

## Working a goal (every turn it's active)

1. Re-read `.junie/goal.md`. Pick the **first unchecked** item in `Plan` — that's the current step.
2. Do that step (and only enough around it to land it).
3. **Re-plan before moving on** — this is the dynamic part:
   - Tick the step you finished (`[x]`).
   - If finishing it revealed **more, fewer, different, or out-of-order** steps than the plan
     assumed, **edit the checklist in place**: add, split, merge, remove, or reorder items.
     Don't carry a stale plan forward.
   - If a success criterion turned out wrong (new one needed, or an old one no longer
     applies), update `Success criteria` the same way.
   - Add a one-line note under `Revisions` whenever the plan materially changes (what + why).
   - Keep the **Goal** statement stable unless the user explicitly redirects it.
4. Write the updated file back. Don't reformat or rewrite sections you didn't change.

Never declare a goal done while any `Success criteria` box is unchecked. When all boxes are
checked, report completion and stop — don't clear the file; let the user `/goal clear` when
they're satisfied.

## `/loop` self-judge loop

`/loop <prompt|criteria>` runs an iterative converge loop:

1. Decide the **success criteria** for this loop:
   - If a goal is active (`.junie/goal.md` exists), use its `Success criteria`.
   - Otherwise distill explicit, checkable criteria from the user's prompt and **state them
     before starting**. If you can't name any, ask — don't loop on vibes.
2. **Repeat, up to 8 iterations** (the cap is a deliberate guard against runaway; override only
   if the user asks for more):
   - a. Do **one focused work pass** toward the next unmet criterion — don't try to finish
        everything in a single pass.
   - b. **Self-judge**: go through each criterion and say *met* or *not met* with one line of
        evidence. "I think it's fine" is not evidence — a passing check, a green test, or a
        concrete artifact is.
   - c. If the pass surfaced new or different steps, revise the plan (`/goal` style) before the
        next iteration.
   - d. If **every criterion is met**, stop and report what you did and the evidence. Don't
        keep looping.
   - e. If an iteration made **no progress on any criterion**, stop — you're stuck, not
        looping. Report the blocker and what you'd try next.
3. If you hit the cap with criteria still unmet, stop and report what's left — don't silently
   keep going.

The cap and the "no-progress ⇒ stop" rule keep a self-judge loop from burning turns.
