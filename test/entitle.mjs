/**
 * E2E entitlement helper.
 *
 * Permissions are always enforced server-side, so a freshly registered SDK user
 * has to be entitled before they can act in an app: an active app_user_access row
 * on a tier holding the runtime permissions, plus a grid covering the play area
 * with a per-user grid grant. This mirrors what the platform creates
 * open-by-default (default tier + world-spanning grid + auto-grant on access),
 * written directly to BOTH the management DB (canonical) and the game DB (the
 * mirror Buddy reads) so the test is self-sufficient against a local stack.
 *
 * Gated by DB env vars (same names the buddy python tests use): MGMT_DB_* for the
 * management DB and DB_WRITER_* for the per-tenant game DB. When they're absent
 * the two-client tests skip (they already require live URLs + accounts).
 */
import pg from 'pg';

const WORLD_BOUND = 1_000_000_000;

export function dbEnvReady() {
  return !!(process.env.MGMT_DB_PASSWORD && process.env.DB_WRITER_PASSWORD);
}

function mgmtClient() {
  return new pg.Client({
    host: process.env.MGMT_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.MGMT_DB_PORT ?? 5432),
    database: process.env.MGMT_DB_NAME ?? 'cks_management',
    user: process.env.MGMT_DB_USER ?? 'cks_mgmt',
    password: process.env.MGMT_DB_PASSWORD,
  });
}

function gameClient() {
  return new pg.Client({
    host: process.env.DB_WRITER_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_WRITER_PORT ?? 5432),
    database: process.env.DB_WRITER_NAME ?? 'cks_game',
    user: process.env.DB_WRITER_USER ?? 'cks_game',
    password: process.env.DB_WRITER_PASSWORD,
  });
}

/**
 * Entitle `userId` to `appId`: full app access (default tier + all permissions)
 * and full grid access on a world-spanning grid, in both DBs.
 */
export async function entitleUserForApp(appId, userId) {
  const aid = String(appId);
  const uid = String(userId);

  const m = mgmtClient();
  await m.connect();
  let tierId;
  try {
    const t = await m.query(
      `INSERT INTO app_access_tiers (app_id, name, is_free, is_default, status)
       VALUES ($1, 'e2e-default', TRUE, TRUE, 'active')
       ON CONFLICT (app_id, name) DO UPDATE SET status = 'active'
       RETURNING tier_id`,
      [aid],
    );
    tierId = String(t.rows[0].tier_id);
    await m.query(
      `INSERT INTO app_access_tier_permissions (app_id, tier_id, permission_key)
       SELECT $1, $2, permission_key FROM runtime_permissions
       ON CONFLICT DO NOTHING`,
      [aid, tierId],
    );
    await m.query(
      `INSERT INTO app_user_access (app_id, user_id, tier_id, status, granted_by)
       VALUES ($1, $2, $3, 'active', 'e2e')
       ON CONFLICT (app_id, user_id) DO UPDATE SET tier_id = EXCLUDED.tier_id, status = 'active'`,
      [aid, uid, tierId],
    );
  } finally {
    await m.end();
  }

  const g = gameClient();
  await g.connect();
  try {
    await g.query(
      `INSERT INTO apps (app_id, org_id) VALUES ($1, 1) ON CONFLICT (app_id) DO NOTHING`,
      [aid],
    );
    await g.query(
      `INSERT INTO app_access_tiers (tier_id, app_id, name, status)
       VALUES ($1, $2, 'e2e-default', 'active')
       ON CONFLICT (tier_id) DO UPDATE SET status = 'active'`,
      [tierId, aid],
    );
    await g.query(
      `SELECT setval(pg_get_serial_sequence('app_access_tiers','tier_id'),
                     GREATEST((SELECT MAX(tier_id) FROM app_access_tiers), 1), true)`,
    );
    await g.query(
      `INSERT INTO app_access_tier_permissions (app_id, tier_id, permission_key)
       SELECT $1, $2, permission_key FROM runtime_permissions
       WHERE is_active = TRUE AND applies_to_app = TRUE
       ON CONFLICT DO NOTHING`,
      [aid, tierId],
    );
    await g.query(
      `INSERT INTO app_user_access (app_id, user_id, tier_id, status, granted_by)
       VALUES ($1, $2, $3, 'active', 'e2e')
       ON CONFLICT (app_id, user_id) DO UPDATE SET tier_id = EXCLUDED.tier_id, status = 'active'`,
      [aid, uid, tierId],
    );
    // Ensure a world-spanning grid exists, then grant the user every grid
    // permission on EVERY grid of the app and recompute each. Buddy authorizes on
    // the first grid that contains the chunk, so granting only the new grid would
    // be denied when older/overlapping grids (e.g. from other test runs) sort
    // first — so we grant across all of the app's grids.
    await g.query(
      `INSERT INTO grids (app_id, low_chunk, high_chunk)
       VALUES ($1, ROW($2,$2,$2)::vector3_int64, ROW($3,$3,$3)::vector3_int64)
       ON CONFLICT (app_id, low_chunk, high_chunk) DO NOTHING`,
      [aid, -WORLD_BOUND, WORLD_BOUND],
    );
    await g.query(
      `INSERT INTO grid_user_direct_grants (app_id, grid_id, user_id, permission_key)
       SELECT gr.app_id, gr.grid_id, $2, rp.permission_key
       FROM grids gr CROSS JOIN runtime_permissions rp
       WHERE gr.app_id = $1 AND rp.applies_to_grid = TRUE AND rp.is_active = TRUE
       ON CONFLICT (app_id, grid_id, user_id, permission_key) DO NOTHING`,
      [aid, uid],
    );
    await g.query(
      `SELECT fn_recompute_user_grid_permissions($1, gr.grid_id)
       FROM grids gr WHERE gr.app_id = $2`,
      [uid, aid],
    );
  } finally {
    await g.end();
  }
}
