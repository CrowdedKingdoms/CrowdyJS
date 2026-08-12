#!/usr/bin/env bash
# Resolve the release tier from an environment-prefixed tag, and REFUSE when the tagged
# commit is not contained in that tier's branch.
#
# Tags are `dev/v1.2.3`, `test/v1.2.3`, `prod/v1.2.3`. The tier is the prefix, and it is the
# prefix rather than a suffix for reasons recorded in cks-project-root/docs/BRANCH-STRATEGY.md:
# `v1.2.3-test` is a semver PRE-release and sorts BELOW `v1.2.3`, which would invert
# createCpDeployment's "refuses an older version" guard; `v1.2.3+test` is illegal in a Docker
# tag; and a GitHub tag filter's `*` does not match `/`, so `tags: ['v*.*.*']` cannot
# accidentally catch a prefixed tag and publish it as if it were tier-agnostic.
#
# WHY THE CONTAINMENT CHECK IS THE POINT. A tag has never been attached to a branch in git —
# `git tag prod/v1.2.3 && git push origin prod/v1.2.3` from a feature branch is a valid push,
# and every release workflow in this org would have built and published it. The tag names an
# environment; nothing made the tag's COMMIT belong to that environment. This is the whole
# gate: `prod/v1.2.3` must be reachable from `origin/prod` or the run fails.
#
# It fails LOUDLY rather than skipping. A quiet no-op is the failure mode this codebase keeps
# producing — a check that has never been observed refusing is not passing, it is unproven —
# and a skipped release looks identical to a release nobody cut.
#
# Run resolve-release-tier.test.sh to see it refuse. That test builds a real git repository
# with real branches and asserts BOTH directions, because a case expecting silence passes for
# the wrong reason exactly as easily as it passes for the right one.
#
# Usage (CI):   scripts/ci/resolve-release-tier.sh              # reads GITHUB_REF / GITHUB_SHA
# Usage (test): scripts/ci/resolve-release-tier.sh <ref> <sha>
#
# Requires the full history: actions/checkout must set `fetch-depth: 0`. With the default
# shallow clone the merge-base is not in the graph and the check would refuse a valid tag.
#
# Writes `tier` and `version` to $GITHUB_OUTPUT when set, and always prints them as
# `tier=<t>` / `version=<v>` on stdout so the script is usable outside Actions.
set -euo pipefail

REF=${1:-${GITHUB_REF:-}}
SHA=${2:-${GITHUB_SHA:-}}
REMOTE=${RELEASE_TIER_REMOTE:-origin}

die() {
  # ::error:: is an Actions annotation; harmless everywhere else.
  echo "::error::$*" >&2
  exit 1
}

[ -n "$REF" ] || die "no tag ref given (argument 1, or GITHUB_REF)"
[ -n "$SHA" ] || die "no commit given (argument 2, or GITHUB_SHA)"

case "$REF" in
  refs/tags/*) tag=${REF#refs/tags/} ;;
  refs/heads/*) die "$REF is a branch, not a tag: this workflow releases from tags only" ;;
  *) tag=$REF ;;
esac

# A tag with no `/` has no tier. Say so in those words rather than reporting an unknown tier
# of `v1.2.3`, because a bare semver tag is the OLD convention and this is the message its
# author needs to read.
case "$tag" in
  */*) tier=${tag%%/*}; version=${tag#*/} ;;
  *) die "tag '$tag' carries no environment prefix; expected dev/, test/ or prod/ (a bare vX.Y.Z tag is the retired trunk-based convention)" ;;
esac

case "$tier" in
  dev | test | prod) ;;
  *) die "tag '$tag' names environment '$tier', which is not one of dev, test, prod" ;;
esac

# Refuse a version that is not plain semver. A pre-release or build-metadata suffix would sort
# below the bare version in createCpDeployment's rollback guard, which is the trap the tag
# PREFIX exists to avoid — accepting it in the version would reintroduce it.
case "$version" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) die "tag '$tag' has version '$version'; expected vMAJOR.MINOR.PATCH with no suffix" ;;
esac
[[ $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || die "tag '$tag' has version '$version'; expected vMAJOR.MINOR.PATCH with no suffix"

# Fetch the branch by explicit refspec. `git fetch origin <branch>` alone leaves the answer in
# FETCH_HEAD and does not update refs/remotes, so a stale remote-tracking ref would decide it.
git fetch --no-tags "$REMOTE" "+refs/heads/${tier}:refs/remotes/${REMOTE}/${tier}" >/dev/null 2>&1 \
  || die "cannot fetch branch '${tier}' from '${REMOTE}': the branch this tag names does not exist"

git merge-base --is-ancestor "$SHA" "refs/remotes/${REMOTE}/${tier}" || die \
  "tag '$tag' points at commit ${SHA}, which is NOT contained in ${REMOTE}/${tier}. A tag that names an environment must be reachable from that environment's branch. Merge the commit into '${tier}' first, then re-tag."

echo "tier=$tier"
echo "version=$version"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "tier=$tier"
    echo "version=$version"
  } >>"$GITHUB_OUTPUT"
fi
