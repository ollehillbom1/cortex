#!/usr/bin/env bash
#
# Bound host disk growth from reproducible build and test caches.
#
# The Cortex watchdog pages at 90% root usage. This companion job starts at
# 80%, leaving enough headroom for a deployment while avoiding routine cache
# churn when the host is healthy. It never removes Docker images, volumes,
# container logs, application data, source repositories, or Git worktrees.

set -euo pipefail

MODE="check"
FORCE="0"
TRIGGER_PERCENT="${CORTEX_HYGIENE_TRIGGER_PERCENT:-80}"
JEST_MAX_AGE_DAYS="${CORTEX_HYGIENE_JEST_MAX_AGE_DAYS:-1}"
CI_MAX_AGE_DAYS="${CORTEX_HYGIENE_CI_MAX_AGE_DAYS:-2}"
VAR_TMP_ROOT="${CORTEX_HYGIENE_VAR_TMP_ROOT:-/var/tmp}"
JEST_ROOT="${CORTEX_HYGIENE_JEST_ROOT:-${VAR_TMP_ROOT}/northstar-jest-cache}"
LOCAL_CI_ROOT="${CORTEX_HYGIENE_LOCAL_CI_ROOT:-${VAR_TMP_ROOT}/northstar-local-ci}"
DOCKER_PRUNE="${CORTEX_HYGIENE_DOCKER_PRUNE:-1}"
DOCKER_MAX_AGE="${CORTEX_HYGIENE_DOCKER_MAX_AGE:-72h}"
LOCK_FILE="${CORTEX_HYGIENE_LOCK_FILE:-${XDG_RUNTIME_DIR:-/tmp}/cortex-host-disk-hygiene.lock}"

usage() {
  cat <<'EOF'
usage: host-disk-hygiene.sh [--check | --apply [--force] | --self-test]

  --check      report pressure and cleanup candidates without deleting (default)
  --apply      clean bounded, reproducible caches only when root usage is at
               or above CORTEX_HYGIENE_TRIGGER_PERCENT (default: 80)
  --force      with --apply, finish all allowlisted cache cleanup even if disk
               usage has already fallen below the trigger
  --self-test  verify selection and retention rules in an isolated temp tree
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --apply) MODE="apply" ;;
    --force) FORCE="1" ;;
    --self-test) MODE="self-test" ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

root_usage_percent() {
  if [ -n "${CORTEX_HYGIENE_USE_PERCENT_OVERRIDE:-}" ]; then
    printf '%s\n' "$CORTEX_HYGIENE_USE_PERCENT_OVERRIDE"
    return
  fi
  df -P / | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }'
}

count_aged_children() {
  local root="$1"
  local days="$2"
  if [ ! -d "$root" ]; then
    printf '0\n'
    return
  fi
  find "$root" -mindepth 1 -maxdepth 1 -xdev -mtime +"$days" -printf . 2>/dev/null |
    wc -c | tr -d ' '
}

count_all_children() {
  local root="$1"
  if [ ! -d "$root" ]; then
    printf '0\n'
    return
  fi
  find "$root" -mindepth 1 -maxdepth 1 -xdev -printf . 2>/dev/null |
    wc -c | tr -d ' '
}

find_stale_ci_roots() {
  [ -d "$VAR_TMP_ROOT" ] || return 0
  if [ "$FORCE" = "1" ]; then
    find "$VAR_TMP_ROOT" -mindepth 1 -maxdepth 1 -xdev -type d \
      -user "$(id -u)" \
      \( -name 'northstar-local-ci-t_*' -o -name 'northstar-local-ci-pr-*' -o -name 'northstar-local-ci-pr[0-9]*' \) \
      -print0 2>/dev/null
  else
    find "$VAR_TMP_ROOT" -mindepth 1 -maxdepth 1 -xdev -type d \
      -user "$(id -u)" -mtime +"$CI_MAX_AGE_DAYS" \
      \( -name 'northstar-local-ci-t_*' -o -name 'northstar-local-ci-pr-*' -o -name 'northstar-local-ci-pr[0-9]*' \) \
      -print0 2>/dev/null
  fi
}

active_test_or_ci_processes() {
  if [ "${CORTEX_HYGIENE_SKIP_PROCESS_CHECK:-0}" = "1" ]; then
    return 1
  fi
  pgrep -af '[j]est|[v]itest|local-ci-controlle[r]' 2>/dev/null
}

delete_tree() {
  local target="$1"
  local resolved
  resolved="$(realpath -e -- "$target")" || return 0
  case "$resolved" in
    "$JEST_ROOT"/*|"$LOCAL_CI_ROOT"/tmp/*|"$LOCAL_CI_ROOT"/dep-cache/*|"$VAR_TMP_ROOT"/northstar-local-ci-t_*|"$VAR_TMP_ROOT"/northstar-local-ci-pr-*) ;;
    "$VAR_TMP_ROOT"/northstar-local-ci-pr[0-9]*) ;;
    *)
      echo "HYGIENE_REFUSED path=${resolved} reason=outside-allowlist" >&2
      return 1
      ;;
  esac
  # Local CI intentionally freezes dependency caches read-only. Restore write
  # and traversal permission only for directories inside the allowlisted tree;
  # file mode is irrelevant when the owning parent directory is writable.
  find "$resolved" -xdev -type d -exec chmod u+rwx {} + 2>/dev/null || true
  if ! find "$resolved" -xdev -depth -delete 2>/dev/null; then
    echo "HYGIENE_DELETE_FAILED path=${resolved}" >&2
    return 1
  fi
}

delete_aged_children() {
  local root="$1"
  local days="$2"
  local deleted=0
  [ -d "$root" ] || { printf '0\n'; return; }
  if [ "$FORCE" = "1" ]; then
    while IFS= read -r -d '' target; do
      delete_tree "$target"
      deleted=$((deleted + 1))
    done < <(find "$root" -mindepth 1 -maxdepth 1 -xdev -print0 2>/dev/null)
  else
    while IFS= read -r -d '' target; do
      delete_tree "$target"
      deleted=$((deleted + 1))
    done < <(find "$root" -mindepth 1 -maxdepth 1 -xdev -mtime +"$days" -print0 2>/dev/null)
  fi
  printf '%s\n' "$deleted"
}

delete_stale_ci_roots() {
  local deleted=0
  local skipped=0
  while IFS= read -r -d '' target; do
    # A scratch root containing a Git checkout may hold unique work. Cache
    # roots do not have top-level .git metadata, so fail closed if one does.
    if [ -e "$target/.git" ]; then
      echo "HYGIENE_SKIP path=${target} reason=git-worktree"
      skipped=$((skipped + 1))
      continue
    fi
    delete_tree "$target"
    deleted=$((deleted + 1))
  done < <(find_stale_ci_roots)
  echo "HYGIENE_STALE_CI deleted=${deleted} skipped=${skipped}"
}

run_cleanup() {
  local jest_deleted=0
  local ci_tmp_deleted=0
  local ci_dep_deleted=0

  if active="$(active_test_or_ci_processes)"; then
    echo "HYGIENE_CACHE_SKIP reason=active-test-or-local-ci"
    printf '%s\n' "$active"
    # These are separate scratch roots, not the shared cache roots used by the
    # active controller. Git worktrees still fail closed in the function.
    delete_stale_ci_roots
    return 0
  fi

  jest_deleted="$(delete_aged_children "$JEST_ROOT" "$JEST_MAX_AGE_DAYS")"
  ci_tmp_deleted="$(delete_aged_children "$LOCAL_CI_ROOT/tmp" "$CI_MAX_AGE_DAYS")"
  ci_dep_deleted="$(delete_aged_children "$LOCAL_CI_ROOT/dep-cache" "$CI_MAX_AGE_DAYS")"
  echo "HYGIENE_CACHE_DELETE jest_entries=${jest_deleted} ci_tmp_entries=${ci_tmp_deleted} ci_dep_entries=${ci_dep_deleted}"
  delete_stale_ci_roots

  if [ "$DOCKER_PRUNE" = "1" ] && command -v docker >/dev/null 2>&1; then
    echo "HYGIENE_DOCKER_BUILD_CACHE max_age=${DOCKER_MAX_AGE}"
    docker builder prune --all --force --filter "until=${DOCKER_MAX_AGE}"
  else
    echo "HYGIENE_DOCKER_BUILD_CACHE skipped=true"
  fi
}

self_test() {
  local sandbox old_time
  sandbox="$(mktemp -d)"
  old_time="$(date -d '5 days ago' --iso-8601=seconds)"
  trap 'find "$sandbox" -xdev -depth -delete 2>/dev/null || true' EXIT

  mkdir -p "$sandbox/var/northstar-jest-cache/old" \
    "$sandbox/var/northstar-jest-cache/fresh" \
    "$sandbox/var/northstar-local-ci/tmp/old" \
    "$sandbox/var/northstar-local-ci/tmp/fresh" \
    "$sandbox/var/northstar-local-ci/dep-cache/old" \
    "$sandbox/var/northstar-local-ci-t_old/cache" \
    "$sandbox/var/northstar-local-ci-t_git/.git"
  mkdir -p "$sandbox/var/northstar-local-ci/dep-cache/old/read-only"
  chmod 0555 "$sandbox/var/northstar-local-ci/dep-cache/old/read-only"
  touch -d "$old_time" \
    "$sandbox/var/northstar-jest-cache/old" \
    "$sandbox/var/northstar-local-ci/tmp/old" \
    "$sandbox/var/northstar-local-ci/dep-cache/old" \
    "$sandbox/var/northstar-local-ci-t_old" \
    "$sandbox/var/northstar-local-ci-t_git"

  CORTEX_HYGIENE_USE_PERCENT_OVERRIDE=95 \
  CORTEX_HYGIENE_SKIP_PROCESS_CHECK=1 \
  CORTEX_HYGIENE_DOCKER_PRUNE=0 \
  CORTEX_HYGIENE_VAR_TMP_ROOT="$sandbox/var" \
  CORTEX_HYGIENE_JEST_ROOT="$sandbox/var/northstar-jest-cache" \
  CORTEX_HYGIENE_LOCAL_CI_ROOT="$sandbox/var/northstar-local-ci" \
  CORTEX_HYGIENE_LOCK_FILE="$sandbox/lock" \
    "$0" --apply >/dev/null

  [ ! -e "$sandbox/var/northstar-jest-cache/old" ]
  [ -d "$sandbox/var/northstar-jest-cache/fresh" ]
  [ ! -e "$sandbox/var/northstar-local-ci/tmp/old" ]
  [ -d "$sandbox/var/northstar-local-ci/tmp/fresh" ]
  [ ! -e "$sandbox/var/northstar-local-ci/dep-cache/old" ]
  [ ! -e "$sandbox/var/northstar-local-ci-t_old" ]
  [ -d "$sandbox/var/northstar-local-ci-t_git/.git" ]
  find "$sandbox" -xdev -depth -delete
  trap - EXIT
  echo "HOST_DISK_HYGIENE_SELF_TEST=PASS"
}

if [ "$MODE" = "self-test" ]; then
  self_test
  exit 0
fi

usage_percent="$(root_usage_percent)"
if ! [[ "$usage_percent" =~ ^[0-9]+$ && "$TRIGGER_PERCENT" =~ ^[0-9]+$ ]]; then
  echo "GATE=FAIL"
  echo "GATE_REASON=invalid disk usage or trigger percentage"
  exit 1
fi

if [ "$FORCE" = "1" ]; then
  jest_candidates="$(count_all_children "$JEST_ROOT")"
  ci_tmp_candidates="$(count_all_children "$LOCAL_CI_ROOT/tmp")"
  ci_dep_candidates="$(count_all_children "$LOCAL_CI_ROOT/dep-cache")"
else
  jest_candidates="$(count_aged_children "$JEST_ROOT" "$JEST_MAX_AGE_DAYS")"
  ci_tmp_candidates="$(count_aged_children "$LOCAL_CI_ROOT/tmp" "$CI_MAX_AGE_DAYS")"
  ci_dep_candidates="$(count_aged_children "$LOCAL_CI_ROOT/dep-cache" "$CI_MAX_AGE_DAYS")"
fi
stale_ci_candidates="$(find_stale_ci_roots | tr -cd '\0' | wc -c | tr -d ' ')"
echo "HOST_DISK_HYGIENE mode=${MODE} force=${FORCE} root_use_pct=${usage_percent} trigger_pct=${TRIGGER_PERCENT}"
echo "HYGIENE_CANDIDATES jest_entries=${jest_candidates} ci_tmp_entries=${ci_tmp_candidates} ci_dep_entries=${ci_dep_candidates} stale_ci_roots=${stale_ci_candidates}"

if [ "$MODE" = "check" ]; then
  echo "GATE=PASS"
  echo "GATE_REASON=read-only disk hygiene check completed"
  exit 0
fi

if [ "$usage_percent" -lt "$TRIGGER_PERCENT" ] && [ "$FORCE" != "1" ]; then
  echo "HYGIENE_APPLY skipped=true reason=below-trigger"
  echo "GATE=PASS"
  echo "GATE_REASON=root usage below cleanup trigger"
  exit 0
fi

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "HYGIENE_APPLY skipped=true reason=already-running"
  echo "GATE=PASS"
  echo "GATE_REASON=another disk hygiene run owns the lock"
  exit 0
fi

before_percent="$usage_percent"
run_cleanup
after_percent="$(root_usage_percent)"
echo "HYGIENE_RESULT before_pct=${before_percent} after_pct=${after_percent}"
echo "GATE=PASS"
echo "GATE_REASON=bounded cache cleanup completed"
