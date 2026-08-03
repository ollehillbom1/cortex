#!/usr/bin/env bash
#
# Install (or update) the Cortex watchdog cron job on this machine.
#
# The script is copied to a stable path rather than run from the git
# checkout: the working tree changes branches, and a monitor that vanishes
# because someone checked out a feature branch is worse than no monitor —
# it fails silently, exactly when you have stopped watching. The copy
# records which commit it came from so drift is visible.
#
# Usage:
#   ops/install-watchdog.sh                 # host-side install (docker checks on)
#   ops/install-watchdog.sh --remote-only   # off-box vantage point: no docker/disk checks
#   ops/install-watchdog.sh --uninstall

set -euo pipefail

TARGET_DIR="$HOME/.local/lib/cortex-ops"
TARGET="$TARGET_DIR/watchdog.sh"
STATE_DIR="$HOME/.local/state/cortex-watchdog"
TAG="# cortex-watchdog (managed by ops/install-watchdog.sh)"
SCHEDULE="${CORTEX_WATCHDOG_SCHEDULE:-*/5 * * * *}"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/watchdog.sh"

MODE=host
[ "${1:-}" = "--remote-only" ] && MODE=remote
if [ "${1:-}" = "--uninstall" ]; then
  crontab -l 2>/dev/null | grep -v -F "$TAG" | crontab - || true
  echo "watchdog cron removed (files left in $TARGET_DIR)"
  exit 0
fi

mkdir -p "$TARGET_DIR" "$STATE_DIR"
install -m 0755 "$SOURCE" "$TARGET"
{
  echo "source_commit=$(git -C "$(dirname "$SOURCE")" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "installed_at=$(date -Is)"
  echo "installed_from=$SOURCE"
  echo "mode=$MODE"
} >"$TARGET_DIR/INSTALLED"

FLAGS="--quiet"
[ "$MODE" = host ] && FLAGS="--local-checks --quiet"
LINE="$SCHEDULE $TARGET $FLAGS >>$STATE_DIR/log 2>&1 $TAG"

# Idempotent: replace any previous managed line, leave everything else alone.
{
  crontab -l 2>/dev/null | grep -v -F "$TAG" || true
  echo "$LINE"
} | crontab -

echo "installed: $TARGET ($MODE mode)"
echo "cron:      $LINE"
echo
echo "Prove it works before trusting it:"
echo "  $TARGET --self-test     # state machine, offline"
echo "  $TARGET --test-alarm    # sends one real message"
