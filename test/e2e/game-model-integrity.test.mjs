/**
 * Game Model integrity e2e.
 *
 * A container names its type by STRING, and nothing enforces that the string
 * resolves. `gameModelEnsureContainer` will create a container against a type that
 * does not exist and report success — observed against dev on 2026-08-26 with a
 * deliberately bogus `ZZ_NoSuchType_Probe`, which was created without complaint.
 *
 * So an app can hold containers whose types are absent, and the only place that
 * shows up is a client that cannot bind them:
 *
 *     LogCrowdyGameModel: Warning: [GameModel] InvokeAndApply:
 *                         no container bound for entity F3B8B18E…C602CA47
 *
 * WHAT PRODUCED IT. `titan-assault` was recreated in a different org on 2026-08-26
 * and came up with 0 container types, 0 property definitions, 0 function definitions
 * and 0 automations, while its client went on making containers that referenced all
 * of them. Nothing in the platform objected, no test failed, and the whole of the
 * rest of the app looked healthy — access tiers, grid permissions, token minting and
 * the full realtime path all worked, which is exactly why it was misdiagnosed as a
 * permissions problem first.
 *
 * Containers survive an app move because the client makes them on demand. Types,
 * functions and automations do not travel with them.
 *
 * THIS FILE CHECKS THE APP UNDER TEST ONLY, which is its limit: a dangling type on
 * some other app is invisible here. The fleet-wide equivalent is
 * `scripts/ops/check-game-model-integrity.mjs` in the control-plane repo, which
 * scans every app.
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

test('game model: every container resolves to a type that exists', { skip, timeout: 90_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const { url, token } = await appGraphql(id, owner.token);

  const [{ gameModelContainerTypes: types }, { gameModelContainers: containers }] = await Promise.all([
    gqlAt(url, `query($a: BigInt!){ gameModelContainerTypes(appId:$a){ typeName } }`, { a: id }, token),
    gqlAt(
      url,
      `query($a: BigInt!){ gameModelContainers(appId:$a, limit: 500){ containerId typeName bindingKey } }`,
      { a: id },
      token,
    ),
  ]);

  const known = new Set((types ?? []).map((t) => t.typeName));
  const dangling = (containers ?? []).filter((c) => !known.has(c.typeName));

  // Grouped by type, because one missing type is usually many containers and the
  // count is the useful number — it is how many entities a client cannot bind.
  const byType = new Map();
  for (const c of dangling) {
    const seen = byType.get(c.typeName) ?? [];
    seen.push(c.bindingKey ?? c.containerId);
    byType.set(c.typeName, seen);
  }

  assert.equal(
    dangling.length,
    0,
    `app ${id} has ${dangling.length} container(s) whose type does not exist:\n` +
      [...byType.entries()]
        .map(([t, keys]) => `    ${t} — ${keys.length} container(s), e.g. ${keys.slice(0, 3).join(', ')}`)
        .join('\n') +
      `\n  The app declares ${known.size} type(s): ${[...known].sort().join(', ') || '(none)'}.\n` +
      '  A client cannot bind these entities, and the only symptom is "no container\n' +
      '  bound for entity" in its log. Define the missing type(s), or copy the Game\n' +
      '  Model schema from wherever this app was moved from.',
  );
});

test('game model: an app with containers also has a schema', { skip, timeout: 90_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const { url, token } = await appGraphql(id, owner.token);

  const { gameModelContainers: containers } = await gqlAt(
    url,
    `query($a: BigInt!){ gameModelContainers(appId:$a, limit: 1){ containerId } }`,
    { a: id },
    token,
  );
  if (!(containers ?? []).length) return; // an app using no Game Model is not a fault

  const { gameModelContainerTypes: types } = await gqlAt(
    url,
    `query($a: BigInt!){ gameModelContainerTypes(appId:$a){ typeName } }`,
    { a: id },
    token,
  );

  // Stated separately from the per-container check above because the causes differ.
  // Dangling types are usually a client that has moved ahead of the schema; ZERO
  // types under a populated app is the app having been recreated without one, which
  // is a different conversation and a different fix.
  assert.ok(
    (types ?? []).length > 0,
    `app ${id} holds containers but declares NO container types at all. That is the ` +
      'shape an app takes when it is recreated or moved between orgs: the client ' +
      'goes on making containers, and the types, function definitions and ' +
      'automations do not come with them. Nothing else about the app looks wrong.',
  );
});
