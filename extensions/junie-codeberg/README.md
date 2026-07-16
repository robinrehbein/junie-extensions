# junie-codeberg

Drive **Codeberg** source hosting from Junie CLI with the `fj` (forgejo-cli)
plus plain `git`. Covers auth, feature branches, in-repo worktrees, pull requests,
squash-merges, issues/labels, and Woodpecker CI status.

## What's inside

| Piece | Type | Purpose |
|-------|------|---------|
| `codeberg` | skill | Auto-invoked when working with Codeberg/git/PRs. Documents the full workflow (auth → branch → worktree → PR → review → merge → CI). |
| `scripts/worktree.sh` | script | Manages git worktrees *inside* the repo at `.worktrees/` (Junie's built-in `/worktree` makes sibling dirs instead). `create \| list \| remove`. |

## Prerequisites

- [`tea`](https://gitea.com/gitea/tea)/`fj` CLI, aliased as `fj`, authenticated against
  `codeberg.org` (`fj login add`). The skill issues all remote calls through `fj`.
- `git` (obviously).

## Activation (per consuming repo)

The skill documents `scripts/worktree.sh`, expected at the **repo's** `scripts/` root
(extension-bundled scripts are not auto-exposed on the host). Copy it in once:

```sh
cp extensions/junie-codeberg/scripts/worktree.sh /path/to/repo/scripts/worktree.sh
chmod +x /path/to/repo/scripts/worktree.sh
```

Worktrees then live at `<repo>/.worktrees/<branch>`, not as sibling directories.

## Design notes

- **`fj` over raw API.** The Codeberg/Forgejo REST works, but `fj` gives terse,
  human-readable `pr`, `issue`, `label`, and `releases` commands with auth handled once.
- **In-repo worktrees.** Junie's built-in `/worktree` creates sibling dirs
  (`../<project>-junie-wt-N`); Noah keeps them inside `.worktrees/` for tooling locality,
  hence the small helper.
- **Woodpecker CI.** The skill's CI section assumes the repo uses Woodpecker
  (`.woodpecker.yml`) — Codeberg's native CI.
- **Noah-specific conventions.** The skill documents `join-noah/noah-monorepo`, the
  `.worktrees/` layout, and `fj` as the alias. Adapt the repo path/alias for other repos.
