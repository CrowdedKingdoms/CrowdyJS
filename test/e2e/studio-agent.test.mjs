/**
 * Studio agent live-policy e2e.
 *
 * A rebuilt CK fleet comes up with the platform row fail-closed
 * (AGENT_OPERATOR_KILLED, empty catalog) and apps at revision 0
 * (AGENT_APP_KILLED). The existing studio-admin and operator suites never
 * read this surface, and they skip when env is missing — a skip would have
 * passed over the v7 outage.
 *
 * When CROWDY_HTTP_URL + CROWDY_OWNER_EMAIL are set, a killed or empty
 * platform is a FAILURE, not a skip. Session create needs an app token with
 * use_studio_agent; that is also a failure if the policy claims to be live
 * and the runtime still refuses.
 *
 * Public API only — no SQL. Auto-skips only when the management e2e env is
 * absent (local `npm test` without a fleet).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { skipReasonFor, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import {
  appId,
  gqlManagement,
  mintAppAccess,
  provisionOperator,
  provisionOwner,
  registerUser,
} from '../provision.mjs';

const skip = skipReasonFor(MANAGEMENT_E2E_ENV);
const rid = () => Math.random().toString(36).slice(2, 10);

async function gqlAt(endpoint, query, variables, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`management GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

test('studio agent: platform catalog is live (ASK+BUILD / gpt-oss-120b)', { skip, timeout: 60_000 }, async () => {
  const op = await provisionOperator();
  const platform = await gqlManagement(
    `query { cpCrowdyStudioAgentPlatformPolicy {
      enabled killSwitch disableReasonCode
      allowedModelIds allowedToolNames allowedModes allowedRiskClasses
      revision
    } }`,
    {},
    op.token,
  );
  const p = platform.cpCrowdyStudioAgentPlatformPolicy;
  assert.equal(p.enabled, true, `platform enabled; got disableReasonCode=${p.disableReasonCode}`);
  assert.equal(p.killSwitch, false, `platform killSwitch must be off; got ${p.disableReasonCode}`);
  assert.ok(
    (p.allowedModelIds ?? []).includes('openai/gpt-oss-120b'),
    `platform models must include openai/gpt-oss-120b, got ${JSON.stringify(p.allowedModelIds)}`,
  );
  assert.ok((p.allowedModes ?? []).includes('ASK'), 'platform modes must include ASK');
  assert.ok((p.allowedModes ?? []).includes('BUILD'), 'platform modes must include BUILD');
  assert.ok((p.allowedToolNames ?? []).length > 0, 'platform tool allowlist must be non-empty');
  assert.ok((p.allowedRiskClasses ?? []).length > 0, 'platform risk allowlist must be non-empty');
});

test('studio agent: effective policy on CROWDY_TEST_APP_ID is not killed', { skip, timeout: 60_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const data = await gqlManagement(
    `query($a: BigInt!){ crowdyStudioAgentEffectivePolicy(appId:$a){
      enabled killSwitch disableReasonCode
      allowedModelIds allowedModes effectiveRevision
    } }`,
    { a: id },
    owner.token,
  );
  const e = data.crowdyStudioAgentEffectivePolicy;
  assert.notEqual(
    e.disableReasonCode,
    'AGENT_OPERATOR_KILLED',
    `app ${id} effective=${e.effectiveRevision} still AGENT_OPERATOR_KILLED — run enable-studio-agent.sh`,
  );
  assert.notEqual(
    e.disableReasonCode,
    'AGENT_APP_KILLED',
    `app ${id} effective=${e.effectiveRevision} still AGENT_APP_KILLED — setCrowdyStudioAgentPolicy was not applied`,
  );
  assert.equal(e.enabled, true, `effective enabled; disableReasonCode=${e.disableReasonCode}`);
  assert.equal(e.killSwitch, false, `effective killSwitch off; disableReasonCode=${e.disableReasonCode}`);
  assert.ok((e.allowedModelIds ?? []).includes('openai/gpt-oss-120b'));
  assert.ok((e.allowedModes ?? []).includes('ASK'));
});

/**
 * EVERY APP MUST HAVE A DEFAULT TIER, and that is all this asserts about its contents.
 *
 * It is deliberately NOT "the default tier grants use_studio_agent". That assertion was
 * written on 2026-08-26 and removed the same hour, because measuring first showed it was
 * a guess dressed as a rule: NO app on dev grants it there, including the flagship
 * blocks-with-friends. `ASK session create succeeds` below finds-or-creates a tier
 * carrying the permission precisely because the default is not expected to have it --
 * the agent entitlement is opt-in per tier by design.
 *
 * What the default tier DOES vary in is worth knowing and is not this suite's to
 * legislate. On dev, blocks-with-friends grants eight runtime permissions including
 * run_server_code and run_client_code; titan-assault grants four and neither. A game
 * whose automations run server code will behave completely differently on those two
 * tiers, and no test here can say which is intended -- that is a product decision about
 * one app, not an invariant of the platform.
 *
 * So this checks the structural thing that IS invariant: a player who has bought nothing
 * lands on the default tier, and an app without one has nowhere to put them.
 */
test('studio agent: the app has a default access tier for ordinary players', { skip, timeout: 60_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const tiers = (await gqlManagement(
    `query($a: BigInt!){ appAccessTiers(appId:$a){ tierId name isDefault status permissionKeys } }`,
    { a: id },
    owner.token,
  )).appAccessTiers ?? [];

  const live = tiers.filter((t) => t.status !== 'archived');
  assert.ok(live.length > 0, `app ${id} has no active access tier at all`);

  const dflt = live.find((t) => t.isDefault);
  assert.ok(
    dflt,
    `app ${id} has ${live.length} active tier(s) and none is the default. ` +
      'A player who has not bought anything lands on the default tier; without one ' +
      'there is nothing for grantAppAccess to put them on.',
  );
  assert.ok(
    (dflt.permissionKeys ?? []).includes('access'),
    `app ${id}'s default tier "${dflt.name}" (${dflt.tierId}) does not grant even ` +
      `'access'. It grants: ${JSON.stringify(dflt.permissionKeys ?? [])}. Nobody ` +
      'arriving on it can connect at all.',
  );
});

/**
 * THE WALLET IS A THIRD GATE, and it fails with its own vocabulary.
 *
 * `enable-studio-agent.sh` checks it and this suite did not: platform policy, app
 * policy and the ORG'S RUNTIME STATUS are three independent reasons the agent stops,
 * and knowing which one is out is most of the diagnosis. A denied wallet does not say
 * AGENT_APP_KILLED -- so with only the policy assertions above, that failure arrives as
 * an unexplained refusal at session create, which is where it is most expensive to read.
 */
test('studio agent: the org\'s runtime wallet is active', { skip, timeout: 60_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const app = (await gqlManagement(
    `query($a: BigInt!){ app(appId:$a){ appId orgId runtimeStatus runtimeDenialReason } }`,
    { a: id },
    owner.token,
  )).app;
  assert.ok(app, `app ${id} did not resolve`);
  assert.equal(
    app.runtimeStatus,
    'active',
    `app ${id} (org ${app.orgId}) has runtimeStatus=${app.runtimeStatus} ` +
      `reason=${app.runtimeDenialReason}. Server code and agent automations are gated ` +
      'on this independently of the agent policies, so the policy tests can be green ' +
      'while nothing runs.',
  );
  assert.equal(app.runtimeDenialReason, null, `runtimeDenialReason=${app.runtimeDenialReason}`);
});

test('studio agent: ASK session create succeeds', { skip, timeout: 120_000 }, async () => {
  const owner = await provisionOwner();
  const id = appId();
  const perms = await gqlManagement(`query { runtimePermissions }`, {}, owner.token);
  const keys = new Set(perms.runtimePermissions ?? []);
  keys.add('access');
  keys.add('use_studio_agent');
  const want = [...keys];

  const tiers = (await gqlManagement(
    `query($a: BigInt!){ appAccessTiers(appId:$a){ tierId status permissionKeys } }`,
    { a: id },
    owner.token,
  )).appAccessTiers ?? [];
  let tierId = tiers.find((t) => t.status !== 'archived' && want.every((k) => (t.permissionKeys ?? []).includes(k)))?.tierId;
  if (!tierId) {
    tierId = (await gqlManagement(
      `mutation($i: CreateAccessTierInput!){ createAccessTier(input:$i){ tierId } }`,
      { i: { appId: id, name: `e2e-agent-${rid()}`, isFree: true, isDefault: false, permissionKeys: want } },
      owner.token,
    )).createAccessTier.tierId;
  }

  const player = await registerUser();
  await gqlManagement(
    `mutation($i: GrantAppAccessInput!){ grantAppAccess(input:$i){ appUserAccessId } }`,
    { i: { appId: id, userId: player.userId, tierId } },
    owner.token,
  );
  const access = await mintAppAccess(id, player.token);
  // createSession is app-resident. The shared entry name may land in the
  // other datacenter and answer WRONG_DATACENTER — the mint already named
  // the app's own origin.
  const gameGraphql = `${String(access.gameApiUrl ?? process.env.CROWDY_HTTP_URL).replace(/\/$/, '')}/graphql`;
  const mutation = `mutation($i: CreateAgentSessionInput!){ crowdyStudioAgentCreateSession(input:$i){
      sessionId status mode
    } }`;
  const vars = {
    i: {
      appId: id,
      mode: 'ASK',
      requestedModel: 'openai/gpt-oss-120b',
      idempotencyKey: `crowdyjs-e2e-agent-${rid()}`,
    },
  };
  // Runtime pulls crowdy.studio-agent-policy/1; a just-unkilled platform
  // reaches an existing replica in about a minute (refreshAfter is 2/3 of 60s).
  const deadline = Date.now() + 90_000;
  let created;
  for (;;) {
    try {
      created = await gqlAt(gameGraphql, mutation, vars, access.token);
      break;
    } catch (err) {
      const msg = String(err?.message ?? err);
      const stale = /AGENT_OPERATOR_KILLED|AGENT_DISABLED|AGENT_APP_KILLED/.test(msg);
      if (!stale || Date.now() >= deadline) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const session = created.crowdyStudioAgentCreateSession;
  assert.ok(session?.sessionId, `createSession returned ${JSON.stringify(created)}`);
  assert.equal(session.mode, 'ASK');
});
