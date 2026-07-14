# junie-subagents

A curated set of subagents for Junie CLI, modeled on Claude Code's built-in agents, plus a
guideline that teaches the main agent to decompose and delegate — the practical equivalent
of Claude Code's create / process / orchestrate subagent workflow.

## What's inside

| Piece           | Type | Purpose | Tools |
|-----------------|------|---------|-------|
| `explorer`      | subagent | Read-only codebase search & mapping | Read, Grep, Glob |
| `planner`       | subagent | Read-only architect that returns an implementation plan | Read, Grep, Glob, WebSearch |
| `implementer`   | subagent | Executes one scoped implementation subtask and verifies it | Read, Grep, Glob, Edit, Write, Bash |
| `reviewer`      | subagent | Read-only review of the current diff for bugs | Read, Grep, Glob, Bash |
| `test-runner`   | subagent | Runs tests and reports failures | Read, Grep, Glob, Bash |
| `orchestration` | guideline | Teaches the main agent when/how to delegate & synthesize | — |

Four of the five subagents are **read-only with respect to source code**; only
`implementer` can Edit/Write, and only for an already-scoped subtask. This mirrors Claude
Code, where the read-only Explore/Plan agents inform the work and the general-purpose agent
carries out scoped implementation.

> **Auto-delegation caveat:** Junie picks a subagent by matching its `description`. A
> broadly-worded agent (especially `implementer`) can hijack delegation for tasks the main
> agent should keep. Its `description` is deliberately narrow — "already-scoped subtask,
> typically after `planner`". Widen it only if you actually want more work routed to it.

## How Junie uses these

Junie delegates **automatically** by matching a task to each subagent's `description` — you
do not (and cannot) invoke a subagent via a slash command. To make delegation reliable,
each `description` states clearly *when* to use the agent.

Subagents run **one level deep** (they have no delegate tool) and Junie may run independent
ones **in parallel** depending on the Subagents mode in `~/.junie/settings.json`
(`Auto` by default). The `orchestration` guideline is what carries the top-level
"decompose → delegate → synthesize" behavior.

## Extending it

Add a new subagent by dropping a `agents/<name>.md` file here with YAML frontmatter
(`description` is required). Keep each agent single-purpose and its `description`
delegation-friendly ("Delegate to this agent when …").
