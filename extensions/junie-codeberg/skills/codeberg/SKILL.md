---
name: codeberg
description: Drive Codeberg source hosting via the `fj` CLI and git — authentication, feature branches, worktrees under .worktrees/, pull requests, merges, issues, labels, and CI status. Use whenever creating branches/PRs, merging, or interacting with Codeberg.
---

# Codeberg (source hosting)

Hosted at **codeberg.org/join-noah/noah-monorepo** (SSH `origin`). Interact through the
`fj` CLI (v0.3.0) plus plain `git` for branch/worktree operations. MCPs are not used.

## Authentication

`fj` auth is **host-based** (one login per instance, not per-profile). It is already
authenticated on `codeberg.org` as `birneklub@codeberg.org`. Verify at any time:

```bash
fj whoami        # current authed user (inferred from origin)
fj auth list     # all logged-in instances
```

To (re)authenticate headlessly (token from Codeberg → Settings → Applications):

```bash
echo "$TOKEN" | fj auth add-key birneklub   # no env-var auth in fj v0.3.0
```

`fj` infers the repo from the local `origin` remote, so inside a clone you run bare
`fj pr ...` / `fj issue ...`. Override with `-r owner/name` or `-R <remote>` only when needed.

## Branching model

- `main` is the **only** long-lived branch. Never commit or push directly to `main`.
- All work happens on `feature/<ticket>-<slug>` (or `fix/<ticket>-<slug>`), e.g. `feature/DEV-123-send-money-endpoint`.
- Pull requests target `main`. Default merge strategy: **squash**, then delete the branch.

## Worktrees (in `.worktrees/`)

Worktrees live **inside the project dir** at `.worktrees/<name>` (NOT as siblings, which is
where Junie's built-in `/worktree` puts them). Use the helper, not `/worktree`:

```bash
scripts/worktree.sh create feature/DEV-123-send-money-endpoint   # creates .worktrees/feature-DEV-123-send-money-endpoint
scripts/worktree.sh list
scripts/worktree.sh remove feature/DEV-123-send-money-endpoint
```

After creating one, `cd` into it; Junie detects the switch and offers to restart the session
there with a clean task. The branch is created fresh from `origin/main`.

## Branches & commits (git — `fj` has no branch subcommand)

```bash
git switch -c feature/DEV-123-slug        # create
git push -u origin feature/DEV-123-slug   # publish
git commit -m "[DEV-123] Short description"   # conventional subject, body explains why
```

## Pull requests

```bash
# Create (title is POSITIONAL — there is no --title flag). Drafts: prefix "WIP: ".
fj pr create "[DEV-123] Send money endpoint" --base main --head feature/DEV-123-slug --body "Summary..."

fj pr view 42                  # summary
fj pr view 42 diff             # the diff
fj pr status 42 --wait         # mergeable + CI status; --wait blocks until checks finish
fj pr search -s open           # list open PRs

fj pr merge 42 -M squash -d    # squash-merge + delete branch (-t/-m set commit title/body)
fj pr comment 42 "Looks good — merging"
fj pr edit labels -a qa        # add a label to the PR (PR labels only)
fj pr close 42 -w "not ready"
```

Always put the Plane ticket link in the PR body and squash-merge into `main`.

## Issues

```bash
fj issue view 7
fj issue comment 7 "note"
fj issue close 7 -w "done"
fj issue search -s open
```

`fj` **cannot label issues** (only PRs and org-level label definitions). Fallback via the
Forgejo REST API:

```bash
curl -fsS -X POST -H "Authorization: token $CODEBERG_TOKEN" \
  -H "Content-Type: application/json" \
  https://codeberg.org/api/v1/repos/join-noah/noah-monorepo/issues/7/labels \
  -d '{"labels":[<label-id>]}'
```

## CI (Woodpecker)

CI is Woodpecker (`.woodpecker.yml`), Codeberg-native. Check status with:

```bash
fj pr status <id> --wait      # blocks until the PR's checks finish
fj actions tasks              # list recent CI runs
```

Do not merge until `fj pr status <id>` reports green and mergeable.
