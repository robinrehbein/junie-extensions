#!/usr/bin/env bash
# scripts/plane.sh — thin helper around the self-hosted Plane REST API.
#
# Replaces the old (broken) Plane MCP server. Junie agents/skills call this
# instead of an MCP server, because MCPs do not currently work in this setup.
#
# Configuration (environment):
#   PLANE_API_KEY     (required) Plane API token (Profile → API Tokens)
#   PLANE_BASE_URL    (default https://plane.join-noah.de)
#   PLANE_WORKSPACE   (default noah)            workspace slug
#   PLANE_PROJECT     (default DEV)             default project: PROD | DEV | FND | <uuid>
#
# Usage:
#   scripts/plane.sh projects
#   scripts/plane.sh states [PROJECT]
#   scripts/plane.sh issues [PROJECT]                # lists DEV-<n> | <state> | <name>
#   scripts/plane.sh issue <DEV-123|123|uuid> [PROJECT]
#   scripts/plane.sh comments <REF> [PROJECT]
#   scripts/plane.sh comment <REF> [PROJECT] "text..."
#   scripts/plane.sh move <REF> [PROJECT] "<State Name>"   # Backlog|Todo|In Progress|Done|Cancelled
#   scripts/plane.sh create-issue [PROJECT] --name "..." [--state NAME] [--priority P] [--assignee UUID] [--label UUID] [--description "..."]
#   scripts/plane.sh update-issue <REF> [PROJECT] [--state NAME] [--priority P]
#   scripts/plane.sh cycles [PROJECT]
#   scripts/plane.sh raw <METHOD> <PATH> [JSON_BODY]      # escape hatch
#
# Self-hosted Plane ignores list filters server-side, so issues are fetched and
# filtered client-side (mirrors the old MCP behaviour). Rate limit ~60 req/min.
set -euo pipefail

BASE="${PLANE_BASE_URL:-https://plane.join-noah.de}"
WS="${PLANE_WORKSPACE:-noah}"
DEFAULT_PROJECT="${PLANE_PROJECT:-DEV}"

# Project identifier -> UUID (from docs/plane-workspace-structure.md)
declare -A PROJ=(
  [PROD]=031c984b-1609-4dce-bf38-cd9c47c40cfe
  [DEV]=56fb4930-19e3-4fee-8ec6-8959367d6ba1
  [FND]=1bbd88f5-7007-4c5d-b95b-31fdd12709f3
)
# Known members (for readable assignee output)
declare -A USER=(
  [714ee8f1-463f-4c9d-bae3-22cc007ccc1d]="Robin"
  [8334b6e5-d26a-4c45-85bc-37cec2e5bdfd]="Luis"
)

require() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 1; }; }

# api <METHOD> <PATH> [JSON_BODY]   PATH is relative to /api/v1/workspaces/$WS
api() {
  local method="$1" path="$2" body="${3:-}"
  local url="$BASE/api/v1/workspaces/$WS$path"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "$url" -H "X-API-Key: $PLANE_API_KEY" -H "Content-Type: application/json" -d "$body"
  else
    curl -fsS -X "$method" "$url" -H "X-API-Key: $PLANE_API_KEY"
  fi
}

# pid [PROJECT] -> project UUID
pid() {
  local ref="${1:-$DEFAULT_PROJECT}" upper="${1:-$DEFAULT_PROJECT}"
  upper="${upper^^}"
  if [[ -n "${PROJ[$upper]:-}" ]]; then echo "${PROJ[$upper]}"
  elif [[ "$ref" =~ ^[0-9a-fA-F-]{36}$ ]]; then echo "$ref"
  else echo "unknown project: $ref (use PROD|DEV|FND or a UUID)" >&2; exit 1; fi
}

# results <json> -> emits the .results array (or the array itself)
resultsjq() { jq 'if type=="array" then . elif has("results") then .results else . end'; }

# resolve_issue <REF> [PROJECT] -> issue UUID
#   REF may be "DEV-123", a bare sequence number (uses PROJECT/default), or a UUID.
resolve_issue() {
  local ref="$1" proj="${2:-}"
  if [[ "$ref" =~ ^[0-9a-fA-F-]{36}$ ]]; then echo "$ref"; return; fi
  local p seq pid_
  if [[ "$ref" =~ ^([A-Za-z]+)-([0-9]+)$ ]]; then p="${BASH_REMATCH[1]^^}"; seq="${BASH_REMATCH[2]}"
  elif [[ "$ref" =~ ^([0-9]+)$ ]]; then p="${proj:-$DEFAULT_PROJECT}"; seq="$ref"
  else echo "bad ticket ref: $ref (use DEV-123, 123, or a UUID)" >&2; exit 1; fi
  pid_="$(pid "$p")"
  api GET "/projects/$pid_/issues/?per_page=100" \
    | resultsjq \
    | jq -r --argjson seq "$seq" 'map(select(.sequence_id == $seq)) | .[0].id // empty' \
    | head -1
}

# state_uuid <PROJECT> <STATE-NAME> -> UUID (case-insensitive name match)
state_uuid() {
  local pid_; pid_="$(pid "$1")"; shift
  api GET "/projects/$pid_/states/" | resultsjq \
    | jq -r --arg n "$1" 'map(select((.name // "") | ascii_downcase == ($n | ascii_downcase))) | .[0].id // empty'
}

strip_html() { sed -E 's/<[^>]+>/ /g; s/&nbsp;/ /g; s/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/  +/ /g'; }
escape_html() { sed -E 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g; s/'"'"'/\&#39;/g'; }

cmd="${1:-}"; shift || true
case "$cmd" in ""|help|-h|--help) ;; *) require curl; require jq; [[ -n "${PLANE_API_KEY:-}" ]] || { echo "PLANE_API_KEY is not set (see scripts/plane.sh header)" >&2; exit 1; } ;; esac
case "$cmd" in
  projects)
    api GET "/projects/" | resultsjq \
      | jq -r '.[] | "\(.identifier // "?") | \(.name) | \(.id)"'
    ;;
  states)
    pid_="$(pid "${1:-}")"
    api GET "/projects/$pid_/states/" | resultsjq \
      | jq -r '.[] | "\(.name) [\(.group // "?")] | \(.id)"'
    ;;
  issues)
    pid_="$(pid "${1:-}")"
    states="$(api GET "/projects/$pid_/states/" | resultsjq)"
    api GET "/projects/$pid_/issues/?per_page=100" | resultsjq \
      | jq -r --argjson smap "$states" '
          ($smap | map({key:.id, value:.name}) | from_entries) as $sn
          | sort_by(.sequence_id)
          | .[] | "\(.sequence_id) | \($sn[.state] // .state) | \(.name)"'
    ;;
  issue)
    ref="${1:?ref required}"; proj="${2:-}"
    pid_="$(pid "$proj")"
    iid="$(resolve_issue "$ref" "$proj")"
    [[ -n "$iid" ]] || { echo "issue not found: $ref" >&2; exit 1; }
    states="$(api GET "/projects/$pid_/states/" | resultsjq)"
    api GET "/projects/$pid_/issues/$iid/" \
      | jq -r --argjson smap "$states" '
          ($smap | map({key:.id, value:.name}) | from_entries) as $sn
          | "ID: \(.sequence_id)  (\(.id))",
            "Name: \(.name)",
            "State: \($sn[.state] // .state)",
            "Priority: \(.priority // "-")",
            "Assignees: \((.assignees // []) | join(", "))",
            "Labels: \((.labels // []) | join(", "))",
            "Description:",
            "\(.description_html // .description // "-")"' \
      | strip_html
    ;;
  comments)
    ref="${1:?ref required}"; proj="${2:-}"
    pid_="$(pid "$proj")"
    iid="$(resolve_issue "$ref" "$proj")"
    [[ -n "$iid" ]] || { echo "issue not found: $ref" >&2; exit 1; }
    api GET "/projects/$pid_/issues/$iid/comments/" | resultsjq \
      | jq -r '.[] | "--- \(.created_at) ---\n\(.comment_html // .comment // "")\n"' | strip_html
    ;;
  comment)
    ref="${1:?ref required}"; proj="${2:-}"; text="${3:?text required}"
    pid_="$(pid "$proj")"
    iid="$(resolve_issue "$ref" "$proj")"
    [[ -n "$iid" ]] || { echo "issue not found: $ref" >&2; exit 1; }
    body="$(jq -n --arg c "<p>$(printf '%s' "$text" | escape_html)</p>" '{comment_html:$c}')"
    api POST "/projects/$pid_/issues/$iid/comments/" "$body" | jq '{id, created_at}'
    ;;
  move)
    ref="${1:?ref required}"; proj="${2:-}"; sname="${3:?state name required}"
    pid_="$(pid "$proj")"
    iid="$(resolve_issue "$ref" "$proj")"
    [[ -n "$iid" ]] || { echo "issue not found: $ref" >&2; exit 1; }
    sid="$(state_uuid "$pid_" "$sname")"
    [[ -n "$sid" ]] || { echo "state not found: $sname (run: scripts/plane.sh states)" >&2; exit 1; }
    body="$(jq -n --arg s "$sid" '{state:$s}')"
    api PATCH "/projects/$pid_/issues/$iid/" "$body" >/dev/null
    echo "moved $ref -> $sname"
    ;;
  create-issue)
    proj="$DEFAULT_PROJECT"; name=""; sname=""; priority=""; assignee=""; label=""; desc=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --name) name="${2:?--name requires a value}"; shift 2;;
        --state) sname="${2:?--state requires a value}"; shift 2;;
        --priority) priority="${2:?--priority requires a value}"; shift 2;;
        --assignee) assignee="${2:?--assignee requires a value}"; shift 2;;
        --label) label="${2:?--label requires a value}"; shift 2;;
        --description) desc="${2:?--description requires a value}"; shift 2;;
        *) [[ "$1" =~ ^(PROD|DEV|FND)$ || "$1" =~ ^[0-9a-fA-F-]{36}$ ]] && { proj="$1"; shift; } || { echo "unknown arg: $1" >&2; exit 1; };;
      esac
    done
    [[ -n "$name" ]] || { echo "--name is required" >&2; exit 1; }
    pid_="$(pid "$proj")"
    sid=""; [[ -n "$sname" ]] && sid="$(state_uuid "$pid_" "$sname")"
    body="$(jq -nc --arg name "$name" --arg desc "$(printf '%s' "$desc" | escape_html)" --arg state "$sid" --arg prio "$priority" \
      --arg assignee "$assignee" --arg label "$label" '
        {name:$name, description_html:("<p>\($desc)</p>")}
        + (if $state!="" then {state:$state} else {} end)
        + (if $prio!="" then {priority:$prio} else {} end)
        + (if $assignee!="" then {assignees:[$assignee]} else {} end)
        + (if $label!="" then {labels:[$label]} else {} end)')"
    api POST "/projects/$pid_/issues/" "$body" | jq '{id, name, sequence_id}'
    ;;
  update-issue)
    ref="${1:?ref required}"; proj="${2:-}"; shift 2
    pid_="$(pid "$proj")"; iid="$(resolve_issue "$ref" "$proj")"
    [[ -n "$iid" ]] || { echo "issue not found: $ref" >&2; exit 1; }
    sname=""; priority=""
    while [[ $# -gt 0 ]]; do case "$1" in --state) sname="${2:?--state requires a value}"; shift 2;; --priority) priority="${2:?--priority requires a value}"; shift 2;; *) echo "unknown arg: $1" >&2; exit 1;; esac; done
    sid=""; [[ -n "$sname" ]] && sid="$(state_uuid "$pid_" "$sname")"
    body="$(jq -nc --arg s "$sid" --arg p "$priority" '({} + (if $s!="" then {state:$s} else {} end) + (if $p!="" then {priority:$p} else {} end))')"
    api PATCH "/projects/$pid_/issues/$iid/" "$body" >/dev/null
    echo "updated $ref"
    ;;
  cycles)
    pid_="$(pid "${1:-}")"
    api GET "/projects/$pid_/cycles/" | resultsjq \
      | jq -r '.[] | "\(.name) | \(.start_date // "?") -> \(.end_date // "?") | \(.id)"'
    ;;
  raw)
    method="${1:?method required}"; path="${2:?path required}"; body="${3:-}"
    api "$method" "$path" "$body"
    ;;
  ""|help|-h|--help)
    sed -n '2,30p' "$0"
    ;;
  *) echo "unknown command: $cmd (run: scripts/plane.sh help)" >&2; exit 1 ;;
esac
