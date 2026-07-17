# junie-goal-loop

Claude-Code-style **`/goal`** and **`/loop`** for Junie CLI — a persistent objective that drives
a self-revising plan, and an iterate-until-done loop.

## What it gives you

- **`/goal <objective>`** — sets the active goal for the current project and writes a first-cut
  plan to `<project>/.junie/goal.md`.
  - **`/goal`** — shows goal, checklist progress (X/Y), the current step, and any blocker.
  - **`/goal clear`** — removes the active goal.
- **`/loop <prompt|criteria>`** — runs a **self-judge loop**: do one focused work pass, evaluate
  every success criterion as *met*/*not met* with evidence, and repeat until all are met or you
  stall. If a goal is active, the loop reuses its `Success criteria`.

## Why "dynamic" checklist

The plan in `.junie/goal.md` is a living document. Every turn the agent: does the next step,
ticks it off, then **edits the checklist in place** — adding, splitting, removing, or reordering
items — when the real work reveals more, fewer, or different steps than first planned. The goal
statement stays stable; the path to it adapts.

## How it maps to Junie's model

No MCP, no scripts — just:

- **`guidelines/goal-loop.md`** — auto-loaded. It is a no-op when no `.junie/goal.md` exists, so
  it stays quiet in projects that don't use it.
- **`commands/goal.md`**, **`commands/loop.md`** — the two slash commands.

The loop is in-process (self-judge), not a nested `junie -p`: the agent works → judges → repeats
within one session, bounded by an 8-iteration cap and a "no-progress ⇒ stop" rule.

## Example

```
/goal ship the login screen with rate-limited retries and a passing e2e
… agent derives criteria + plan, works step by step, revises plan as it finds edge cases …
/loop                          # converge any remaining criteria, judging each with evidence
/goal                          # status: 5/5 criteria met — done
/goal clear                    # done, remove the goal file
```

State lives at `<project>/.junie/goal.md` and is project-scoped.
