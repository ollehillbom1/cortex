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

case "$ENVIRONMENT" in
  prod)
    NAME=cortex
    PORT_BINDING="0.0.0.0:9922:3000"
    VOLUME=cortex-sync
    ;;
  staging)
    NAME=cortex-staging
    # Loopback only: staging is not something the family should find.
    PORT_BINDING="127.0.0.1:9923:3000"
    VOLUME=cortex-sync-staging
    ;;
  *) echo "unknown environment: $ENVIRONMENT" >&2; exit 2 ;;
esac

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
CMD=(docker run -d --name "$NAME" "${HARDENING[@]}" -p "$PORT_BINDING" -v "$VOLUME:/app/data" "$IMAGE")

if [ "${PRINT_ONLY:-0}" = 1 ]; then
  printf '%q ' "${CMD[@]}"; echo
  exit 0
fi

docker image inspect "$IMAGE" >/dev/null 2>&1 ||
  { echo "image $IMAGE does not exist — build it with ops/release.sh first" >&2; exit 2; }

PREVIOUS=$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null || true)
echo "deploying $IMAGE to $ENVIRONMENT (was: ${PREVIOUS:-nothing})"

docker rm -f "$NAME" >/dev/null 2>&1 || true
"${CMD[@]}" >/dev/null

# Acceptance is "it serves", not "it started".
#
# The first version of this took `.State.Status == running` as success, and a
# deliberately broken image sailed through: a container that crash-loops is
# "running" between restarts, and with --restart unless-stopped it keeps
# looking alive for ever. Only an answer on the port proves a deploy.
HOST_PORT=$(printf '%s' "$PORT_BINDING" | awk -F: '{print $(NF-1)}')
deadline=$(( $(date +%s) + TIMEOUT ))
status=failed
while [ "$(date +%s)" -lt "$deadline" ]; do
  state=$(docker inspect -f '{{.State.Status}}' "$NAME" 2>/dev/null || echo gone)
  case "$state" in
    exited|dead|gone)
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
    docker run -d --name "$NAME" "${HARDENING[@]}" -p "$PORT_BINDING" -v "$VOLUME:/app/data" "$PREVIOUS" >/dev/null
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
