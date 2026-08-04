#!/usr/bin/env bash
#
# Cut a release: verify, tag, build a named image.
#
# "Deploy main" is not a release. It cannot be pointed at, compared, or
# rolled back to, and two deploys of "main" an hour apart are different
# software with the same name. A release is a git tag, an image tag that
# matches it, and a changelog entry saying what changed.
#
# The gate before tagging is deliberate: the tag must mean "this passed",
# so the script refuses to tag a dirty tree, a non-main branch, a commit
# that is not on origin, or a commit whose CI is not green.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  cat >&2 <<'EOF'
usage: release.sh <version> [--skip-ci-check]

  <version>        semver without the v, e.g. 1.0.0
  --skip-ci-check  do not require green CI (for offline/emergency use;
                   say so in the changelog entry if you use it)

Afterwards:
  ops/deploy.sh --env staging --tag v<version>   # let it live somewhere first
  ops/deploy.sh --env prod --tag v<version>
EOF
}

VERSION="${1:-}"
[ -n "$VERSION" ] || { usage; exit 2; }
[ "$VERSION" = "-h" ] || [ "$VERSION" = "--help" ] && { usage; exit 0; }
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "version must be semver, e.g. 1.0.0" >&2; exit 2; }
SKIP_CI=0
[ "${2:-}" = "--skip-ci-check" ] && SKIP_CI=1

TAG="v$VERSION"

# --- gates -------------------------------------------------------------------

[ -z "$(git status --porcelain)" ] || { echo "working tree is dirty" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "releases are cut from main" >&2; exit 1; }
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
  { echo "HEAD is not origin/main — push or pull first" >&2; exit 1; }
git rev-parse "$TAG" >/dev/null 2>&1 && { echo "tag $TAG already exists" >&2; exit 1; }

if [ "$SKIP_CI" = 0 ]; then
  echo "checking CI for $(git rev-parse --short HEAD)…"
  conclusions=$(gh run list --commit "$(git rev-parse HEAD)" --json conclusion,status \
    --jq '.[] | select(.status=="completed") | .conclusion' 2>/dev/null || true)
  [ -n "$conclusions" ] || { echo "no completed CI runs for this commit" >&2; exit 1; }
  if echo "$conclusions" | grep -qv '^success$'; then
    echo "CI is not green for this commit:" >&2
    echo "$conclusions" | sed 's/^/  /' >&2
    exit 1
  fi
  echo "CI green"
fi

# --- changelog ---------------------------------------------------------------

PREVIOUS_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)
RANGE="${PREVIOUS_TAG:+$PREVIOUS_TAG..}HEAD"
ENTRIES=$(git log --no-merges --pretty='- %s' "$RANGE")

TMP=$(mktemp)
{
  echo "# Changelog"
  echo
  echo "## $TAG — $(date +%Y-%m-%d)"
  echo
  echo "$ENTRIES"
  echo
  if [ -f CHANGELOG.md ]; then tail -n +2 CHANGELOG.md; fi
} >"$TMP"
mv "$TMP" CHANGELOG.md

# package.json is the version users see in an export/bug report; keep it and
# the tag in lockstep rather than letting them drift apart.
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = process.argv[1];
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$VERSION"

git add CHANGELOG.md package.json
git commit -q -m "chore(release): $TAG"
git tag -a "$TAG" -m "$TAG"

echo "building cortex:$TAG"
docker buildx build --platform linux/amd64 --load -t "cortex:$TAG" . >/dev/null
# `latest` follows the newest release, so a bare `docker run cortex:latest`
# is a released build rather than whatever was last compiled by hand.
docker tag "cortex:$TAG" cortex:latest

echo
echo "released $TAG (image cortex:$TAG, also tagged latest)"
echo "push it:   git push origin main --follow-tags"
echo "stage it:  ops/deploy.sh --env staging --tag $TAG"
echo "ship it:   ops/deploy.sh --env prod --tag $TAG"
