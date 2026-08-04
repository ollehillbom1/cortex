#!/usr/bin/env bash
#
# Cortex watchdog: probe the live deployment and page a human when it breaks.
#
# Logs are not monitoring. Before this script the only thing standing between
# a dead container and a family member noticing was a family member noticing.
#
# WHERE THIS SHOULD RUN
#   Ideally on a machine that is NOT the Docker host, because a watchdog on
#   oh-III cannot report that oh-III is down. The public probe below goes
#   through the reverse proxy, so running it from the RPi (or any other
#   tailnet host) covers the whole chain. Running it ON the Docker host still
#   catches the failures that actually happen most — container exited, app
#   unhealthy, proxy or certificate broken, disk full — so it is worth having
#   there until an off-box home exists. `--local-checks` adds the Docker and
#   disk probes, which only make sense on the host itself.
#
# ALARM PATH
#   POST {to, message} to the 4G-router SMS gateway (n8n webhook over
#   Tailscale) configured in ~/.hermes/.env. `hermes send -t sms` does NOT
#   work — the webhook backend was never merged into the running agent — so
#   this script talks to the gateway directly. WhatsApp DM is the fallback.
#   Cron does not export ~/.hermes/.env, so the script sources it explicitly.
#
# EXIT STATUS
#   0 healthy · 1 unhealthy (alarm handled) · 2 misconfigured/usage error

set -uo pipefail

PROBE_URL="${CORTEX_PROBE_URL:-https://ohillbo.se:9922/api/health}"
CONTAINER="${CORTEX_CONTAINER:-cortex}"
# Two consecutive failures before paging: a single blip during a redeploy is
# not an outage, and an alarm that cries wolf gets muted by its reader.
FAIL_THRESHOLD="${CORTEX_FAIL_THRESHOLD:-2}"
# Re-page this often while still down, so a night-time outage is not one
# forgotten message at 03:00.
REPEAT_ALERT_SECONDS="${CORTEX_REPEAT_ALERT_SECONDS:-21600}" # 6h
CERT_WARN_DAYS="${CORTEX_CERT_WARN_DAYS:-14}"
DISK_WARN_PERCENT="${CORTEX_DISK_WARN_PERCENT:-90}"
STATE_DIR="${CORTEX_WATCHDOG_STATE_DIR:-$HOME/.local/state/cortex-watchdog}"
STATE_FILE="$STATE_DIR/state"
HERMES_ENV="${HERMES_ENV:-$HOME/.hermes/.env}"

usage() {
  cat >&2 <<'EOF'
usage: watchdog.sh [--local-checks] [--test-alarm] [--self-test] [--quiet]

  --local-checks  also probe Docker container health and disk space
                  (only meaningful on the Docker host)
  --test-alarm    send one real alarm and exit, to prove the path works
  --self-test     run the state machine against fake probes, no network, no SMS
  --quiet         only print on trouble (for cron)
EOF
}

log() {
  local level="$1"
  shift
  # In cron (--quiet) only trouble is worth a line; a healthy run that mails
  # output every five minutes trains its reader to ignore the mail.
  if [ "${QUIET:-0}" = 1 ] && [ "$level" = info ]; then return 0; fi
  printf '%s [%s] %s\n' "$(date -Is)" "$level" "$*"
}

# --- notification ------------------------------------------------------------

# Overridable so the self-test can capture messages instead of sending them.
send_alarm() {
  local message="$1"
  if [ -n "${WATCHDOG_FAKE_SENDER:-}" ]; then
    printf '%s\n' "$message" >>"$WATCHDOG_FAKE_SENDER"
    return 0
  fi

  # shellcheck disable=SC1090
  if [ -r "$HERMES_ENV" ]; then set -a; . "$HERMES_ENV"; set +a; fi

  if [ -n "${SMS_GATEWAY_URL:-}" ] && [ -n "${SMS_HOME_CHANNEL:-}" ]; then
    local payload response sent
    payload=$(TO="$SMS_HOME_CHANNEL" MSG="$message" python3 -c \
      'import json,os;print(json.dumps({"to":os.environ["TO"],"message":os.environ["MSG"]}))')
    response=$(curl -s --max-time 20 -X POST -H 'Content-Type: application/json' \
      -d "$payload" "$SMS_GATEWAY_URL" 2>/dev/null)
    # The gateway answers {sent,failed,errors[]}; sent>=1 is delivery.
    sent=$(printf '%s' "$response" | python3 -c \
      'import json,sys
try: print(json.load(sys.stdin).get("sent",0))
except Exception: print(0)' 2>/dev/null)
    if [ "${sent:-0}" -ge 1 ] 2>/dev/null; then
      log info "alarm sent via SMS gateway"
      return 0
    fi
    log warn "SMS gateway did not confirm delivery (response: ${response:-none})"
  else
    log warn "SMS gateway not configured in $HERMES_ENV"
  fi

  # Fallback: a message that arrives on another channel beats one that does not
  # arrive at all.
  if command -v hermes >/dev/null 2>&1 &&
    hermes send -t "whatsapp:Olle Hillbom (dm)" "$message" >/dev/null 2>&1; then
    log info "alarm sent via WhatsApp fallback"
    return 0
  fi
  log error "NO ALARM CHANNEL WORKED — message was: $message"
  return 1
}

# --- probes ------------------------------------------------------------------

# Each probe prints a human-readable reason on failure and returns non-zero.

probe_http() {
  local body code
  body=$(curl -s --max-time 15 -o /tmp/cortex-watchdog-body.$$ -w '%{http_code}' "$PROBE_URL" 2>/dev/null)
  code="$body"
  body=$(cat /tmp/cortex-watchdog-body.$$ 2>/dev/null); rm -f /tmp/cortex-watchdog-body.$$
  if [ "$code" != "200" ]; then
    echo "health endpoint returned HTTP ${code:-no-response}"
    return 1
  fi
  case "$body" in
    *'"status":"ok"'*) return 0 ;;
    *) echo "health endpoint answered 200 but said: ${body:0:80}"; return 1 ;;
  esac
}

probe_cert() {
  local host port end days
  host=$(printf '%s' "$PROBE_URL" | sed -E 's#https?://([^:/]+).*#\1#')
  port=$(printf '%s' "$PROBE_URL" | sed -nE 's#https?://[^:/]+:([0-9]+).*#\1#p'); port="${port:-443}"
  case "$PROBE_URL" in https://*) ;; *) return 0 ;; esac
  command -v openssl >/dev/null 2>&1 || return 0
  end=$(echo | timeout 15 openssl s_client -servername "$host" -connect "$host:$port" 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -n "$end" ] || return 0 # cert unreadable is the HTTP probe's business, not ours
  days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  if [ "$days" -lt "$CERT_WARN_DAYS" ]; then
    echo "TLS certificate expires in ${days} day(s)"
    return 1
  fi
  return 0
}

probe_container() {
  command -v docker >/dev/null 2>&1 || return 0
  local state health
  state=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null) || {
    echo "container '$CONTAINER' does not exist"; return 1; }
  if [ "$state" != "running" ]; then
    echo "container '$CONTAINER' is $state"
    return 1
  fi
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER" 2>/dev/null)
  if [ -n "$health" ] && [ "$health" != "healthy" ]; then
    echo "container '$CONTAINER' health is $health"
    return 1
  fi
  return 0
}

probe_backup() {
  # A backup cron that dies quietly is indistinguishable from no backup at
  # all — until the day it is needed. The backup script stamps a file on
  # every SUCCESSFUL run; this alarms when that stamp goes stale.
  local stamp="${CORTEX_BACKUP_STAMP:-$HOME/cortex-backups/.last-success}"
  local max_age="${CORTEX_BACKUP_MAX_AGE_HOURS:-30}" # nightly + slack
  [ -e "$stamp" ] || {
    echo "no successful backup has ever been recorded ($stamp missing)"
    return 1
  }
  local age_hours=$(((($(date +%s) - $(stat -c %Y "$stamp")) / 3600)))
  if [ "$age_hours" -ge "$max_age" ]; then
    echo "last successful backup was ${age_hours}h ago"
    return 1
  fi
  return 0
}

probe_disk() {
  # The sync volume lives on the root partition; a full disk stops every write
  # and the app keeps answering 200 until it tries one.
  local used
  used=$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')
  [ -n "$used" ] || return 0
  if [ "$used" -ge "$DISK_WARN_PERCENT" ]; then
    echo "root filesystem is ${used}% full"
    return 1
  fi
  return 0
}

run_probes() {
  local reasons=() out
  if [ -n "${WATCHDOG_FAKE_PROBE:-}" ]; then
    # Self-test injection: "ok" or "fail:<reason>".
    case "$WATCHDOG_FAKE_PROBE" in
      ok) return 0 ;;
      fail:*) echo "${WATCHDOG_FAKE_PROBE#fail:}"; return 1 ;;
    esac
  fi
  if ! out=$(probe_http); then reasons+=("$out"); fi
  if ! out=$(probe_cert); then reasons+=("$out"); fi
  if [ "${LOCAL_CHECKS:-0}" = 1 ]; then
    if ! out=$(probe_container); then reasons+=("$out"); fi
    if ! out=$(probe_disk); then reasons+=("$out"); fi
    if ! out=$(probe_backup); then reasons+=("$out"); fi
  fi
  if [ ${#reasons[@]} -gt 0 ]; then
    local joined=""
    for out in "${reasons[@]}"; do joined="${joined:+$joined; }$out"; done
    printf '%s' "$joined"
    return 1
  fi
  return 0
}

# --- state machine -----------------------------------------------------------

read_state() {
  FAILURES=0; LAST_STATE=ok; LAST_ALERT=0
  # shellcheck disable=SC1090
  [ -r "$STATE_FILE" ] && . "$STATE_FILE"
  FAILURES=${FAILURES:-0}; LAST_STATE=${LAST_STATE:-ok}; LAST_ALERT=${LAST_ALERT:-0}
}

write_state() {
  mkdir -p "$(dirname "$STATE_FILE")"
  printf 'FAILURES=%s\nLAST_STATE=%s\nLAST_ALERT=%s\n' "$1" "$2" "$3" >"$STATE_FILE"
}

evaluate() {
  local now reason ok=1
  now=$(date +%s)
  read_state
  if reason=$(run_probes); then ok=0; fi

  if [ "$ok" = 0 ]; then
    if [ "$LAST_STATE" = down ]; then
      send_alarm "Cortex is back: $PROBE_URL answers again."
      log info "recovered"
    else
      log info "healthy"
    fi
    write_state 0 ok "$LAST_ALERT"
    return 0
  fi

  FAILURES=$((FAILURES + 1))
  log warn "probe failed ($FAILURES/$FAIL_THRESHOLD): $reason"
  if [ "$FAILURES" -lt "$FAIL_THRESHOLD" ]; then
    write_state "$FAILURES" "$LAST_STATE" "$LAST_ALERT"
    return 1
  fi

  local due=$((LAST_ALERT + REPEAT_ALERT_SECONDS))
  if [ "$LAST_STATE" != down ] || [ "$now" -ge "$due" ]; then
    send_alarm "Cortex DOWN: $reason ($PROBE_URL)"
    LAST_ALERT=$now
  fi
  write_state "$FAILURES" down "$LAST_ALERT"
  return 1
}

# --- self-test ---------------------------------------------------------------
# Proves the state machine without touching the network or sending an SMS: a
# safety net nobody exercises is not a safety net.

self_test() {
  local dir sent rc=0
  dir=$(mktemp -d); sent="$dir/sent"; : >"$sent"
  export CORTEX_WATCHDOG_STATE_DIR="$dir/state" WATCHDOG_FAKE_SENDER="$sent"
  STATE_FILE="$dir/state/state"
  export CORTEX_FAIL_THRESHOLD=2 CORTEX_REPEAT_ALERT_SECONDS=21600
  FAIL_THRESHOLD=2; REPEAT_ALERT_SECONDS=21600

  assert() { # assert <expected-count> <label>
    local want="$1" label="$2" got
    got=$(wc -l <"$sent" | tr -d ' ')
    if [ "$got" != "$want" ]; then
      echo "FAIL: $label — expected $want alarm(s), got $got"; rc=1
    else
      echo "ok: $label"
    fi
  }

  WATCHDOG_FAKE_PROBE=ok evaluate >/dev/null; assert 0 "healthy sends nothing"
  WATCHDOG_FAKE_PROBE="fail:boom" evaluate >/dev/null
  assert 0 "first failure is not an alarm (blip tolerance)"
  WATCHDOG_FAKE_PROBE="fail:boom" evaluate >/dev/null
  assert 1 "second consecutive failure pages"
  WATCHDOG_FAKE_PROBE="fail:boom" evaluate >/dev/null
  assert 1 "still down does not re-page inside the repeat window"
  # Pretend the repeat window has passed.
  write_state 3 down "$(( $(date +%s) - 22000 ))"
  WATCHDOG_FAKE_PROBE="fail:boom" evaluate >/dev/null
  assert 2 "re-pages once the repeat window has passed"
  WATCHDOG_FAKE_PROBE=ok evaluate >/dev/null
  assert 3 "recovery is announced"
  WATCHDOG_FAKE_PROBE=ok evaluate >/dev/null
  assert 3 "staying healthy stays quiet"
  # A failure after recovery must page again (counter was reset).
  WATCHDOG_FAKE_PROBE="fail:again" evaluate >/dev/null
  WATCHDOG_FAKE_PROBE="fail:again" evaluate >/dev/null
  assert 4 "a new outage pages again"

  rm -rf "$dir"
  [ "$rc" = 0 ] && echo "self-test passed" || echo "self-test FAILED"
  return $rc
}

# --- entry point -------------------------------------------------------------

LOCAL_CHECKS=0; QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --local-checks) LOCAL_CHECKS=1 ;;
    --quiet) QUIET=1 ;;
    --self-test) self_test; exit $? ;;
    --test-alarm)
      send_alarm "Cortex watchdog test alarm from $(hostname) at $(date -Is). If you read this, the alarm path works."
      exit $?
      ;;
    -h | --help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
  shift
done

evaluate
