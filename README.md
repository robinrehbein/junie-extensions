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
    README.md
```

## Install

This directory is a local marketplace. From any project:

```
junie
/extensions marketplace add /IdeaProjects/pandora/junie-extensions
/extensions install junie-subagents
/extensions install junie-memory
```

Choose **Project** or **User** scope when prompted. To share with the team, push this repo
to a git host and register that URL instead of the local path.

## How this maps to Junie's model

- **Subagents** ≈ Claude Code's `.claude/agents/*.md`. Delegation is automatic (name +
  description matching); there is no manual invocation and no nesting (subagents run one
  level deep). Parallelism is decided by the Subagents mode in `~/.junie/settings.json`.
- **Memory** is not a runtime feature in Junie (the docs' Memory section is still TBD).
  `junie-memory` reproduces Claude Code's approach: a file convention plus an always-loaded
  guideline, using the agent's normal Read/Write — no server.

See each extension's own `README.md` for details and design notes.
