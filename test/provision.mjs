/**
 * Black-box e2e provisioning via the PUBLIC API — no database access.
 *
 * CrowdyJS is a public client SDK, so its tests must set themselves up the way a
 * real integrator would: through the API, never the database.
 *
 * An app **owner** (an org admin who owns the target app) signs in with email +
 * password, ensures the app has an access tier holding every runtime permission,
 * then registers players and grants each one access to the app. Granting access also auto-grants the user full grid
 * permissions on the app's open-by-default world grid, so after a grant the
 * player's spatial traffic is authorized end to end with zero direct DB writes.
 * (This used to cross a management -> game-api replica-sync; since the two became
 * one service it is a single in-process write.)
 *
 * This matches production: an integrator (studio) owns its app and entitles its
 * own users. The test targets the app the game-api is serving:
 *
 *   CROWDY_HTTP_URL         ENTRY origin — the shared multivalue name. The SDK
 *                           appends /graphql. Provisioning and token minting go
 *                           here; GAMEPLAY does not (see below).
 *   CROWDY_OWNER_EMAIL      owner sign-in (owns CROWDY_TEST_APP_ID)
 *   CROWDY_OWNER_PASSWORD   the owner's password; required since the dev bypass
 *                           was removed
 *   CROWDY_TEST_APP_ID      app to test against (default '1')
 *   CROWDY_OPERATOR_EMAIL   operator/super-admin persona; falls back to the owner
 *   CROWDY_OPERATOR_PASSWORD  when unset -- see provisionOperator below
 *
 * THE DEFAULT APP ID IS A LOCAL-STACK DEFAULT AND IT IS A TRAP AGAINST A TIER.
 * No deployed tier has an app numbered 1 -- ids are Snowflake53, so they are
 * sixteen digits. Leaving CROWDY_TEST_APP_ID unset therefore points the whole
 * suite at an app that does not exist, and the failure does not say so: the
 * permission check on a nonexistent app answers `Missing app permission
 * 'manage_access_tiers'`, which reads as "the owner's roles are wrong". On
 * 2026-08-26 that cost an afternoon across two tiers -- 16 of 34 tests failing,
 * on a gate that was otherwise sound -- and was diagnosed only by asking the
 * database who owned app 1 and being told nobody.
 *
 * So against a tier, set all three of APP_ID, OPERATOR_EMAIL and
 * OPERATOR_PASSWORD. The operator pair is not optional either: the fallback to
 * the owner exists for the local smoke stack, where the seeded owner is also a
 * super-admin. On a tier the two personas are different accounts, and the two
 * operator-persona tests fail `Invalid credentials` without it.
 *
 * The tier's values live in Secrets Manager:
 *   owner     infra-cp/<tier>/org-admin/crowdedkingdomstudios
 *   operator  infra-cp/<tier>/admin/ck-operator
 *   app id    appBySlug(orgSlug:"crowdedkingdomstudios", appSlug:"blocks-with-friends")
 *
 * ONE MORE THING THE SUITE CANNOT DO FOR ITSELF: the app's Studio-agent policy.
 * A rebuilt tier leaves it fail-closed, and two tests assert it is not
 * AGENT_APP_KILLED. The door is the control plane's
 * `scripts/ops/enable-studio-agent.sh --tier <tier> --app-id <id>`.
 *
 * PROVISIONING STAYS ON THE ENTRY ORIGIN; GAMEPLAY DOES NOT. Sign-in, grants and
 * `mintAppToken` all read and write reference tables that every datacenter
 * holds, so the shared origin is the right place for them — and it is where a
 * real client is too, before it knows where the app lives. The mint is what
 * tells it: the response names the app's own datacenter, and every gameplay
 * client below is built against THAT, never against `CROWDY_HTTP_URL`.
 *
 * No MGMT_DB_* / DB_WRITER_* credentials.
 */
import { randomBytes } from 'node:crypto';
import { gameClientConfig } from './helpers.mjs';

const DEFAULT_PERMISSION_KEYS = ['access', 'teleport', 'update_voxel_data', 'use_voice_chat'];

export const OWNER_ENV = ['CROWDY_HTTP_URL', 'CROWDY_OWNER_EMAIL', 'CROWDY_OWNER_PASSWORD'];

export function ownerEnvReady() {
  return OWNER_ENV.every((k) => !!process.env[k]);
}

export function appId() {
  return process.env.CROWDY_TEST_APP_ID ?? '1';
}

function managementEndpoint() {
  const base = process.env.CROWDY_HTTP_URL;
  if (!base) throw new Error('CROWDY_HTTP_URL is not set');
  return `${base.replace(/\/$/, '')}/graphql`;
}

const rid = () => randomBytes(5).toString('hex');

async function gql(query, variables, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(managementEndpoint(), {
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

/**
 * Raw management GraphQL helper exposed for suites that need to drive arbitrary
 * operations (e.g. permission/validation/malicious-input negative tests).
 * Throws on `errors`; use {@link gqlManagementRaw} when you want to assert on the
 * error envelope instead.
 */
export async function gqlManagement(query, variables, token) {
  return gql(query, variables, token);
}

/**
 * Like {@link gqlManagement} but returns the full `{ data, errors }` envelope
 * WITHOUT throwing — for negative tests that assert on `errors[].extensions.code`.
 */
export async function gqlManagementRaw(query, variables, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(managementEndpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return { status: res.status, body: await res.json() };
}

/**
 * Passwords for e2e accounts.
 *
 * These used to be `devLogin`, which needed no credential at all. With the
 * bypass gone every account needs one, and the two kinds of account here need
 * it for opposite reasons:
 *
 *   a FRESH player  is created by this file, so it invents the password and
 *                   keeps it in memory for the length of the run
 *   the OWNER       already exists and is not ours to create, so its password
 *                   has to be supplied
 *
 * `Aa1!` prefix: the server enforces only a minimum length today, and a
 * generated password that would also satisfy a future complexity rule costs
 * nothing now.
 */
function generatePassword() {
  return `Aa1!e2e-${rid()}${rid()}`;
}

function requiredPassword(varName) {
  const v = process.env[varName]?.trim();
  if (!v) {
    throw new Error(
      `${varName} is not set. The dev-login bypass these tests used to sign in ` +
        `with has been removed from every tier, so an existing account now needs ` +
        `its password. Export it; do not pass it as an argument.`,
    );
  }
  return v;
}

/** Create a brand-new account and return its session. */
async function registerAccount(email, password) {
  const data = await gql(
    `mutation Register($i: RegisterUserInput!) {
       register(registerUserInput: $i) { token gameTokenId user { userId email } }
     }`,
    { i: { email, password } },
  );
  const r = data.register;
  return {
    email: r.user.email ?? email,
    password,
    token: r.token,
    gameTokenId: r.gameTokenId,
    userId: r.user.userId,
  };
}

/** Sign an existing account in. */
async function passwordLogin(email, password) {
  const data = await gql(
    `mutation Login($i: LoginUserInput!) {
       login(loginUserInput: $i) { token gameTokenId user { userId email } }
     }`,
    { i: { email, password } },
  );
  const r = data.login;
  return {
    email: r.user.email ?? email,
    password,
    token: r.token,
    gameTokenId: r.gameTokenId,
    userId: r.user.userId,
  };
}

/**
 * A fresh player through the public API. The address has never been seen, so
 * `register` returns a session immediately — an address that already exists
 * would NOT, which is why these are always newly generated.
 */
export async function registerUser(overrides = {}) {
  const email = overrides.email ?? `crowdy-e2e-${rid()}@test.invalid`;
  return registerAccount(email, overrides.password ?? generatePassword());
}

/** Sign in as `email` with a supplied password; returns `{ token, userId }`. */
export async function loginAs(email, password) {
  const { token, userId } = await passwordLogin(email, password);
  return { token, userId };
}

async function loginOwner() {
  return loginAs(
    process.env.CROWDY_OWNER_EMAIL,
    requiredPassword('CROWDY_OWNER_PASSWORD'),
  );
}

/** Log in as the configured app owner; returns `{ token, userId }`. */
export async function provisionOwner() {
  if (!ownerEnvReady()) {
    throw new Error(`owner env not configured (need ${OWNER_ENV.join(', ')})`);
  }
  return loginOwner();
}

/**
 * Env for the operator/super-admin persona used by control-plane e2e.
 *
 * The password joins the email as a REQUIRED pair rather than an optional
 * extra: with an email and no password the suite would silently fall through to
 * the owner and test a weaker persona than it names.
 */
export const OPERATOR_ENV = ['CROWDY_OPERATOR_EMAIL', 'CROWDY_OPERATOR_PASSWORD'];

export function operatorEnvReady() {
  return OPERATOR_ENV.every((k) => !!process.env[k]);
}

/**
 * Sign in as the operator/super-admin persona. Uses CROWDY_OPERATOR_EMAIL and
 * CROWDY_OPERATOR_PASSWORD when both are set; otherwise falls back to the owner
 * (in the local smoke stack the seeded owner is also a super-admin/operator).
 */
export async function provisionOperator() {
  if (operatorEnvReady()) {
    return loginAs(
      process.env.CROWDY_OPERATOR_EMAIL,
      process.env.CROWDY_OPERATOR_PASSWORD,
    );
  }
  return provisionOwner();
}

/**
 * Register a fresh "outsider" player: a real account that is NOT a member of the
 * owner's org and has NOT been granted access to the test app. Used by
 * permission-denial / cross-tenant negative tests.
 */
export async function provisionOutsider() {
  return registerUser();
}

async function listRuntimePermissions(token) {
  try {
    const data = await gql(`query { runtimePermissions }`, {}, token);
    if (Array.isArray(data.runtimePermissions) && data.runtimePermissions.length) {
      return data.runtimePermissions;
    }
  } catch {
    /* fall back to the well-known set */
  }
  return DEFAULT_PERMISSION_KEYS;
}

/**
 * Find or create an access tier on `id` that holds every runtime permission.
 * Reuses an existing fully-permissioned tier (e.g. the app's seeded default) so
 * repeated runs don't pile up tiers.
 */
async function ensureAllAccessTier(id, ownerToken) {
  const want = await listRuntimePermissions(ownerToken);
  const wantAll = (keys) => want.every((k) => (keys ?? []).includes(k));

  const existing = (
    await gql(
      `query($a: BigInt!){ appAccessTiers(appId:$a){ tierId status permissionKeys } }`,
      { a: id },
      ownerToken,
    )
  ).appAccessTiers ?? [];
  const reusable = existing.find((t) => t.status !== 'archived' && wantAll(t.permissionKeys));
  if (reusable) return reusable.tierId;

  const created = (
    await gql(
      `mutation($i: CreateAccessTierInput!){ createAccessTier(input:$i){ tierId } }`,
      { i: { appId: id, name: `e2e-all-access-${rid()}`, isFree: true, isDefault: false, permissionKeys: want } },
      ownerToken,
    )
  ).createAccessTier;
  return created.tierId;
}

/**
 * Provision `playerCount` entitled players on the configured app, entirely
 * through the management API. Returns the app id and the players' credentials.
 */
export async function provisionAppWithPlayers(playerCount) {
  if (!ownerEnvReady()) {
    throw new Error(`owner env not configured (need ${OWNER_ENV.join(', ')})`);
  }
  const id = appId();
  const owner = await loginOwner();
  const tierId = await ensureAllAccessTier(id, owner.token);

  const players = [];
  for (let i = 0; i < playerCount; i++) {
    const player = await registerUser();
    await gql(
      `mutation($i: GrantAppAccessInput!){ grantAppAccess(input:$i){ appUserAccessId status } }`,
      { i: { appId: id, userId: player.userId, tierId } },
      owner.token,
    );
    players.push(player);
  }

  return { appId: id, tierId, owner, players };
}

/**
 * Convenience for the two-client tests: provision `playerCount` entitled players,
 * wait for replica-sync to mirror their access + grid grants into the game DB,
 * and return ready-to-use SDK clients (Bearer token already set) plus the app id.
 *
 * `createCrowdyClient` is passed in so this module never imports the built SDK
 * (tests import it lazily from ../dist).
 */
export async function provisionClients(createCrowdyClient, playerCount, overrides = {}) {
  // The old signature was (createCrowdyClient, config, playerCount) and the
  // config argument is gone, because a gameplay client's URL is no longer the
  // caller's to choose — the mint response names it. A caller that still passes
  // a config object would otherwise loop `playerCount` times over an object and
  // quietly provision nobody, so refuse it.
  if (typeof playerCount !== 'number' || !Number.isInteger(playerCount) || playerCount < 1) {
    throw new TypeError(
      'provisionClients(createCrowdyClient, playerCount, overrides?) — playerCount must be a ' +
        `positive integer, got ${JSON.stringify(playerCount)}. The config argument was removed: ` +
        'gameplay clients are built against the endpoint mintAppAccess returns.',
    );
  }
  const { appId: id, tierId, owner, players } = await provisionAppWithPlayers(playerCount);
  // Two-client pattern: gameplay needs an APP-scoped token (the identity SESSION
  // token is rejected by game-api/Buddy with SCOPE_MISSING). Each entitled player
  // mints one for `id` via the portal and the realtime client carries THAT; the
  // session token stays on the player object for management-plane calls.
  //
  // The mint also says WHERE to spend the token. Each client is built on the
  // app's own datacenter, which is what a real client does and what makes these
  // tests deterministic: the shared entry origin resolves to every datacenter's
  // load balancer, so two calls from one "client" can be answered by different
  // instances — and the UDP proxy connection is per-instance, so a subscription
  // opened on one and a mutation sent to the other never meet.
  const clients = [];
  let endpoint = null;
  for (const p of players) {
    p.sessionToken = p.token;
    const access = await mintAppAccess(id, p.token);
    p.appToken = access.token;
    p.endpoint = access;
    endpoint ??= access;
    const c = createCrowdyClient(gameClientConfig(access, overrides));
    c.setToken(p.appToken);
    clients.push(c);
  }

  // Wait for the management -> game-api replica-sync to mirror each player's
  // access row + grid grant into the per-tenant game DB before clients send
  // traffic. Rather than a blind fixed sleep (racy), poll gameClientBootstrap:
  // it triggers the server-side lazy mirror (ensureAppEntitlementsForUdp) and
  // throws FORBIDDEN until the entitlement lands, so a successful call is a
  // precise readiness signal. CROWDY_TEST_SYNC_WAIT_MS, if set, is still honored
  // as an initial fixed delay for environments that prefer it.
  const initialWaitMs = Number(process.env.CROWDY_TEST_SYNC_WAIT_MS ?? 0);
  if (initialWaitMs > 0) await new Promise((r) => setTimeout(r, initialWaitMs));

  const timeoutMs = Number(process.env.CROWDY_TEST_SYNC_TIMEOUT_MS ?? 15000);
  const deadline = Date.now() + timeoutMs;
  await Promise.all(
    clients.map(async (c) => {
      let lastErr;
      while (Date.now() < deadline) {
        try {
          await c.serverStatus.gameClientBootstrap(id);
          return;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      throw new Error(
        `replica-sync readiness timed out after ${timeoutMs}ms for app ${id}: ${lastErr?.message ?? lastErr}`,
      );
    }),
  );

  return { appId: id, tierId, owner, players, clients, endpoint };
}

/**
 * Mint a short-lived **app-scoped** token for `id` using a player's identity
 * SESSION token, AND learn where that app lives.
 *
 * Gameplay (game-api + Buddy) requires an app token and rejects the session
 * token with `SCOPE_MISSING`, so every realtime client must carry one.
 * Auto-grant-free: an entitled player (or any player on an open-by-default app)
 * gets the token without an explicit prior grant.
 *
 * WHY THIS RETURNS MORE THAN A TOKEN. The mint response is where the API tells a
 * client which datacenter the app is resident in — `gameApiUrl` /
 * `gameApiWsUrl` — and how to find another instance if that one goes away
 * (`discoveryUrl`). A test that took only `.token` and then talked to the shared
 * entry origin was exercising a code path the SDK does not ship for. Hand the
 * whole thing to {@link gameClientConfig}.
 *
 * DELIBERATELY NOT CALLED `mintAppToken`. It used to return a bare string, and a
 * caller that missed this change would have passed an object to `setToken()` and
 * sent `[object Object]` as a Bearer credential — a 401 twenty frames from the
 * cause. Renaming turns that into a ReferenceError at import.
 */
export async function mintAppAccess(id, sessionToken) {
  const data = await gql(
    `mutation($i: MintAppTokenInput!){
       mintAppToken(input:$i){ token gameApiUrl gameApiWsUrl discoveryUrl }
     }`,
    { i: { appId: id } },
    sessionToken,
  );
  return data.mintAppToken;
}

/** The org that owns CROWDY_TEST_APP_ID — the owner's org, used to create new apps. */
export async function ownerOrgId(token) {
  const data = await gql(`query($a: BigInt!){ app(appId: $a){ orgId } }`, { a: appId() }, token);
  return data.app.orgId;
}

/**
 * The first datacenter this deployment can actually place an app in.
 *
 * WHY A SUITE HAS TO ASK RATHER THAN NAME ONE. `createApp` takes a required, permanent
 * `datacenter`, and the accepted codes are a property of the DEPLOYMENT: prod has `or`
 * and `va`, dev has its own, and a developer's single-node database has neither. A
 * hard-coded code would pass wherever it was written and fail everywhere else, which is
 * the same shape of bug as the hard-coded endpoints this suite already learned not to
 * carry.
 *
 * FIRST PLACEABLE, NOT FIRST. An entry with `placeable: false` holds no shards, so no app
 * id can hash into it and creation there fails after 64 candidates — a slow, confusing
 * 503 in the middle of a test run.
 *
 * Deliberately NOT falling back to a guess when there is nothing: an empty list means the
 * control plane has not pushed a topology, and every app-creating test in this suite is
 * about to fail for that one reason. Saying it once, here, beats each of them reporting
 * its own symptom.
 */
export function firstPlaceable(answer, where) {
  const choice = (answer?.datacenters ?? []).find((d) => d.placeable);
  if (!choice) {
    const known = (answer?.datacenters ?? []).map((d) => d.code).join(', ');
    throw new Error(
      `${where}: this deployment can place an app in no datacenter` +
        (known ? ` (it knows ${known}, none placeable)` : ' (it knows none)') +
        '. createApp requires one, so no app-creating test can run. The control plane ' +
        'pushes this with pg:upsert_datacenter_topology.',
    );
  }
  return choice.code;
}

/** {@link firstPlaceable} over the raw endpoint, for callers with a token and no SDK client. */
export async function placeableDatacenter(token) {
  const data = await gql(
    `query{ placeableDatacenters{ datacenters{ code placeable } } }`,
    {},
    token,
  );
  return firstPlaceable(data.placeableDatacenters, 'placeableDatacenter');
}

/** {@link firstPlaceable} over an SDK client, which is how the e2e suites hold a session. */
export async function sdkPlaceableDatacenter(client) {
  return firstPlaceable(
    await client.apps.placeableDatacenters(),
    'client.apps.placeableDatacenters',
  );
}

/**
 * Create a brand-new app under `orgId`. Per the management API, createApp also
 * provisions the app's free, **open-by-default** "Default" access tier with full
 * runtime permissions — the business rule under test: any authenticated player
 * gains access automatically (no explicit grantAppAccess) when they connect.
 *
 * The datacenter is RESOLVED rather than passed or defaulted: it is required, permanent,
 * and deployment-specific. See {@link firstPlaceable}.
 */
export async function createNewApp(token, orgId, label = rid()) {
  const datacenter = await placeableDatacenter(token);
  const data = await gql(
    `mutation($i: CreateAppInput!){ createApp(input: $i){ appId orgId } }`,
    {
      i: {
        orgId,
        name: `e2e-newapp-${label}`,
        slug: `e2e-newapp-${label}`,
        datacenter,
      },
    },
    token,
  );
  return data.createApp.appId;
}

/**
 * Provision a FRESH app + players who are deliberately NOT granted access. The
 * owner creates a new app (which auto-gets the open-by-default tier); we register
 * players but skip grantAppAccess. On connect, the game-api pulls open-by-default
 * access from the management API (s2s ensureDefaultAppAccess) and auto-grants the
 * free default tier, so the players become entitled with zero explicit grants —
 * that's the business rule the new-app test verifies.
 */
export async function provisionNewAppWithPlayers(playerCount) {
  if (!ownerEnvReady()) {
    throw new Error(`owner env not configured (need ${OWNER_ENV.join(', ')})`);
  }
  const owner = await loginOwner();
  const orgId = await ownerOrgId(owner.token);
  const newAppId = await createNewApp(owner.token, orgId);
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push(await registerUser()); // intentionally NO grantAppAccess
  }
  return { appId: newAppId, orgId, owner, players };
}

/**
 * Archive an app this suite created, so a tier does not accumulate one per run.
 *
 * WHY THIS IS WORTH DOING AT ALL. dev reached 46 apps, of which exactly ONE (BWF) had a
 * placement row. The control plane's `app_placement` and `buddy_postgres_locality` checks
 * each reported every unplaced app, producing 93 of dev's 101 consistency findings — so a
 * real app placed in the wrong datacenter was indistinguishable from the debris of a test
 * run. A permanent warning is not a warning.
 *
 * ARCHIVE, not delete, because there is no delete: `archiveApp` flips status and keeps the
 * rows, and hard-deleting an app's distributed Citus data is a separate decision nobody has
 * taken. The control plane now ignores archived apps in both checks, which is what makes
 * this call actually reduce the noise rather than just relabel it.
 *
 * BEST EFFORT on purpose. A cleanup failure must never fail the test that just passed: the
 * assertion is about the product, this is about the tier's tidiness, and conflating them
 * means an unrelated outage in teardown reads as a broken feature. It warns instead, because
 * silent cleanup failure is how the accumulation happened in the first place.
 */
export async function archiveAppQuietly(token, appId) {
  if (!token || !appId) return false;
  try {
    await gql(
      `mutation($a: BigInt!){ archiveApp(appId: $a){ appId status } }`,
      { a: String(appId) },
      token,
    );
    return true;
  } catch (err) {
    console.warn(
      `[provision] could not archive e2e app ${appId}: ${err?.message ?? err}. ` +
        'The tier keeps it, and the control plane will report it as an app with shards ' +
        'and no placement row until somebody archives it by hand.',
    );
    return false;
  }
}
