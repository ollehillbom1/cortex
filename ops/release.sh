#!/usr/bin/env bash
#
# Cut a release: prepare the changelog by PR, then tag what main actually got.
#
# "Deploy main" is not a release. It cannot be pointed at, compared, or
# rolled back to, and two deploys of "main" an hour apart are different
# software with the same name. A release is a git tag, an image tag that
# matches it, and a changelog entry saying what changed.
#
# TWO PHASES, because main is protected and everything goes through a PR —
# including the release commit. The first version of this script committed
# the changelog straight onto main, which both violates that rule and is
# rejected by branch protection (a fresh commit has no passing checks yet).
#
#   prepare <version>  branch, changelog, version bump, push, open the PR
#   tag <version>      after that PR merges: verify CI is green on main and
#                      create the annotated tag + matching image
#
# The gate before tagging is deliberate: the tag must mean "this passed",
# so the script refuses a dirty tree, a non-main branch, a commit that is
# not on origin, or a commit whose CI is not green.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  cat >&2 <<'EOF'
usage: release.sh prepare <version>
       release.sh tag <version> [--skip-ci-check]

  prepare  branch off main, write the changelog entry, bump package.json,
           push and open the release PR
  tag      once that PR is merged: verify main is green and create the
           annotated tag plus the matching image

  --skip-ci-check  tag without requiring green CI (emergencies only; say so
                   in the changelog entry if you use it)

Afterwards:
  ops/deploy.sh --env staging --tag v<version>   # let it live somewhere first
  ops/deploy.sh --env prod --tag v<version>
EOF
}

COMMAND="${1:-}"
VERSION="${2:-}"
case "$COMMAND" in
  -h | --help)
    usage
    exit 0
    ;;
  prepare | tag) ;;
  *)
    usage
    exit 2
    ;;
esac
echo "${VERSION:-}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' ||
  { echo "version must be semver, e.g. 1.0.0" >&2; exit 2; }
SKIP_CI=0
[ "${3:-}" = "--skip-ci-check" ] && SKIP_CI=1

TAG="v$VERSION"
RELEASE_BRANCH="release/$TAG"

require_clean_main() {
  [ -z "$(git status --porcelain)" ] || { echo "working tree is dirty" >&2; exit 1; }
  [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "releases are cut from main" >&2; exit 1; }
  git fetch -q origin
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
    { echo "HEAD is not origin/main — push or pull first" >&2; exit 1; }
}

require_green_ci() {
  [ "$SKIP_CI" = 1 ] && { echo "SKIPPING CI CHECK (--skip-ci-check)"; return 0; }
  echo "checking CI for $(git rev-parse --short HEAD)…"
  local conclusions
  conclusions=$(gh run list --commit "$(git rev-parse HEAD)" --json conclusion,status \
    --jq '.[] | select(.status=="completed") | .conclusion' 2>/dev/null || true)
  [ -n "$conclusions" ] || { echo "no completed CI runs for this commit yet — wait for them" >&2; exit 1; }
  if echo "$conclusions" | grep -qv '^success$'; then
    echo "CI is not green for this commit:" >&2
    echo "$conclusions" | sed 's/^/  /' >&2
    exit 1
  fi
  echo "CI green"
}

if [ "$COMMAND" = prepare ]; then
  require_clean_main
  git rev-parse "$TAG" >/dev/null 2>&1 && { echo "tag $TAG already exists" >&2; exit 1; }

  PREVIOUS_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)
  RANGE="${PREVIOUS_TAG:+$PREVIOUS_TAG..}HEAD"
  ENTRIES=$(git log --no-merges --pretty='- %s' "$RANGE")

  git checkout -q -b "$RELEASE_BRANCH"
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

  # package.json is the version a bug report quotes; keep it and the tag in
  # lockstep rather than letting them drift apart.
  node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = process.argv[1];
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$VERSION"

  git add CHANGELOG.md package.json
  git commit -q -m "chore(release): $TAG"
  git push -q -u origin "$RELEASE_BRANCH"
  gh pr create --title "chore(release): $TAG" \
    --body "Changelog and version bump for $TAG. Merge, then: \`ops/release.sh tag $VERSION\`." >/dev/null
  echo "release PR opened for $TAG — merge it, then run: ops/release.sh tag $VERSION"
  exit 0
fi

# --- tag ---------------------------------------------------------------------

require_clean_main
git rev-parse "$TAG" >/dev/null 2>&1 && { echo "tag $TAG already exists" >&2; exit 1; }
grep -q "^## $TAG " CHANGELOG.md 2>/dev/null ||
  { echo "main has no changelog entry for $TAG — run: $0 prepare $VERSION" >&2; exit 1; }
require_green_ci

git tag -a "$TAG" -m "$TAG"
git push -q origin "$TAG"

echo "building cortex:$TAG"
docker buildx build --platform linux/amd64 --load -t "cortex:$TAG" . >/dev/null
# `latest` follows the newest release, so a bare `docker run cortex:latest` is
# a released build rather than whatever was last compiled by hand.
docker tag "cortex:$TAG" cortex:latest

echo
echo "released $TAG (image cortex:$TAG, also tagged latest)"
echo "stage it:  ops/deploy.sh --env staging --tag $TAG"
echo "ship it:   ops/deploy.sh --env prod --tag $TAG"
