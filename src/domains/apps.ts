/**
 * Apps domain.
 *
 * The current GraphQL schema does NOT expose any direct CRUD endpoints for
 * the `App` (game-app / tenant) entity itself -- apps are provisioned out of
 * band. This wrapper exists as a stable namespace so future app management
 * methods can be added here without churning the public API.
 *
 * In the meantime, app-scoped functionality lives on the relevant domains:
 *   - app access tiers ........... `client.appAccess`
 *   - per-user, per-app state .... `client.state`
 *   - app budgets ................ `client.billing.appBudget` / `setAppBudget`
 *   - chunks/voxels for an app ... `client.chunks` / `client.voxels`
 *
 * Exposed as `client.apps`.
 */
export class AppsAPI {
  constructor() {}
}
