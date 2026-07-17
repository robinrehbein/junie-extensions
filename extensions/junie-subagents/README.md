# junie-subagents

A curated set of subagents for Junie CLI, modeled on Claude Code's built-in agents, plus a guideline
that teaches the main agent to decompose and delegate — the practical equivalent of Claude Code's
create / process / orchestrate subagent workflow.

## What's inside

| Piece           | Type      | Purpose                                                    | Tools                               |
| --------------- | --------- | ---------------------------------------------------------- | ----------------------------------- |
| `explorer`      | subagent  | Read-only codebase search & mapping                        | Read, Grep, Glob                    |
| `planner`       | subagent  | Read-only architect that returns an implementation plan    | Read, Grep, Glob, WebSearch         |
| `implementer`   | subagent  | Executes one scoped implementation subtask and verifies it | Read, Grep, Glob, Edit, Write, Bash |
| `reviewer`      | subagent  | Read-only review of the current diff for bugs              | Read, Grep, Glob                    |
| `test-runner`   | subagent  | Runs tests and reports failures                            | Read, Grep, Glob, Bash              |
| `orchestration` | guideline | Teaches the main agent when/how to delegate & synthesize   | —                                   |

Four of the five subagents are **read-only with respect to source code**; only `implementer` can
Edit/Write, and only for an already-scoped subtask. This mirrors Claude Code, where the read-only
Explore/Plan agents inform the work and the general-purpose agent carries out scoped implementation.

> **Auto-delegation caveat:** Junie picks a subagent by matching its `description`. A broadly-worded
> agent (especially `implementer`) can hijack delegation for tasks the main agent should keep. Its
> `description` is deliberately narrow — "already-scoped subtask, typically after `planner`". Widen
> it only if you actually want more work routed to it.

## How Junie uses these

Junie delegates **automatically** by matching a task to each subagent's `description` — you do not
(and cannot) invoke a subagent via a slash command. To make delegation reliable, each `description`
states clearly _when_ to use the agent.

Subagents run **one level deep** (they have no delegate tool) and Junie may run independent ones
**in parallel** depending on the Subagents mode in `~/.junie/settings.json` (`Auto` by default). The
`orchestration` guideline is what carries the top-level "decompose → delegate → synthesize"
behavior.

## Trust model

- **Enforced by construction:** `reviewer` is read-only because its tool list has no Bash — it
  cannot run commands at all; the main agent supplies the diff in the brief.
- **Prompt-level only:** `implementer` and `test-runner` keep Bash (`test-runner` needs it to run
  tests); their rules — no `git commit`, no destructive git, no pushing, no installs, no
  network-mutating commands — are instructions, not enforcement. Under `braveMode: "ON"` nothing
  stops a confused agent from ignoring them.

For unattended `braveMode: "ON"` sessions, the lever is Junie's **Action Allowlist** (or keep
command approval on) — user-level enforcement an extension cannot ship.

## Extending it

Add a new subagent by dropping a `agents/<name>.md` file here with YAML frontmatter (`description`
is required). Keep each agent single-purpose and its `description` delegation-friendly ("Delegate to
this agent when …").
