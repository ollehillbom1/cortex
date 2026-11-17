#!/usr/bin/env bash
#
# Deploy a specific image tag to staging or production.
#
# Two things this fixes. First, "deploy" used to mean "build whatever is in
# the working tree and run it", so what production ran was a property of one
# shell's history — and rollback was a single `cortex:previous` tag that the
# next deploy overwrote. Deploying a NAMED tag makes both the current state
# and the rollback target things you can point at.
#
# Second, the hardened runtime flags lived in a session's memory and a
# document. They live here now, in one place, checked by a test that fails
# the build if any of them is dropped (ops/deployContract.test.ts).
#
# Rollback is therefore just: ops/deploy.sh --env prod --tag v1.2.2

set -euo pipefail

ENVIRONMENT=prod
TAG=""
TIMEOUT="${CORTEX_DEPLOY_HEALTH_TIMEOUT:-60}"

usage() {
  cat >&2 <<'EOF'
usage: deploy.sh --tag <image-tag> [--env prod|staging] [--print-only]

  --tag         image tag to run, e.g. v1.2.3 (must already be built)
  --env         prod (port 9922, live sync volume) or staging
                (port 9923, throwaway volume). Default: prod
  --print-only  show the docker command without running it

Production and staging never share a volume: staging exists to be broken.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:-}"; shift ;;
    --env) ENVIRONMENT="${2:-}"; shift ;;
    --print-only) PRINT_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
  shift
done

[ -n "$TAG" ] || { usage; exit 2; }

# Host-local settings that must not live in version control (addresses of
# this machine). Only the one key is read — the file is not sourced, so it
# cannot set anything else — and the environment wins over the file.
DEPLOY_ENV_FILE="${CORTEX_DEPLOY_ENV_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/cortex/deploy.env}"
if [ -z "${CORTEX_PROD_PROXY_ADDRS:-}" ] && [ -r "$DEPLOY_ENV_FILE" ]; then
  # Accepts `KEY=v`, `export KEY=v`, indentation, quotes, a trailing comment
  # and CRLF; the last assignment wins, as it would in a shell.
  CORTEX_PROD_PROXY_ADDRS=$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?CORTEX_PROD_PROXY_ADDRS=//p' "$DEPLOY_ENV_FILE" |
    tail -n 1 | tr -d "\"'\r" | sed -E 's/[[:space:]]+#.*$//')
fi

refuse_addrs() {
  echo "CORTEX_PROD_PROXY_ADDRS: $1" >&2
  echo "name the specific address(es) the reverse proxy reaches this host on" >&2
  echo "(e.g. in $DEPLOY_ENV_FILE), or \"none\" for loopback only" >&2
  exit 2
}

# One proxy-facing address in, one normalized literal out — or a refusal.
# An allow-list, not a deny-list: a wildcard has too many spellings (an empty
# field, ::0, [0.0.0.0], ::ffff:0.0.0.0) and Docker reads every one of them
# as "all interfaces", past the host firewall.
proxy_addr() {
  local a="$1" o
  if [[ "$a" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]]; then
    for o in "${BASH_REMATCH[@]:1}"; do
      [ "$((10#$o))" -le 255 ] || refuse_addrs "not an IPv4 address: $a"
    done
    [ "$((10#${BASH_REMATCH[1]}))" -ne 0 ] || refuse_addrs "unspecified/wildcard address: $a"
    [ "$((10#${BASH_REMATCH[1]}))" -ne 127 ] || refuse_addrs "loopback is always published: $a"
    printf '%d.%d.%d.%d' "$((10#${BASH_REMATCH[1]}))" "$((10#${BASH_REMATCH[2]}))" \
      "$((10#${BASH_REMATCH[3]}))" "$((10#${BASH_REMATCH[4]}))"
  elif [[ "$a" =~ ^\[?([0-9A-Fa-f:]+)\]?$ ]] && [[ "${BASH_REMATCH[1]}" == *:*:* ]]; then
    a="${BASH_REMATCH[1]}"
    [ -n "${a//[0:]/}" ] || refuse_addrs "unspecified/wildcard address: $a"
    [[ ! "$a" =~ ^[0:]*1$ ]] || refuse_addrs "loopback is always published: $a"
    # IPv4-mapped (::ffff:…) includes ::ffff:0:0 = 0.0.0.0; link-local fe80::/10
    # needs a %zone Docker cannot bind. Neither is a sensible proxy address.
    [[ ! "${a,,}" =~ (^|:)ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$ ]] || refuse_addrs "IPv4-mapped IPv6 address, use the IPv4 form: $a"
    [[ ! "${a,,}" =~ ^fe[89ab] ]] || refuse_addrs "link-local address needs a zone and cannot be published: $a"
    # Write IPv6 the way `ip -o addr` prints it (compressed, lower case):
    # the pre-deploy check compares literally.
    [[ "$a" != *::*::* ]] || refuse_addrs "not an IPv6 address: $a"
    printf '[%s]' "${a,,}"
  else
    refuse_addrs "not a plain IPv4 or IPv6 address: '$a'"
  fi
}

PROXY_BIND=()
case "$ENVIRONMENT" in
  prod)
    NAME=cortex
    HOST_PORT=9922
    VOLUME=cortex-sync
    # Production used to publish on 0.0.0.0, which put the app on every
    # interface of the host (LAN included) and past the host firewall, since
    # Docker-published ports bypass it. The only consumer off-host is the
    # reverse proxy, so bind loopback (the health check below uses it) plus
    # exactly the address(es) the proxy reaches this host on.
    #
    # Required, not defaulted: loopback alone deploys "healthy" (the health
    # check runs here) while the public app behind the proxy answers 503 —
    # which happened on 2026-11-17. Only the literal "none" means loopback-only.
    PUBLISH=(-p "127.0.0.1:$HOST_PORT:3000")
    raw="${CORTEX_PROD_PROXY_ADDRS:-}"
    [[ "$raw" != *$'\n'* ]] || refuse_addrs "contains a newline"
    raw="${raw#"${raw%%[![:space:]]*}"}"; raw="${raw%"${raw##*[![:space:]]}"}"
    [ -n "$raw" ] || refuse_addrs "not set (no value in the environment or in $DEPLOY_ENV_FILE)"
    if [ "$raw" != none ]; then
      # read -ra, not an unquoted expansion: that would glob-expand "*".
      # Commas are the separator; whitespace around them is ignored, and an
      # empty field (stray comma) is refused — Docker reads it as 0.0.0.0.
      [[ "$raw" != *, ]] || refuse_addrs "empty element in '$raw'"
      IFS=',' read -ra fields <<<"$raw"
      for field in "${fields[@]}"; do
        field="${field#"${field%%[![:space:]]*}"}"; field="${field%"${field##*[![:space:]]}"}"
        [ -n "$field" ] || refuse_addrs "empty element in '$raw'"
        IFS=$' \t' read -ra words <<<"$field"
        for word in "${words[@]}"; do
          addr=$(proxy_addr "$word")
          case " ${PROXY_BIND[*]-} " in *" $addr "*) continue ;; esac  # dedupe
          PROXY_BIND+=("$addr")
          PUBLISH+=(-p "$addr:$HOST_PORT:3000")
        done
      done
      [ "${#PROXY_BIND[@]}" -gt 0 ] || refuse_addrs "no address in '$raw'"
    fi
    ;;
  staging)
    NAME=cortex-staging
    HOST_PORT=9923
    # Loopback only: staging is not something the family should find.
    PUBLISH=(-p "127.0.0.1:$HOST_PORT:3000")
    VOLUME=cortex-sync-staging
    ;;
  *) echo "unknown environment: $ENVIRONMENT" >&2; exit 2 ;;
esac

# The proxy chain in front of production ends in hops of its own (Cloudflare
# → tunnel → Apache), so the rightmost X-Forwarded-For entry the app sees is
# the chain's internal address, not the client. TRUSTED_PROXIES names those
# hops so the rate limiter can key on the real client; see clientKey() in
# src/lib/security/rateLimit.ts. Staging is loopback-only (no proxy, no XFF)
# but gets the same value so the two environments do not quietly diverge.
TRUSTED_PROXIES="${CORTEX_TRUSTED_PROXIES:-127.0.0.1}"
RUNTIME_ENV=(-e "TRUSTED_PROXIES=$TRUSTED_PROXIES")

# The hardened runtime. Every flag here was verified against the full app
# surface (pages, health, sync writes) before being made the default; see
# docs/deployment.md. Do not thin this list to make something work without
# re-verifying — the container needs nothing beyond /tmp and its volume.
HARDENING=(
  --restart unless-stopped
  --memory 512m
  --pids-limit 256
  --read-only
  --tmpfs /tmp
  --cap-drop ALL
  --security-opt no-new-privileges
  --log-opt max-size=10m
  --log-opt max-file=3
)

IMAGE="cortex:$TAG"
CMD=(docker run -d --name "$NAME" "${HARDENING[@]}" "${RUNTIME_ENV[@]}" "${PUBLISH[@]}" -v "$VOLUME:/app/data" "$IMAGE")

if [ "${PRINT_ONLY:-0}" = 1 ]; then
  printf '%q ' "${CMD[@]}"; echo
  exit 0
fi

docker image inspect "$IMAGE" >/dev/null 2>&1 ||
  { echo "image $IMAGE does not exist — build it with ops/release.sh first" >&2; exit 2; }

PREVIOUS=$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null || true)
echo "deploying $IMAGE to $ENVIRONMENT (was: ${PREVIOUS:-nothing})"

# Checked before the live container is removed: an address that is not on
# this host (typo, VPN interface down) makes `docker run` fail, and it is far
# better to refuse now than to discover that with production already gone.
if [ "${#PROXY_BIND[@]}" -gt 0 ]; then
  command -v ip >/dev/null || { echo "ip(8) not found: cannot check the proxy address(es)" >&2; exit 2; }
  local_addrs=$(ip -o addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | tr 'A-F' 'a-f')
  for addr in "${PROXY_BIND[@]}"; do
    a="${addr#[}"; a="${a%]}"
    grep -qxF "$a" <<<"$local_addrs" ||
      { echo "proxy address $a is not assigned to this host (as \`ip -o addr\` prints it) — refusing to deploy" >&2; exit 2; }
  done
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
# A failed `docker run` must reach the rollback below, not end the script
# under set -e with production removed.
"${CMD[@]}" >/dev/null || echo "docker run failed for $IMAGE" >&2

# Acceptance is "it serves", not "it started".
#
# The first version of this took `.State.Status == running` as success, and a
# deliberately broken image sailed through: a container that crash-loops is
# "running" between restarts, and with --restart unless-stopped it keeps
# looking alive for ever. Only an answer on the port proves a deploy.
deadline=$(( $(date +%s) + TIMEOUT ))
status=failed
while [ "$(date +%s)" -lt "$deadline" ]; do
  state=$(docker inspect -f '{{.State.Status}}' "$NAME" 2>/dev/null || echo gone)
  case "$state" in
    created|exited|dead|gone)  # created = docker run failed to start it
      status=failed
      break
      ;;
  esac
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$HOST_PORT/api/health" 2>/dev/null)" = 200 ]; then
    status=serving
    break
  fi
  sleep 2
done

if [ "$status" = serving ]; then
  echo "$NAME is serving on port $HOST_PORT"
else
  echo "DEPLOY FAILED: $NAME did not serve on port $HOST_PORT within ${TIMEOUT}s" >&2
  docker logs --tail 30 "$NAME" 2>&1 | sed 's/^/  /' >&2 || true
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$IMAGE" ]; then
    echo "rolling back to $PREVIOUS" >&2
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" "${HARDENING[@]}" "${RUNTIME_ENV[@]}" "${PUBLISH[@]}" -v "$VOLUME:/app/data" "$PREVIOUS" >/dev/null ||
      echo "rollback docker run failed for $PREVIOUS" >&2
    # Verify the rollback the same way, so "rolled back" is never a hope.
    rb_deadline=$(( $(date +%s) + TIMEOUT ))
    while [ "$(date +%s)" -lt "$rb_deadline" ]; do
      if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$HOST_PORT/api/health" 2>/dev/null)" = 200 ]; then
        echo "rolled back to $PREVIOUS and serving again" >&2
        exit 1
      fi
      sleep 2
    done
    echo "ROLLBACK ALSO FAILED TO SERVE — manual intervention needed" >&2
  fi
  exit 1
fi

echo "deployed $IMAGE to $ENVIRONMENT"
