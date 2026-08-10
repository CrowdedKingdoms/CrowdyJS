/**
 * Black-box e2e provisioning via the PUBLIC API — no database access.
 *
 * CrowdyJS is a public client SDK, so its tests must set themselves up the way a
 * real integrator would: through the API, never the database.
 *
 * An app **owner** (an org admin who owns the target app) signs in (passwordless
 * dev bypass), ensures the app has an access tier holding every runtime
 * permission, then creates players (devLogin create-on-first-use) and grants
 * each one access to the app. Granting access also auto-grants the user full grid
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
 *   CROWDY_OWNER_EMAIL      owner sign-in (owns CROWDY_TEST_APP_ID; passwordless)
 *   CROWDY_TEST_APP_ID      app to test against (default '1')
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

export const OWNER_ENV = ['CROWDY_HTTP_URL', 'CROWDY_OWNER_EMAIL'];

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
 * Passwordless dev-bypass sign-in via the management API; returns the identity
 * AuthResponse projection. The account is created on first use, so a never-seen
 * email yields a brand-new user. Requires the server to have DEV_AUTH_BYPASS
 * enabled (dev/test/builder); throws FORBIDDEN otherwise.
 */
async function devLogin(email) {
  const data = await gql(
    `mutation DevLogin($i: DevLoginInput!) {
       devLogin(input: $i) { token gameTokenId user { userId email } }
     }`,
    { i: { email } },
  );
  const r = data.devLogin;
  return { email: r.user.email ?? email, token: r.token, gameTokenId: r.gameTokenId, userId: r.user.userId };
}

/** Register (create-on-first-use) a fresh player through the public management API. */
export async function registerUser(overrides = {}) {
  const email = overrides.email ?? `crowdy-e2e-${rid()}@test.invalid`;
  return devLogin(email);
}

/** Sign in (passwordless dev bypass) as `email`; returns `{ token, userId }`. */
export async function loginAs(email) {
  const { token, userId } = await devLogin(email);
  return { token, userId };
}

async function loginOwner() {
  return loginAs(process.env.CROWDY_OWNER_EMAIL);
}

/** Log in as the configured app owner; returns `{ token, userId }`. */
export async function provisionOwner() {
  if (!ownerEnvReady()) {
    throw new Error(`owner env not configured (need ${OWNER_ENV.join(', ')})`);
  }
  return loginOwner();
}

/** Env for the operator/super-admin persona used by control-plane e2e. */
export const OPERATOR_ENV = ['CROWDY_OPERATOR_EMAIL'];

export function operatorEnvReady() {
  return OPERATOR_ENV.every((k) => !!process.env[k]);
}

/**
 * Sign in as the operator/super-admin persona (passwordless dev bypass). Uses
 * CROWDY_OPERATOR_EMAIL when set; otherwise falls back to the owner
 * (in the local smoke stack the seeded owner is also a super-admin/operator).
 */
export async function provisionOperator() {
  if (operatorEnvReady()) {
    return loginAs(process.env.CROWDY_OPERATOR_EMAIL);
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
 * Create a brand-new app under `orgId`. Per the management API, createApp also
 * provisions the app's free, **open-by-default** "Default" access tier with full
 * runtime permissions — the business rule under test: any authenticated player
 * gains access automatically (no explicit grantAppAccess) when they connect.
 */
export async function createNewApp(token, orgId, label = rid()) {
  const data = await gql(
    `mutation($i: CreateAppInput!){ createApp(input: $i){ appId orgId } }`,
    { i: { orgId, name: `e2e-newapp-${label}`, slug: `e2e-newapp-${label}` } },
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
