#!/usr/bin/env sh
# junie-memory — eager recall hook for Junie CLI.
#
# Add this to a `UserPromptSubmit` hook in ~/.junie/config.json (see the
# extension README). Junie CLI runs the hook on every prompt and prepends its
# stdout to the prompt as additionalContext, so the memory index is always in
# context — recall no longer depends on the model remembering to read it.
#
# Only the one-line index is injected; the agent still fetches a specific
# ~/.junie/memory/<slug>.md when an entry is relevant, keeping this light.
#
# POSIX sh, no dependencies. Fails closed: prints nothing when the index is
# missing or empty, so an empty memory store adds no context to the prompt.

set -eu

INDEX="${JUNIE_MEMORY_INDEX:-$HOME/.junie/memory/MEMORY.md}"

# Nothing to recall if the index does not exist or is empty.
[ -s "$INDEX" ] || exit 0

printf '%s\n' "## Memory index (auto-injected by the junie-memory recall hook)"
printf '%s\n' "If a line below is relevant to this task, read the linked ~/.junie/memory/<slug>.md for the full fact."
printf '%s\n'
cat "$INDEX"
