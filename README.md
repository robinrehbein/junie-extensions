# junie-extensions

A Junie CLI **extension marketplace** that brings Claude-Code-style capabilities to
JetBrains Junie CLI. Junie CLI (26.7+) already supports subagents, guidelines, slash
commands, and extensions natively — this repo packages curated, ready-to-install bundles on
top of those mechanisms.

## Extensions in this marketplace

| Extension | Brings | How |
|-----------|--------|-----|
| **junie-subagents** | Claude-Code-style create / process / orchestrate of subagents | 5 focused subagents (`explorer`, `planner`, `implementer`, `reviewer`, `test-runner`) + an orchestration guideline for the main agent |
| **junie-memory** | Cross-session memory | An auto-loaded guideline + `/remember` and `/memories` commands, backed by files under `~/.junie/memory/` |
| **junie-knowledge** | Cross-session knowledge store (token reduction) | An auto-loaded guideline + `/knowledge` command, backed by a shared `servers/knowledge-mcp` MCP server (SQLite + local embeddings, semantic top-k search) |
| **junie-ponytail** | Lazy-senior-dev mode (minimal code, YAGNI) | An always-on guideline + 6 auto-invoked skills + `/ponytail*` commands; adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT) |
| **junie-plane** | Self-hosted Plane ticket tracking | An auto-invoked `plane` skill + `scripts/plane.sh` (`curl`+`jq`) REST client — no MCP |
| **junie-codeberg** | Codeberg source hosting (PRs, issues, CI) | An auto-invoked `codeberg` skill (`fj` + git) + `scripts/worktree.sh` for in-repo worktrees |
| **junie-goal-loop** | Claude-Code-style `/goal` + `/loop` | An auto-loaded guideline + `/goal` (persistent objective with a self-revising checklist in `.junie/goal.md`) and `/loop` (in-process self-judge loop) commands; no MCP |

## Layout

```
.junie-extension/marketplace.json     # marketplace manifest (also readable as a Claude plugin marketplace)
extensions/
  junie-subagents/
    extension.json
    agents/                           # explorer, planner, implementer, reviewer, test-runner
    guidelines/orchestration.md
    README.md
  junie-memory/
    extension.json
    guidelines/memory.md              # auto-loaded → recall protocol
    commands/remember.md              # /remember fact="…"
    commands/memories.md              # /memories
    scripts/recall-memory.sh          # optional eager-recall hook (UserPromptSubmit)
    README.md
  junie-knowledge/
    extension.json
    guidelines/knowledge.md           # auto-loaded → search-before-read / distil-on-save
    commands/knowledge.md             # /knowledge
    README.md
  junie-ponytail/
    extension.json
    guidelines/ponytail.md            # always-on lazy-dev context
    skills/ponytail*/SKILL.md         # 6 auto-invoked skills (Agent Skills format)
    commands/ponytail*.md             # /ponytail, -review, -audit, -debt, -gain, -help
    README.md
  junie-plane/
    extension.json
    skills/plane/SKILL.md             # auto-invoked → Plane command surface
    scripts/plane.sh                  # curl+jq REST client (copy into consuming repo's scripts/)
    README.md
  junie-codeberg/
    extension.json
    skills/codeberg/SKILL.md          # auto-invoked → Codeberg/fj workflow
    scripts/worktree.sh               # in-repo .worktrees/ helper (copy into consuming repo's scripts/)
    README.md
  junie-goal-loop/
    extension.json
    guidelines/goal-loop.md           # auto-loaded → active-goal + dynamic-checklist + self-judge-loop protocol (no-op without .junie/goal.md)
    commands/goal.md                  # /goal, /goal clear
    commands/loop.md                  # /loop <prompt|criteria>
    README.md
servers/
  knowledge-mcp/                       # shared MCP server (SQLite + embeddings) backing junie-knowledge
    src/{index,db,embeddings,tools,selfcheck}.ts
    deno.json                          # tasks: serve / selfcheck
    README.md
```

## Install

This directory is a local marketplace. From any project:

```
junie
/extensions marketplace add /IdeaProjects/noah/packages/junie-extensions
/extensions install junie-subagents
/extensions install junie-memory
/extensions install junie-knowledge   # one-time: also register the MCP server — see its README
/extensions install junie-goal-loop
```

Choose **Project** or **User** scope when prompted. To share with the team, push this repo
to a git host and register that URL instead of the local path.

## How this maps to Junie's model

- **Subagents** ≈ Claude Code's `.claude/agents/*.md`. Delegation is automatic (name +
  description matching); there is no manual invocation and no nesting (subagents run one
  level deep). Parallelism is decided by the Subagents mode in `~/.junie/settings.json`.
- **Memory** is not a runtime feature in Junie (the docs' Memory section is still TBD).
  `junie-memory` reproduces Claude Code's approach: a file convention plus an always-loaded
  guideline, using the agent's normal Read/Write — no server. An optional per-machine
  `UserPromptSubmit` hook (`junie-memory/scripts/recall-memory.sh`) makes recall eager by
  injecting the index into every prompt; it can't be bundled, so see the extension README.

See each extension's own `README.md` for details and design notes.
