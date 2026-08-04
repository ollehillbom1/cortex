#!/usr/bin/env bash
#
# Install (or update) the sync-volume backup cron on this machine.
#
# Two schedules, because they answer different questions:
#   nightly  --run             is there a fresh copy?
#   weekly   --verify-restore  can that copy actually be restored?
# The second is the one people skip, and it is the one that turns an
# assumption into a backup.
#
# Same stable-path reasoning as install-watchdog.sh: cron must not depend on
# which branch the git checkout happens to be on.

set -euo pipefail

TARGET_DIR="$HOME/.local/lib/cortex-ops"
TARGET="$TARGET_DIR/backup-sync.sh"
LOG_DIR="$HOME/.local/state/cortex-backup"
TAG="# cortex-backup (managed by ops/install-backup.sh)"
RUN_SCHEDULE="${CORTEX_BACKUP_SCHEDULE:-30 3 * * *}"
VERIFY_SCHEDULE="${CORTEX_BACKUP_VERIFY_SCHEDULE:-0 4 * * 0}"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-sync.sh"

if [ "${1:-}" = "--uninstall" ]; then
  crontab -l 2>/dev/null | grep -v -F "$TAG" | crontab - || true
  echo "backup cron removed (backups and files left in place)"
  exit 0
fi

mkdir -p "$TARGET_DIR" "$LOG_DIR"
install -m 0755 "$SOURCE" "$TARGET"
{
  echo "source_commit=$(git -C "$(dirname "$SOURCE")" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "installed_at=$(date -Is)"
} >"$TARGET_DIR/INSTALLED-backup"

{
  crontab -l 2>/dev/null | grep -v -F "$TAG" || true
  echo "$RUN_SCHEDULE $TARGET --run >>$LOG_DIR/run.log 2>&1 $TAG"
  echo "$VERIFY_SCHEDULE $TARGET --verify-restore >>$LOG_DIR/verify.log 2>&1 $TAG"
} | crontab -

echo "installed: $TARGET"
echo "nightly:   $RUN_SCHEDULE --run"
echo "weekly:    $VERIFY_SCHEDULE --verify-restore"
echo
echo "The watchdog alarms if no successful backup has been recorded for a day"
echo "(a cron that dies quietly is the same as no backup at all)."
