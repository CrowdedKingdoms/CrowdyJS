#!/usr/bin/env node
/**
 * Decide the npm version string and dist-tag for a `<tier>/vX.Y.Z` release tag.
 *
 * WHY THIS EXISTS. The three-branch model releases the SAME version to each tier in
 * turn — `dev/v14.2.0`, then `test/v14.2.0`, then `prod/v14.2.0` — but npm accepts a
 * given version string exactly ONCE, forever, so "one build per tier" cannot mean
 * three publishes of `14.2.0`. The tiers are separated in the version and in the
 * dist-tag instead:
 *
 *   dev/v14.2.0  -> 14.2.0-dev.N   @dev
 *   test/v14.2.0 -> 14.2.0-test.N  @test
 *   prod/v14.2.0 -> 14.2.0         @latest
 *
 * `14.2.0-dev.N` is a semver PRE-release, so it sorts BELOW `14.2.0` and a consumer
 * on `^14.1.0` will never resolve to one by accident — you opt in with the dist-tag
 * (`npm i @crowdedkingdoms/crowdyjs@dev`) or by pinning the exact string.
 *
 * WHY N COMES FROM THE REGISTRY AND NOT FROM `github.run_number`. The run number is
 * monotonic per WORKFLOW, not per version, so the first dev build of 14.2.0 might be
 * `-dev.412` and the second `-dev.419`; the gaps invite the reader to conclude that
 * seven builds went missing. Asking the registry for the highest ordinal already
 * published against this exact base version gives 1, 2, 3 — and it is also the only
 * source that cannot collide, since it is the same list npm will validate against.
 *
 * Usage:  node scripts/ci/resolve-npm-publish-version.mjs <tier> <version> < versions.json
 *
 * <version> may be given as `v14.2.0` or `14.2.0`. Registry input is whatever
 * `npm view <name> versions --json` prints: a JSON array, a bare JSON string when the
 * package has exactly one version, or `[]` when the package does not exist yet.
 * Prints `publish_version=` and `dist_tag=` on stdout, and appends both to
 * $GITHUB_OUTPUT when it is set.
 */

const TIERS = new Set(['dev', 'test', 'prod']);

/** Normalise whatever `npm view … versions --json` produced into an array of strings. */
export function normalizeRegistryVersions(raw) {
  if (raw === null || raw === undefined || raw === '') return [];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed === null || parsed === undefined) return [];
  if (typeof parsed === 'string') return [parsed];
  if (!Array.isArray(parsed)) {
    throw new Error(`unexpected registry version list: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

export function resolvePublishVersion({ tier, version, registryVersions }) {
  if (!TIERS.has(tier)) {
    throw new Error(`tier '${tier}' is not one of dev, test, prod`);
  }
  const base = String(version).replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(base)) {
    throw new Error(`version '${version}' is not a bare MAJOR.MINOR.PATCH`);
  }
  if (tier === 'prod') {
    return { publishVersion: base, distTag: 'latest' };
  }
  const existing = normalizeRegistryVersions(registryVersions);
  const pattern = new RegExp(
    `^${base.replace(/\./g, '\\.')}-${tier}\\.(\\d+)$`,
  );
  let highest = 0;
  for (const candidate of existing) {
    const match = pattern.exec(String(candidate));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return { publishVersion: `${base}-${tier}.${highest + 1}`, distTag: tier };
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [tier, version] = process.argv.slice(2);
  if (!tier || !version) {
    console.error(
      'usage: resolve-npm-publish-version.mjs <tier> <version> < registry-versions.json',
    );
    process.exit(2);
  }
  const raw = await readStdin();
  let resolved;
  try {
    resolved = resolvePublishVersion({ tier, version, registryVersions: raw || '[]' });
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
  const lines = [
    `publish_version=${resolved.publishVersion}`,
    `dist_tag=${resolved.distTag}`,
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
}
