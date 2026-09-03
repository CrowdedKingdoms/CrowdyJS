// The generated default origin must name the tier this ref publishes for.
//
// `src/default-origin.ts` is generated per tier: `dev` declares dev, `test` test, `prod`
// prod. A branch publishes exactly one tier's artifact, so a file naming a different tier
// than its branch is a build that dials the wrong environment while every other check
// passes.
//
// WHY THIS LIVES HERE AND NOT ONLY IN THE OPERATOR WRAPPER. The cross-repo gate,
// `check-sdk-default-origin.mjs`, already judges all three branches of both SDKs -- but it
// needs the operator's tier table and both SDK checkouts, so it runs from `preflight-all.sh`
// and NOT in this repo's CI or its publish workflow. That left a window between a promotion
// merge and the next preflight in which a tag could be cut, and on 2026-09-02 a tag was:
// 15.4.0 published `15.4.0-dev.1` and `15.4.0-test.1` whose bundled default declared
// `tier = 'prod'` and `ck.prod.crowdedkingdoms.com`. Consumers of @dev and @test dialled
// PRODUCTION out of a dev or test build, and only 15.4.1 fixed it, because a published
// artifact is immutable.
//
// The assertions split cleanly, which is what makes an in-repo copy possible at all:
//   - which TIER the file names, versus the ref  -- hermetic, no table, no network. Here.
//   - which HOST that tier should carry          -- needs the operator's table. Stays there.
//
// HOW THE SILENT CARRY ACTUALLY WORKS, measured rather than reasoned about. A promotion
// rewrites this file with no conflict whenever the merge base already holds the
// DESTINATION's value and the destination has not re-committed the file since, while the
// source has. Only one side changed, so git resolves it trivially, takes the source's
// version, and reports success. Verified in a scratch repository on 2026-09-02: promoting a
// branch declaring `test` onto one declaring `prod` left `prod` declaring `test`, with no
// conflict.
//
// That measurement also killed the tidier-looking fix. A `.gitattributes` merge driver
// cannot help, for two independent reasons, both observed:
//   1. git never consults a merge driver for a one-sided change -- and one-sided IS the
//      dangerous case. The driver logged zero invocations while the carry happened.
//   2. `.gitattributes` can NAME a driver but cannot ship it. `merge.<name>.driver` is local
//      config, so in a fresh clone it reads as unset and git silently falls back to its
//      default merge. A CI runner has no driver at all.
// So the answer has to be an assertion. This is it.
//
// A FEATURE BRANCH IS SKIPPED, NOT PASSED, and the difference is printed. Only dev/test/prod
// carry a tier rule. Coverage still holds for anything heading to a tier branch, because on a
// pull request this reads GITHUB_BASE_REF -- the DESTINATION -- so a dev -> test promotion is
// judged by test's rule before the merge rather than after it. What would be a quiet no-op is
// CI resolving no ref at all; that is a misconfiguration and refuses.
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const REL = 'src/default-origin.ts';
const TIERS = ['dev', 'test', 'prod'];

/**
 * The four constants this file exists to declare. Parsed by name rather than by position so
 * a reordering of the generated output is not a failure.
 */
export function parseDefaults(text) {
  const one = (name) => {
    const m = text.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'u'));
    return m ? m[1] : null;
  };
  return {
    tier: one('CROWDY_DEFAULT_TIER'),
    host: one('CROWDY_DEFAULT_HOST'),
    http: one('CROWDY_DEFAULT_HTTP_ORIGIN'),
    ws: one('CROWDY_DEFAULT_WS_ORIGIN'),
  };
}

/**
 * The tier a ref publishes for, or null when the ref carries no tier rule.
 *
 * A tag is `dev/v1.2.3`, so the tier is the segment before the slash; a branch is the whole
 * name. `refs/heads/` and `refs/tags/` prefixes are tolerated so this accepts a raw
 * GITHUB_REF as readily as a GITHUB_REF_NAME.
 */
export function tierOfRef(ref) {
  if (!ref) return null;
  const bare = String(ref)
    .replace(/^refs\/heads\//u, '')
    .replace(/^refs\/tags\//u, '');
  const head = bare.includes('/') ? bare.slice(0, bare.indexOf('/')) : bare;
  return TIERS.includes(head) ? head : null;
}

/**
 * Which ref decides, and why that one. GITHUB_BASE_REF is preferred deliberately: on a
 * promotion pull request it names the DESTINATION, which is the branch whose rule the merged
 * result must satisfy. Judging the source instead is how a promotion passes CI and then
 * lands wrong.
 */
export function chooseRef(env, gitBranch) {
  if (env.CROWDY_ORIGIN_TIER) return { ref: env.CROWDY_ORIGIN_TIER, from: 'CROWDY_ORIGIN_TIER' };
  if (env.GITHUB_BASE_REF) return { ref: env.GITHUB_BASE_REF, from: 'GITHUB_BASE_REF (the pull request base)' };
  if (env.GITHUB_REF_NAME) return { ref: env.GITHUB_REF_NAME, from: 'GITHUB_REF_NAME' };
  if (env.GITHUB_REF) return { ref: env.GITHUB_REF, from: 'GITHUB_REF' };
  if (gitBranch) return { ref: gitBranch, from: 'the checked-out branch' };
  return { ref: null, from: null };
}

function currentBranch(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out && out !== 'HEAD' ? out : null;
  } catch {
    return null;
  }
}

/**
 * Judge a parsed file against an expected tier. Pure, so the self-test can drive it.
 *
 * `expected === null` means the ref carries no tier rule; the internal-agreement assertions
 * still run, because a file that contradicts itself is broken on any branch.
 */
export function judge(defaults, expected) {
  const problems = [];
  const { tier, host, http, ws } = defaults;

  if (!tier) problems.push(`${REL} does not declare CROWDY_DEFAULT_TIER; it is generated, so regenerate it rather than editing it`);
  if (!host) problems.push(`${REL} does not declare CROWDY_DEFAULT_HOST`);

  if (tier && !TIERS.includes(tier))
    problems.push(`${REL} declares tier '${tier}', which is not one of ${TIERS.join(', ')}`);

  // Internal agreement, which needs no tier table and catches a hand-edit that moves the
  // tier and leaves the host behind -- the exact half-edit a generated file invites.
  if (host && http && http !== `https://${host}`)
    problems.push(`CROWDY_DEFAULT_HTTP_ORIGIN is '${http}' but the host is '${host}': a scheme is composed, so it must be https://<host>`);
  if (host && ws && ws !== `wss://${host}`)
    problems.push(`CROWDY_DEFAULT_WS_ORIGIN is '${ws}' but the host is '${host}': it must be wss://<host>`);

  // The tier must appear as a label in the host. Asserted structurally rather than against a
  // hardcoded domain, so this file carries no hostname literal of its own.
  if (tier && host && TIERS.includes(tier) && !host.split('.').includes(tier))
    problems.push(
      `${REL} declares tier '${tier}' and host '${host}', and that host carries no '${tier}' label. ` +
        `One of the two was edited without the other; regenerate the file.`,
    );

  if (expected && tier && tier !== expected)
    problems.push(
      `${REL} declares tier '${tier}' and this ref publishes '${expected}'. A branch publishes one ` +
        `tier's artifact. Regenerate for the destination tier -- ` +
        `sync-client-origins.mjs --write --tier ${expected} in the operator wrapper -- rather than ` +
        `hand-editing. If a promotion merge produced this, note that it can rewrite the file with no ` +
        `conflict at all, so a clean merge here deserves more suspicion than a conflicting one.`,
    );

  return problems;
}

export function report(root, env) {
  let text;
  try {
    text = readFileSync(join(root, REL), 'utf8');
  } catch (err) {
    console.error(`[default-origin] FAILED: cannot read ${REL} (${err.message}). It is generated and load-bearing; a missing file is not an empty one.`);
    return 1;
  }

  const defaults = parseDefaults(text);
  const { ref, from } = chooseRef(env, currentBranch(root));
  const expected = tierOfRef(ref);

  if (!ref) {
    // Distinguished from a feature branch on purpose. In CI, resolving no ref at all means
    // the workflow did not give this gate what it needs, and a gate that cannot see its
    // input must not report success.
    if (env.GITHUB_ACTIONS) {
      console.error('[default-origin] FAILED: no ref to judge against (GITHUB_BASE_REF, GITHUB_REF_NAME and GITHUB_REF are all unset, and there is no checked-out branch). In CI that is a misconfiguration, not a branch without a tier.');
      return 1;
    }
    console.log('[default-origin] no ref and no branch: nothing to compare. Pass --tier or set CROWDY_ORIGIN_TIER.');
  }

  const problems = judge(defaults, expected);
  for (const p of problems) console.error(`  ${p}`);

  if (problems.length) {
    console.error(`[default-origin] FAILED: ${problems.length} problem(s).`);
    return 1;
  }

  if (!expected) {
    console.log(
      `[default-origin] ref '${ref}' (${from}) carries no tier, so the tier comparison was SKIPPED -- ` +
        `${REL} declares '${defaults.tier}' and agrees with itself. A pull request into dev, test or ` +
        `prod is judged by that base.`,
    );
    return 0;
  }

  console.log(`[default-origin] passed: ${REL} declares '${defaults.tier}' (host ${defaults.host}), which is what '${ref}' (${from}) publishes.`);
  return 0;
}

// A gate never observed refusing is unproven, so this plants each failure it claims to catch
// and asserts refusal -- including the promotion carry, reproduced as the merge actually
// produces it.
function selfTest() {
  let failures = 0;
  const check = (name, got, want) => {
    const ok = got === want;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} (exit ${got}, wanted ${want})`);
    if (!ok) failures += 1;
  };

  const file = (tier, host) =>
    `export const CROWDY_DEFAULT_TIER = '${tier}';\n` +
    `export const CROWDY_DEFAULT_HTTP_ORIGIN = 'https://${host}';\n` +
    `export const CROWDY_DEFAULT_WS_ORIGIN = 'wss://${host}';\n` +
    `export const CROWDY_DEFAULT_HOST = '${host}';\n`;

  const fixture = mkdtempSync(join(tmpdir(), 'origin-selftest-'));
  mkdirSync(join(fixture, 'src'), { recursive: true });
  const plant = (body) => writeFileSync(join(fixture, REL), body);
  const run = (env) => report(fixture, env);

  // Accepts the correct case on every tier, so refusal cannot be coming from always failing.
  for (const t of TIERS) {
    plant(file(t, `api.${t}.example.com`));
    check(`${t} branch with a ${t} default passes`, run({ GITHUB_REF_NAME: t }), 0);
  }

  // The promotion carry: the file says test, the ref publishes prod.
  plant(file('test', 'api.test.example.com'));
  check('a test default on a prod ref is refused', run({ GITHUB_REF_NAME: 'prod' }), 1);

  // The published incident: the file says prod, the ref publishes dev.
  plant(file('prod', 'api.prod.example.com'));
  check('a prod default on a dev ref is refused (this is 15.4.0)', run({ GITHUB_REF_NAME: 'dev' }), 1);

  // A tier tag, which is what the publish guard passes in.
  check('a tier tag ref is understood', run({ GITHUB_REF_NAME: 'prod/v1.2.3' }), 0);
  plant(file('test', 'api.test.example.com'));
  check('a test default under a prod/vX tag is refused', run({ GITHUB_REF_NAME: 'prod/v1.2.3' }), 1);

  // The destination decides on a pull request, not the source.
  plant(file('dev', 'api.dev.example.com'));
  check('a dev default in a PR based on test is refused', run({ GITHUB_BASE_REF: 'test', GITHUB_REF_NAME: 'dev' }), 1);
  plant(file('test', 'api.test.example.com'));
  check('a test default in a PR based on test passes', run({ GITHUB_BASE_REF: 'test', GITHUB_REF_NAME: 'dev' }), 0);

  // Half-edits: the tier moved and the host did not, or a scheme was composed by hand.
  plant(file('prod', 'api.test.example.com'));
  check('a tier and host that disagree are refused', run({ GITHUB_REF_NAME: 'prod' }), 1);
  plant(
    `export const CROWDY_DEFAULT_TIER = 'dev';\n` +
      `export const CROWDY_DEFAULT_HTTP_ORIGIN = 'https://api.prod.example.com';\n` +
      `export const CROWDY_DEFAULT_WS_ORIGIN = 'wss://api.dev.example.com';\n` +
      `export const CROWDY_DEFAULT_HOST = 'api.dev.example.com';\n`,
  );
  check('an http origin that is not the host is refused', run({ GITHUB_REF_NAME: 'dev' }), 1);

  // A feature branch has no tier rule: skipped, and reported as skipped.
  plant(file('dev', 'api.dev.example.com'));
  check('a feature branch is skipped rather than failed', run({ GITHUB_REF_NAME: 'michael/some-work' }), 0);

  // But a self-contradiction is still refused on a branch with no tier.
  plant(file('dev', 'api.prod.example.com'));
  check('a feature branch still refuses a self-contradicting file', run({ GITHUB_REF_NAME: 'michael/some-work' }), 1);

  // In CI, seeing no ref at all is a misconfiguration rather than a pass.
  plant(file('dev', 'api.dev.example.com'));
  check('CI with no resolvable ref refuses', run({ GITHUB_ACTIONS: 'true' }), 1);

  // An unparseable or absent file must not read as clean.
  plant('export const SOMETHING_ELSE = 1;\n');
  check('a file declaring no tier is refused', run({ GITHUB_REF_NAME: 'dev' }), 1);
  rmSync(join(fixture, REL));
  check('a missing file is refused', run({ GITHUB_REF_NAME: 'dev' }), 1);

  rmSync(fixture, { recursive: true, force: true });
  console.log(failures ? `[default-origin] SELF-TEST FAILED (${failures})` : '[default-origin] self-test passed (16 cases)');
  return failures ? 1 : 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--self-test') process.exit(selfTest());
  const i = args.indexOf('--tier');
  const env = { ...process.env };
  if (i !== -1 && args[i + 1]) env.CROWDY_ORIGIN_TIER = args[i + 1];
  process.exit(report(ROOT, env));
}
