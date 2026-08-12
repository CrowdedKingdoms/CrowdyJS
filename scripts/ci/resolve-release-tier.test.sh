#!/usr/bin/env bash
# Proves resolve-release-tier.sh REFUSES, against a real git repository with real branches.
#
# The acceptance cases are here for a specific reason and not as padding: a check that always
# fails passes every refusal test. Both directions, or neither is evidence.
#
# The containment case is built the way the defect actually happens — a commit on `dev` that
# has not been merged to `prod`, tagged `prod/vX.Y.Z` — rather than by tagging a detached
# commit no branch has ever had.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT="$HERE/resolve-release-tier.sh"
[ -x "$SCRIPT" ] || { echo "not executable: $SCRIPT" >&2; exit 1; }

PASS=0
FAIL=0

# THIS TEST MUST NOT READ THE ENVIRONMENT IT RUNS IN. Every one of these variables is an input
# the script falls back to, so leaving them set makes the result depend on where the test ran:
# inside Actions the empty-ref case picked up the runner's own GITHUB_REF and was refused as
# "is a branch, not a tag" -- still a refusal, still a green-looking `ok` had the message not
# been checked, and 13/1 instead of 14/0. GITHUB_OUTPUT was already unset here against exactly
# this hazard; the other two were the half nobody extended it to.
unset GITHUB_OUTPUT GITHUB_REF GITHUB_SHA

ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

# expect_refusal <name> <ref> <sha> <substring the message must contain>
expect_refusal() {
  local name=$1 ref=$2 sha=$3 want=$4 out rc
  out=$("$SCRIPT" "$ref" "$sha" 2>&1)
  rc=$?
  if [ $rc -eq 0 ]; then
    no "$name: expected refusal, got exit 0 and: $out"
  elif ! grep -qF -- "$want" <<<"$out"; then
    no "$name: refused (good) but message lacks '$want': $out"
  else
    ok "$name"
  fi
}

# expect_accept <name> <ref> <sha> <expected tier> <expected version>
expect_accept() {
  local name=$1 ref=$2 sha=$3 tier=$4 version=$5 out rc
  out=$("$SCRIPT" "$ref" "$sha" 2>&1)
  rc=$?
  if [ $rc -ne 0 ]; then
    no "$name: expected acceptance, got exit $rc and: $out"
  elif ! grep -qx -- "tier=$tier" <<<"$out"; then
    no "$name: accepted but tier is not '$tier': $out"
  elif ! grep -qx -- "version=$version" <<<"$out"; then
    no "$name: accepted but version is not '$version': $out"
  else
    ok "$name"
  fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# A bare "remote" plus a clone, so the script's `git fetch origin` is a real fetch and the
# remote-tracking refs are real. Testing against a repo with no remote would exercise a
# different code path than CI runs.
git init --quiet --bare "$WORK/remote.git"
git clone --quiet "$WORK/remote.git" "$WORK/repo" 2>/dev/null
cd "$WORK/repo"
git config user.email ci@example.com
git config user.name CI
git config commit.gpgsign false

commit() { echo "$1" >>log.txt; git add log.txt; git commit --quiet -m "$1"; git rev-parse HEAD; }

BASE=$(commit base)
git branch -M prod
git push --quiet origin prod
git checkout --quiet -b test
git push --quiet origin test
git checkout --quiet -b dev
DEV_ONLY=$(commit "on dev only")
git push --quiet origin dev
git fetch --quiet origin

echo "resolve-release-tier.sh"
echo
echo "refusals:"

expect_refusal "commit on dev only, tagged prod/  -> refused" \
  "refs/tags/prod/v1.2.3" "$DEV_ONLY" "is NOT contained in origin/prod"

expect_refusal "commit on dev only, tagged test/  -> refused" \
  "refs/tags/test/v1.2.3" "$DEV_ONLY" "is NOT contained in origin/test"

expect_refusal "bare semver tag (retired convention) -> refused" \
  "refs/tags/v1.2.3" "$BASE" "carries no environment prefix"

expect_refusal "unknown environment prefix -> refused" \
  "refs/tags/staging/v1.2.3" "$BASE" "is not one of dev, test, prod"

expect_refusal "pre-release suffix -> refused" \
  "refs/tags/prod/v1.2.3-rc1" "$BASE" "expected vMAJOR.MINOR.PATCH"

expect_refusal "build-metadata suffix -> refused" \
  "refs/tags/prod/v1.2.3+test" "$BASE" "expected vMAJOR.MINOR.PATCH"

expect_refusal "two-component version -> refused" \
  "refs/tags/prod/v1.2" "$BASE" "expected vMAJOR.MINOR.PATCH"

expect_refusal "a branch ref, not a tag -> refused" \
  "refs/heads/prod" "$BASE" "is a branch, not a tag"

expect_refusal "empty ref -> refused" \
  "" "$BASE" "no tag ref given"

# All three branches exist on the remote, so this case has to remove one first. It matters
# because a repo part-way through this migration has exactly this shape.
git push --quiet origin --delete dev
git update-ref -d refs/remotes/origin/dev
expect_refusal "environment branch missing on the remote -> refused" \
  "refs/tags/dev/v1.2.3" "$BASE" "does not exist"
git push --quiet origin dev
git fetch --quiet origin

echo
echo "acceptances:"

expect_accept "commit on dev, tagged dev/   -> accepted" \
  "refs/tags/dev/v1.2.3" "$DEV_ONLY" dev v1.2.3

expect_accept "base commit, tagged prod/    -> accepted" \
  "refs/tags/prod/v9.10.11" "$BASE" prod v9.10.11

expect_accept "base commit, tagged test/    -> accepted" \
  "refs/tags/test/v0.0.1" "$BASE" test v0.0.1

# Promotion: once dev is merged into prod, the SAME commit that was refused above is accepted.
# This is the case that proves the refusal was about containment and not about the word "prod".
git checkout --quiet prod
git merge --quiet --no-edit "$DEV_ONLY"
git push --quiet origin prod
git fetch --quiet origin

expect_accept "after merge to prod, same commit tagged prod/ -> accepted" \
  "refs/tags/prod/v1.2.3" "$DEV_ONLY" prod v1.2.3

# PRECEDENCE. These two exist because the defect they catch was invisible without them: the
# empty-ref case above passed everywhere, for the right reason locally and the wrong reason on
# a runner, where it silently read the runner's own GITHUB_REF. An explicit argument must win
# over the ambient environment, and an explicitly empty argument must STAY empty rather than
# falling through to it -- which is why the script reads `${1-...}` and not `${1:-...}`.
echo
echo "argument vs environment:"

GITHUB_REF="refs/tags/prod/v9.9.9" GITHUB_SHA="$BASE" \
  expect_refusal "explicitly empty ref is not filled in from GITHUB_REF" \
    "" "$BASE" "no tag ref given"

# The no-argument path is the one CI actually uses, so it needs a case of its own; without it
# a fix to the above could break the real caller and every test would still pass.
out=$(GITHUB_REF="refs/tags/dev/v3.2.1" GITHUB_SHA="$DEV_ONLY" "$SCRIPT" 2>&1)
if [ $? -ne 0 ]; then
  no "no arguments falls back to the environment (the CI path): expected acceptance, got: $out"
elif ! grep -qx "tier=dev" <<<"$out" || ! grep -qx "version=v3.2.1" <<<"$out"; then
  no "no arguments falls back to the environment (the CI path): wrong result: $out"
else
  ok "no arguments falls back to GITHUB_REF / GITHUB_SHA (the CI path)"
fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
