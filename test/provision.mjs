/**
 * Black-box e2e provisioning via the PUBLIC management API — no database access.
 *
 * CrowdyJS is a public client SDK, so its tests must set themselves up the way a
 * real integrator would: through the management API, never the database.
 *
 * An app **owner** (an org admin who owns the target app) logs in, ensures the
 * app has an access tier holding every runtime permission, then registers
 * players and grants each one access to the app. Granting access fires the
 * management -> game-api replica-sync, which server-side mirrors the access row
 * into the per-tenant game DB AND auto-grants the user full grid permissions on
 * the app's open-by-default world grid (see cks-game-api
 * ReplicaSyncService.grantDefaultGridAccess). So after a grant the player's
 * spatial traffic is authorized end to end with zero direct DB writes.
 *
 * This matches production: an integrator (studio) owns its app and entitles its
 * own users. The test targets the app the game-api is serving:
 *
 *   CROWDY_MANAGEMENT_URL   management-api root (the SDK appends /graphql)
 *   CROWDY_OWNER_EMAIL      owner login (owns CROWDY_TEST_APP_ID)
 *   CROWDY_OWNER_PASSWORD
 *   CROWDY_TEST_APP_ID      app to test against (default '1')
 *
 * No MGMT_DB_* / DB_WRITER_* credentials.
 */
import { randomBytes } from 'node:crypto';

const DEFAULT_PERMISSION_KEYS = ['access', 'teleport', 'update_voxel_data', 'use_voice_chat'];
const DEFAULT_PLAYER_PASSWORD = 'TestPassword123!';

export const OWNER_ENV = ['CROWDY_MANAGEMENT_URL', 'CROWDY_OWNER_EMAIL', 'CROWDY_OWNER_PASSWORD'];

export function ownerEnvReady() {
  return OWNER_ENV.every((k) => !!process.env[k]);
}

export function appId() {
  return process.env.CROWDY_TEST_APP_ID ?? '1';
}

function managementEndpoint() {
  const base = process.env.CROWDY_MANAGEMENT_URL;
  if (!base) throw new Error('CROWDY_MANAGEMENT_URL is not set');
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

/** Register a fresh player through the public management API. */
export async function registerUser(overrides = {}) {
  const email = overrides.email ?? `crowdy-e2e-${rid()}@test.invalid`;
  const password = overrides.password ?? DEFAULT_PLAYER_PASSWORD;
  const data = await gql(
    `mutation Register($i: RegisterUserInput!) {
       register(registerUserInput: $i) { token gameTokenId user { userId email } }
     }`,
    { i: { email, password } },
  );
  const r = data.register;
  return { email, password, token: r.token, gameTokenId: r.gameTokenId, userId: r.user.userId };
}

async function loginOwner() {
  const data = await gql(
    `mutation Login($i: LoginUserInput!) {
       login(loginUserInput: $i) { token user { userId } }
     }`,
    { i: { email: process.env.CROWDY_OWNER_EMAIL, password: process.env.CROWDY_OWNER_PASSWORD } },
  );
  return { token: data.login.token, userId: data.login.user.userId };
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
export async function provisionClients(createCrowdyClient, config, playerCount) {
  const { appId: id, tierId, owner, players } = await provisionAppWithPlayers(playerCount);
  // Give the management -> game-api replica-sync a moment to mirror the access
  // rows + grid grants into the per-tenant game DB before clients send traffic.
  const syncWaitMs = Number(process.env.CROWDY_TEST_SYNC_WAIT_MS ?? 3000);
  await new Promise((r) => setTimeout(r, syncWaitMs));
  const clients = players.map((p) => {
    const c = createCrowdyClient(config);
    c.setToken(p.token);
    return c;
  });
  return { appId: id, tierId, owner, players, clients };
}
