#!/usr/bin/env bash
#
# Inspect and deliberately prune the server's sync store.
#
# Retention here is a HUMAN decision, never a timer. The review that asked
# for TTL also named the disaster case: an inactive household's only backup
# silently deleted on schedule. This deployment chose the same answer Olle
# gave for legacy sync slots — deliberate action over automatic expiry — so
# this tool shows what is stale and deletes only what an operator names,
# with a dry run as the default. The watchdog's freshness probe is what
# warns; this is what acts.
#
# Runs on the Docker host; reads the volume through the container because
# it is root-owned on the host.

set -euo pipefail

CONTAINER="${CORTEX_CONTAINER:-cortex}"

usage() {
  cat >&2 <<'EOF'
usage: sync-store.sh list
       sync-store.sh reap --older-than-days N [--delete]

  list    every group: age of last write, size, revision, capability bound
  reap    show (default) or delete (--delete) groups whose last write is
          older than N days. Refuses to touch the newest record no matter
          its age: whatever else is true, the most recent backup survives.
EOF
}

records() {
  docker exec "$CONTAINER" sh -c 'ls -t /app/data/sync/*.json 2>/dev/null' || true
}

describe() { # describe <path> -> "age_days size rev bound id"
  local path="$1" mtime size meta
  mtime=$(docker exec "$CONTAINER" stat -c %Y "$path")
  size=$(docker exec "$CONTAINER" stat -c %s "$path")
  meta=$(docker exec "$CONTAINER" cat "$path" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(d.get("rev","?"), "yes" if "writeTokenHash" in d else "no")')
  printf '%s %s %s %s\n' "$((($(date +%s) - mtime) / 86400))" "$size" "$meta"
}

cmd_list() {
  local any=0 path id
  printf '%-18s %8s %8s %5s %s\n' "AGE(days)" "SIZE" "REV" "CAP" "GROUP"
  for path in $(records); do
    any=1
    id=$(basename "$path" .json)
    read -r age size rev bound <<<"$(describe "$path")"
    printf '%-18s %8s %8s %5s %s…\n' "$age" "$size" "$rev" "$bound" "${id:0:16}"
  done
  [ "$any" = 1 ] || echo "(store is empty)"
}

cmd_reap() {
  local days="" delete=0 arg
  while [ $# -gt 0 ]; do
    case "$1" in
      --older-than-days) days="${2:-}"; shift ;;
      --delete) delete=1 ;;
      *) usage; exit 2 ;;
    esac
    shift
  done
  echo "${days:-}" | grep -Eq '^[0-9]+$' || { usage; exit 2; }

  local all newest path id count=0
  all=$(records)
  [ -n "$all" ] || { echo "store is empty — nothing to reap"; return 0; }
  newest=$(echo "$all" | head -1)

  for path in $all; do
    id=$(basename "$path" .json)
    read -r age _size _rev _bound <<<"$(describe "$path")"
    [ "$age" -ge "$days" ] || continue
    if [ "$path" = "$newest" ]; then
      echo "KEEPING ${id:0:16}… (${age}d old, but it is the NEWEST record — the last backup never reaps)"
      continue
    fi
    count=$((count + 1))
    if [ "$delete" = 1 ]; then
      docker exec "$CONTAINER" rm "$path"
      echo "deleted ${id:0:16}… (${age}d since last write)"
    else
      echo "would delete ${id:0:16}… (${age}d since last write) — rerun with --delete to act"
    fi
  done
  [ "$count" = 0 ] && echo "nothing older than ${days} days (beyond the protected newest)"
  return 0
}

case "${1:-}" in
  list) cmd_list ;;
  reap) shift; cmd_reap "$@" ;;
  -h | --help) usage; exit 0 ;;
  *) usage; exit 2 ;;
esac
