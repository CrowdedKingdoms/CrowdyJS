/**
 * Game Model integrity e2e.
 *
 * WHAT PRODUCED THIS FILE. `titan-assault` was recreated in a different org on
 * 2026-08-26 and came up with 0 container types, 0 property definitions, 0 function
 * definitions and 0 automations, while its client went on making containers that
 * referenced all of them. `gameModelEnsureContainer` accepted every one — measured
 * with a deliberately bogus `ZZ_NoSuchType_Probe`, which came back `created: true`.
 * Nothing objected, no test failed, and the rest of the app looked healthy: access
 * tiers, grid permissions, token minting and the full realtime path all worked,
 * which is exactly why it was misdiagnosed as a permissions problem for most of a
 * day. The only evidence anywhere was a line in the game's own console:
 *
 *     LogCrowdyGameModel: Warning: [GameModel] InvokeAndApply:
 *                         no container bound for entity F3B8B18E…C602CA47
 *
 * Containers survive an app move because the client makes them on demand. Types,
 * functions and automations do not travel with them.
 *
 * THE SERVER ANSWERS THIS DIRECTLY NOW, so these assertions go through
 * `gameModelLint` rather than the hand-rolled container/type comparison they started
 * as. That is worth more than tidiness: the query recomputes the same checks the
 * platform enforces, so this suite and the platform cannot drift into disagreeing
 * about what "coherent" means — and it covers the function, timer and automation
 * checks too, which the hand-rolled version could not see.
 *
 * STILL THE APP UNDER TEST ONLY. A broken app elsewhere on the tier is invisible
 * here. The fleet-wide sweep is `scripts/ops/lint-sweep.mjs` in the game-api repo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { skipReasonFor, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import { appId, gqlManagement, mintAppAccess, provisionOwner } from '../provision.mjs';

const skip = skipReasonFor(MANAGEMENT_E2E_ENV);

/** The app's own endpoint. Game Model reads are app-resident; the shared entry
 *  name answers from whichever datacenter DNS picked and refuses with
 *  WRONG_DATACENTER when that is not the one holding the app. */
async function appGraphql(id, ownerToken) {
  const access = await mintAppAccess(id, ownerToken);
  const base = String(access.gameApiUrl ?? process.env.CROWDY_HTTP_URL).replace(/\/$/, '');
  return { url: `${base}/graphql`, token: access.token };
}

async function gqlAt(url, query, variables, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors[0]));
  return body.data;
}

const LINT_QUERY = `
  query($a: BigInt!) {
    gameModelLint(appId: $a) {
      clean
      errorCount
      warningCount
      findings { code severity subjectKind subject message remedy count }
    }
  }
`;

/** Findings rendered the way a developer would want to read them in a failure. */
function report(findings) {
  return findings
    .map(
      (f) =>
        `    [${f.severity}] ${f.code} on ${f.subjectKind} '${f.subject}'` +
        `${f.count ? ` (${f.count})` : ''}\n` +
        `      ${f.message}${f.remedy ? `\n      ${f.remedy}` : ''}`,
    )
    .join('\n');
}

test("game model: the app under test has no ERROR findings", { skip, timeout: 90_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const { url, token } = await appGraphql(id, owner.token);

  const { gameModelLint: lint } = await gqlAt(url, LINT_QUERY, { a: id }, token);

  const errors = lint.findings.filter((f) => f.severity === 'error');
  assert.equal(
    errors.length,
    0,
    `app ${id} has ${errors.length} ERROR finding(s):\n${report(errors)}\n` +
      '  An ERROR is provably broken — there is no reading of the app in which it\n' +
      '  is fine. WARNING findings are not asserted here because most of them are a\n' +
      '  normal mid-edit state.',
  );
  assert.equal(lint.clean, true);
});

test('game model: warnings are reported, not asserted', { skip, timeout: 90_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const { url, token } = await appGraphql(id, owner.token);

  const { gameModelLint: lint } = await gqlAt(url, LINT_QUERY, { a: id }, token);
  const warnings = lint.findings.filter((f) => f.severity === 'warning');

  // Deliberately not an assertion. A warning is frequently correct anyway —
  // seeding a function that calls one written later in the same batch produces
  // one — so failing on them would make the suite red for normal authoring and
  // teach everyone to ignore it, which is the exact failure this feature exists
  // to correct. Printed so a reader can see them without the gate depending on them.
  if (warnings.length) {
    console.log(`app ${id} lint warnings (not a failure):\n${report(warnings)}`);
  }
  assert.equal(lint.warningCount, warnings.length);
});

test('game model: binding a container to an undefined type is refused', { skip, timeout: 90_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const { url, token } = await appGraphql(id, owner.token);

  // The regression this whole file exists for. Before the fix this call returned
  // `created: true` and wrote a container nothing could ever bind.
  await assert.rejects(
    () =>
      gqlAt(
        url,
        `mutation($i: EnsureContainerInput!) {
           gameModelEnsureContainer(input: $i) { created container { containerId } }
         }`,
        {
          i: {
            appId: String(id),
            typeName: 'ZZ_NoSuchType_Probe',
            bindingKey: 'e2e-integrity-probe-0000000000001',
            displayName: 'probe',
          },
        },
        token,
      ),
    (err) => {
      const body = JSON.parse(err.message);
      assert.equal(body.extensions?.code, 'CONTAINER_TYPE_UNDEFINED');
      // The error names what the app does define, so a typo is answerable from
      // the failure itself rather than a second round trip.
      assert.ok(Array.isArray(body.extensions?.definedTypes));
      return true;
    },
  );
});
