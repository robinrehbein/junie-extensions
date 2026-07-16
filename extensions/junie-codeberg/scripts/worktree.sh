#!/usr/bin/env bash
# scripts/worktree.sh — manage git worktrees INSIDE the project at .worktrees/.
#
# Junie's built-in /worktree creates sibling directories (../<project>-junie-wt-N).
# Noah keeps worktrees inside the repo at .worktrees/<name> instead. Use this helper.
#
# Usage:
#   scripts/worktree.sh create <branch>            # new worktree on <branch> from origin/main
#   scripts/worktree.sh list
#   scripts/worktree.sh remove  <branch|dir>
set -euo pipefail

common="$(git rev-parse --git-common-dir 2>/dev/null)" || { echo "not a git repo" >&2; exit 1; }
root="$(cd "$common/.." && pwd)"   # main worktree root (where .worktrees/ lives)
wt_dir="$root/.worktrees"
mkdir -p "$wt_dir"

# sanitize a branch name into a worktree directory name (feature/DEV-1-x -> feature-DEV-1-x)
wtname() { echo "${1//\//-}"; }

usage() { sed -n '2,12p' "$0"; }

cmd="${1:-}"; shift || true
case "$cmd" in
  create)
    branch="${1:?branch required (e.g. feature/DEV-123-slug)}"
    dir="$wt_dir/$(wtname "$branch")"
    [[ -e "$dir" ]] && { echo "worktree already exists: $dir" >&2; exit 1; }
    # base the new branch on the latest main available
    git fetch origin main --quiet 2>/dev/null || true
    base="origin/main"; git rev-parse --verify --quiet "$base" >/dev/null || base="main"
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      git worktree add "$dir" "$branch"
    else
      git worktree add -b "$branch" "$dir" "$base"
    fi
    echo "created worktree at: $dir"
    echo "  branch: $branch  (based on $base)"
    echo "next: cd \"$dir\"  (Junie will offer to restart the session there)"
    ;;
  list)
    git worktree list
    ;;
  remove)
    target="${1:?branch or dir required}"
    dir="$wt_dir/$(wtname "$target")"
    [[ -e "$dir" ]] || dir="$wt_dir/$target"
    [[ -e "$dir" ]] || { echo "no worktree for: $target" >&2; exit 1; }
    git worktree remove "$dir"
    echo "removed worktree: $dir"
    ;;
  ""|help|-h|--help) usage ;;
  *) echo "unknown command: $cmd" >&2; usage; exit 1 ;;
esac
