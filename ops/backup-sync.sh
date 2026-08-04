#!/usr/bin/env bash
#
# Back up the sync volume — and prove the backup can be restored.
#
# The sync store holds every household's encrypted training history. It is
# the one piece of server state that cannot be reconstructed: lose it and a
# household that reinstalled its last device has nothing to come back to.
#
# The volume is read through a helper container, not from
# /var/lib/docker/volumes (root-owned, and the layout is Docker's business).
#
# ON THE PASSPHRASE
#   The archive is encrypted with gpg (AES-256, symmetric). The passphrase
#   lives in ~/.config/cortex/backup.key on this machine — which is exactly
#   the machine the backup exists to survive. `--init` prints it once so it
#   can go in a password manager. A backup whose key died with the host is
#   not a backup, the same trap the sync code's save-step exists for.
#
# WHERE IT WRITES
#   $CORTEX_BACKUP_DIR (default ~/cortex-backups) — a different filesystem
#   from the Docker volume, which covers the failure that actually happens
#   (a bad deploy, a wiped volume, a fat-fingered `docker volume rm`). It
#   does NOT cover losing the machine; point CORTEX_BACKUP_DIR at a mount
#   from another host for that.

set -euo pipefail

VOLUME="${CORTEX_SYNC_VOLUME:-cortex-sync}"
BACKUP_DIR="${CORTEX_BACKUP_DIR:-$HOME/cortex-backups}"
KEY_FILE="${CORTEX_BACKUP_KEY_FILE:-$HOME/.config/cortex/backup.key}"
KEEP="${CORTEX_BACKUP_KEEP:-14}"
STAMP="$BACKUP_DIR/.last-success"
HELPER_IMAGE="${CORTEX_BACKUP_HELPER_IMAGE:-alpine:3}"

usage() {
  cat >&2 <<'EOF'
usage: backup-sync.sh <command>

  --init             generate the encryption passphrase (prints it ONCE)
  --run              take a backup, encrypt it, prune old ones
  --verify-restore   restore the newest backup into a throwaway volume and
                     diff it against the live volume, then clean up
  --list             list backups with sizes
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_volume() {
  docker volume inspect "$VOLUME" >/dev/null 2>&1 ||
    die "volume '$VOLUME' does not exist. Set CORTEX_SYNC_VOLUME. (Do not guess: backing up a volume that does not exist produces a valid, empty, useless archive.)"
}

read_key() {
  [ -r "$KEY_FILE" ] || die "no passphrase at $KEY_FILE — run: $0 --init"
  cat "$KEY_FILE"
}

cmd_init() {
  if [ -e "$KEY_FILE" ]; then
    die "$KEY_FILE already exists; refusing to overwrite (that would orphan every existing backup)"
  fi
  mkdir -p "$(dirname "$KEY_FILE")"
  chmod 700 "$(dirname "$KEY_FILE")"
  openssl rand -base64 32 >"$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "Backup passphrase generated at $KEY_FILE"
  echo
  echo "  $(cat "$KEY_FILE")"
  echo
  echo "SAVE IT SOMEWHERE ELSE NOW (password manager). Without it, the backups"
  echo "are unreadable — and this machine is the one the backups exist to survive."
}

cmd_run() {
  require_volume
  local key stamp out tmp
  key=$(read_key)
  mkdir -p "$BACKUP_DIR"
  stamp=$(date +%Y%m%dT%H%M%S)
  out="$BACKUP_DIR/cortex-sync-$stamp.tar.gz.gpg"
  tmp="$out.partial"

  # tar streams out of the helper container; gpg encrypts on this side, so
  # plaintext never lands on disk.
  docker run --rm -v "$VOLUME":/data:ro "$HELPER_IMAGE" tar czf - -C /data . |
    gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 3 -o "$tmp" 3<<<"$key"

  [ -s "$tmp" ] || {
    rm -f "$tmp"
    die "backup produced an empty file"
  }
  mv "$tmp" "$out"

  # A backup nobody can read is worse than none: prove the archive decrypts
  # and its table of contents is non-empty, every single run.
  local entries
  entries=$(gpg --batch --quiet --decrypt --passphrase-fd 3 "$out" 3<<<"$key" 2>/dev/null | tar tzf - | wc -l)
  [ "$entries" -gt 0 ] || die "archive decrypted to nothing — refusing to call this a backup"

  date -Is >"$STAMP"
  echo "backup ok: $out ($(du -h "$out" | cut -f1), $entries entries)"

  # Prune, newest first.
  local pruned=0
  while IFS= read -r old; do
    rm -f "$old"
    pruned=$((pruned + 1))
  done < <(ls -1t "$BACKUP_DIR"/cortex-sync-*.tar.gz.gpg 2>/dev/null | tail -n "+$((KEEP + 1))")
  [ "$pruned" -gt 0 ] && echo "pruned $pruned old backup(s), keeping $KEEP"
  return 0
}

cmd_verify_restore() {
  require_volume
  local key newest test_vol rc=0
  key=$(read_key)
  newest=$(ls -1t "$BACKUP_DIR"/cortex-sync-*.tar.gz.gpg 2>/dev/null | head -1) ||
    die "no backups in $BACKUP_DIR"
  [ -n "$newest" ] || die "no backups in $BACKUP_DIR"
  test_vol="cortex-restore-test-$$"

  echo "restoring $newest into throwaway volume $test_vol"
  docker volume create "$test_vol" >/dev/null
  gpg --batch --quiet --decrypt --passphrase-fd 3 "$newest" 3<<<"$key" |
    docker run --rm -i -v "$test_vol":/restore "$HELPER_IMAGE" tar xzf - -C /restore

  # The only question that matters: is the restored tree identical to live?
  if docker run --rm -v "$VOLUME":/live:ro -v "$test_vol":/restored:ro "$HELPER_IMAGE" \
    diff -r /live /restored; then
    echo "RESTORE VERIFIED: restored tree is identical to the live volume"
  else
    echo "RESTORE MISMATCH (see diff above)" >&2
    rc=1
  fi

  docker volume rm "$test_vol" >/dev/null
  return $rc
}

cmd_list() {
  ls -1thl "$BACKUP_DIR"/cortex-sync-*.tar.gz.gpg 2>/dev/null || echo "no backups yet in $BACKUP_DIR"
  [ -r "$STAMP" ] && echo "last successful run: $(cat "$STAMP")"
  return 0
}

case "${1:-}" in
  --init) cmd_init ;;
  --run) cmd_run ;;
  --verify-restore) cmd_verify_restore ;;
  --list) cmd_list ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage
    exit 2
    ;;
esac
