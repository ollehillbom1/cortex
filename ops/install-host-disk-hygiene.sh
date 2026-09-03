#!/usr/bin/env bash
# Install the bounded host-cache cleanup as a stable user systemd timer.

set -euo pipefail

TARGET_DIR="$HOME/.local/lib/cortex-ops"
TARGET="$TARGET_DIR/host-disk-hygiene.sh"
UNIT_DIR="$HOME/.config/systemd/user"
SERVICE="$UNIT_DIR/cortex-host-disk-hygiene.service"
TIMER="$UNIT_DIR/cortex-host-disk-hygiene.timer"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host-disk-hygiene.sh"

case "${1:-}" in
  --user) ;;
  --uninstall)
    systemctl --user disable --now cortex-host-disk-hygiene.timer 2>/dev/null || true
    find "$SERVICE" "$TIMER" -maxdepth 0 -type f -delete 2>/dev/null || true
    systemctl --user daemon-reload
    echo "host disk hygiene timer removed (stable script left at $TARGET)"
    exit 0
    ;;
  *)
    echo "usage: install-host-disk-hygiene.sh --user | --uninstall" >&2
    exit 2
    ;;
esac

"$SOURCE" --self-test
mkdir -p "$TARGET_DIR" "$UNIT_DIR"
install -m 0755 "$SOURCE" "$TARGET"

cat >"$SERVICE" <<EOF
[Unit]
Description=Cortex host disk hygiene before watchdog alarm threshold

[Service]
Type=oneshot
ExecStart=$TARGET --apply
Nice=10
IOSchedulingClass=idle
CPUWeight=20
IOWeight=20
TimeoutStartSec=30min
EOF

cat >"$TIMER" <<'EOF'
[Unit]
Description=Run Cortex host disk hygiene hourly

[Timer]
OnBootSec=15min
OnUnitActiveSec=1h
AccuracySec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now cortex-host-disk-hygiene.timer
echo "installed: $TARGET"
systemctl --user status cortex-host-disk-hygiene.timer --no-pager
