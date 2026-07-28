import type { OrganizationsAPI } from './organizations.js';
import type { AppsAPI } from './apps.js';
import type { AppAccessAPI } from './appAccess.js';
import type { BillingAPI } from './billing.js';
import type { PaymentsAPI } from './payments.js';
import type { QuotasAPI } from './quotas.js';
import type { UsageAPI } from './usage.js';
import type { SharedEnvironmentAPI } from './sharedEnvironment.js';
import type { GameAppsAPI } from './gameApps.js';

/**
 * Studio-admin facade — exposed as `client.admin`.
 *
 * Groups the privileged studio-administration sub-clients under one namespace so
 * the browser-first, end-user surface (`client.auth`, `client.udp`,
 * `client.world(...)`, ...) stays visually distinct from the management/admin
 * surface a studio backend drives with a privileged token. These are the same
 * instances also reachable at the top level (e.g. `client.billing`), grouped
 * here for discoverability.
 *
 * Operator-only platform operations live separately under `client.operator`
 * (requires `is_operator`).
 *
 * @example
 * ```ts
 * const org = await client.admin.organizations.create({ name, slug });
 * const tier = await client.admin.appAccess.createTier({ ... });
 * await client.admin.billing.setAppBudget(orgId, appId, '5000');
 * ```
 */
export class AdminAPI {
  /** Organizations, members, RBAC roles, and org API tokens. */
  readonly organizations: OrganizationsAPI;
  /** App registry, routing, and player-code admission policy. */
  readonly apps: AppsAPI;
  /** App access tiers + per-user access grants. */
  readonly appAccess: AppAccessAPI;
  /** Org wallet + per-app spend budgets. */
  readonly billing: BillingAPI;
  /** Payment checkouts (wallet top-ups, plan purchases). */
  readonly payments: PaymentsAPI;
  /** Usage quotas at the org/app scope. */
  readonly quotas: QuotasAPI;
  /** Replication + GraphQL usage reporting. */
  readonly usage: UsageAPI;
  /** Shared-environment publishing, runtime gating, auto-billing. */
  readonly sharedEnvironment: SharedEnvironmentAPI;
  /** App grids + grid runtime-permission administration. */
  readonly grids: GameAppsAPI;

  constructor(deps: {
    organizations: OrganizationsAPI;
    apps: AppsAPI;
    appAccess: AppAccessAPI;
    billing: BillingAPI;
    payments: PaymentsAPI;
    quotas: QuotasAPI;
    usage: UsageAPI;
    sharedEnvironment: SharedEnvironmentAPI;
    grids: GameAppsAPI;
  }) {
    this.organizations = deps.organizations;
    this.apps = deps.apps;
    this.appAccess = deps.appAccess;
    this.billing = deps.billing;
    this.payments = deps.payments;
    this.quotas = deps.quotas;
    this.usage = deps.usage;
    this.sharedEnvironment = deps.sharedEnvironment;
    this.grids = deps.grids;
  }
}
