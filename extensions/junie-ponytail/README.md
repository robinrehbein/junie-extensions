# junie-ponytail

Lazy senior dev mode for Junie CLI. *The best code is the code you never wrote.* Forces the
laziest solution that works — YAGNI, reuse what's already here, stdlib and native platform
features before dependencies, one line over fifty — while keeping every safety guard.

Adapted for Junie from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
(MIT). The upstream project ships the same content for ~20 agents; this is the Junie-native
packaging.

## What's inside

| Piece | Type | Purpose |
|-------|------|---------|
| `ponytail` | guideline | Always-on "lazy senior dev" context (the ladder + safety rules). |
| `ponytail` | skill | Auto-invoked on coding tasks; the full ladder with intensity levels (lite/full/ultra). |
| `ponytail-review` | skill | Over-engineering review of a diff. |
| `ponytail-audit` | skill | Whole-repo over-engineering audit. |
| `ponytail-debt` | skill | Harvest `ponytail:` comments into a debt ledger. |
| `ponytail-gain` | skill | Measured-impact scoreboard from the benchmark. |
| `ponytail-help` | skill | Quick reference card. |
| `/ponytail`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help` | commands | Manual triggers for each. |

## How it maps to Junie

Upstream ponytail provides *always-on context + skills + commands*. Those map 1:1 onto
Junie's native mechanisms:

- **Guideline** (`guidelines/ponytail.md`) → loaded into every task, so lazy mode is always
  on where the extension is enabled. This is the upstream `AGENTS.md`.
- **Skills** (`skills/ponytail*/SKILL.md`) → copied essentially verbatim: ponytail's skills
  already use the open [Agent Skills](https://agentskills.io) format that Junie reads
  natively. Junie auto-invokes them when a task matches their `description`.
- **Commands** (`commands/ponytail*.md`) → converted from the upstream `.toml` prompts.

## Notes

- **Intensity levels.** Say "ponytail lite/ultra" in chat, or use `/ponytail` (defaults to
  full). Junie custom commands only take *named* arguments, so free-text after the command
  isn't captured — the command reads the level from your surrounding message instead.
- **Turn it off** with "stop ponytail", "normal mode", or `/ponytail off`.
- **Guideline vs skill overlap** is intentional: the guideline keeps lazy mode present even
  when the skill's matcher doesn't fire; the skills add the level machinery and the
  review/audit/debt/gain tools. If you find always-on too aggressive, disable just the
  guideline by removing `guidelines/ponytail.md` — the skills still cover coding tasks.
