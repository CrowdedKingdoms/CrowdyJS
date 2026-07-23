/**
 * Public surface of the SDK. Construct one `CrowdyClient` per session and
 * access everything via the typed sub-clients (`client.auth`, `client.udp`,
 * `client.chunks`, ...).
 *
 * The management/game-api split means CrowdyJS now talks to **two** GraphQL
 * endpoints behind the scenes:
 *
 *   - `managementUrl` / `managementGraphqlEndpoint` -> `cks-management-api`
 *     used by `auth` (login, register, logout, password / email flows) and
 *     `users` (me, updateGamertag, deleteMyAccount). This is also where
 *     `game_tokens` are minted.
 *
 *   - `httpUrl` / `graphqlEndpoint` -> `cks-game-api`
 *     used by every game / world / replication sub-client
 *     (`chunks`, `voxels`, `actors`, `teleport`, `state`, `serverStatus`,
 *     `udp`). WebSocket subscriptions (`wsUrl`) also target this endpoint.
 *
 * A single `AuthState` is shared across both clients, so once
 * `client.auth.login()` returns, every subsequent SDK call (against either
 * endpoint) carries the Bearer token automatically.
 */

import { AuthState } from './auth-state.js';
import { GraphQLClient } from './client.js';
import { LbCookieStore } from './lb-cookie-store.js';
import { RealtimeMetrics } from './metrics.js';
import { SubscriptionManager } from './subscriptions.js';
import type { CrowdyLogger } from './logger.js';
import type { TokenStore } from './session.js';
import { CrowdyProtocolError } from './errors.js';
import { WorldClient } from './world.js';
import { GameKitClient, type GameKitOptions } from './kit/index.js';

import { AuthAPI } from './domains/auth.js';
import { UsersAPI } from './domains/users.js';
import { AppsAPI } from './domains/apps.js';
import {
  PortalAPI,
  type AppTokenResponse,
  type PkceStore,
} from './domains/portal.js';
import { PlatformAPI } from './domains/platform.js';
import { OrganizationsAPI } from './domains/organizations.js';
import { AppAccessAPI } from './domains/appAccess.js';
import { BillingAPI } from './domains/billing.js';
import { PaymentsAPI } from './domains/payments.js';
import { QuotasAPI } from './domains/quotas.js';
import { EnvironmentsAPI } from './domains/environments.js';
import { UsageAPI } from './domains/usage.js';
import { SharedEnvironmentAPI } from './domains/sharedEnvironment.js';
import { ControlPlaneAPI } from './domains/controlPlane.js';
import { AdminAPI } from './domains/admin.js';
import { ChunksAPI } from './domains/chunks.js';
import { AvatarsAPI } from './domains/avatars.js';
import { HostAPI } from './domains/host.js';
import { GameAppsAPI } from './domains/gameApps.js';
import { VoxelsAPI } from './domains/voxels.js';
import { ActorsAPI } from './domains/actors.js';
import { TeleportAPI } from './domains/teleport.js';
import { StateAPI } from './domains/state.js';
import { ServerStatusAPI } from './domains/serverStatus.js';
import { ChannelsAPI } from './domains/channels.js';
import { TeamsAPI } from './domains/teams.js';
import { UdpAPI } from './domains/udp.js';
import { GameModelAPI } from './domains/gameModel.js';
import { ComputeAPI } from './domains/compute.js';
import { PlayerComputeAPI } from './domains/playerCompute.js';
import { PlayerCodeProjectsAPI } from './domains/playerCodeProjects.js';
import { PlayerWalletAPI } from './domains/playerWallet.js';
import { MarketplaceAPI } from './domains/marketplace.js';
import { PlayerModelAPI } from './domains/playerModel.js';

export interface CrowdyClientConfig {
  // ----- Game API (default endpoint) -----
  /** game-api HTTP root (e.g. `https://dev-game-api.crowdedkingdoms.com`). */
  httpUrl?: string;
  /** game-api WS root. */
  wsUrl?: string;
  /** game-api GraphQL endpoint. Defaults to `${httpUrl}/graphql`. */
  graphqlEndpoint?: string;
  /** game-api WS endpoint. Defaults to `${wsUrl}/graphql`. */
  wsEndpoint?: string;

  // ----- Management API (auth + identity) -----
  /**
   * management-api HTTP root (e.g.
   * `https://dev-management-api.crowdedkingdoms.com`). When set,
   * `client.auth` and `client.users` route here. If left empty the SDK
   * falls back to `httpUrl` for backwards-compatibility with the legacy
   * single-endpoint deployment, but new code should set this explicitly.
   */
  managementUrl?: string;
  /** management-api GraphQL endpoint. Defaults to `${managementUrl}/graphql`. */
  managementGraphqlEndpoint?: string;

  // ----- Common -----
  /** Per-request HTTP timeout in milliseconds (applies to both endpoints). */
  timeout?: number;
  /**
   * Persistence for the Bearer token across reloads. `BrowserLocalStorageTokenStore`
   * is provided; supply your own for SSR/Node. When omitted the token lives only
   * in memory for the lifetime of the client.
   */
  tokenStore?: TokenStore;
  /** Optional logger for SDK diagnostics (request/realtime lifecycle). */
  logger?: CrowdyLogger;
  /**
   * Optional storage for the PKCE verifier across the portal redirect round-trip
   * (`client.portal.beginEntry` -> `completeEntry`). Defaults to a
   * sessionStorage-backed store in the browser; supply your own for SSR, native,
   * or tests where sessionStorage is unavailable.
   */
  pkceStore?: PkceStore;
  /** Realtime (WebSocket) tuning for reconnect backoff and `...AndWait` timeouts. */
  realtime?: {
    /** Max reconnect attempts before giving up (default tuned for browsers). */
    retryAttempts?: number;
    /** Initial reconnect backoff in milliseconds. */
    retryInitialDelayMs?: number;
    /** Maximum reconnect backoff in milliseconds (the backoff is capped here). */
    retryMaxDelayMs?: number;
    /** Default timeout for `...AndWait` round-trips that await a matching echo. */
    waitTimeoutMs?: number;
  };
  /**
   * Optional sticky-LB cookie jar shared with the game-api HTTP client. Node
   * runtimes must forward `cks_ga` on the WebSocket upgrade; browsers send it
   * automatically once HTTP has stored the cookie via `credentials: 'include'`.
   */
  lbCookieStore?: LbCookieStore;
}

export class CrowdyClient {
  private gameplayTokenRefresh: Promise<AppTokenResponse> | null = null;

  /** Shared token state for both game-api and management-api requests. */
  readonly session: AuthState;
  /** game-api HTTP client. */
  readonly graphql: GraphQLClient;
  /** game-api WebSocket subscription manager. */
  readonly realtime: SubscriptionManager;
  /**
   * Realtime traffic counters: every `udp.send*` message (including the ones
   * the World Stores layers issue internally) and every notification delivered
   * on the shared `udpNotifications` subscription, with totals, a per-kind
   * breakdown, and ~10 s sliding-window rates. Read with
   * {@link RealtimeMetrics.snapshot}; byte counts measure app-defined payload
   * fields (not wire framing). See {@link RealtimeMetrics}.
   */
  readonly metrics: RealtimeMetrics;
  /** management-api HTTP client. Same `AuthState` as `graphql`. */
  readonly management: GraphQLClient;

  // Identity + catalog (management-api).
  /** Auth + session: login, register, logout, password/email flows. */
  readonly auth: AuthAPI;
  /** Current-user identity: `me`, gamertag, account deletion. */
  readonly users: UsersAPI;
  /** App discovery + routing (which game-api serves a given app). */
  readonly apps: AppsAPI;
  /**
   * Overworld portal: mint/exchange/refresh app-scoped gameplay tokens and the
   * PKCE browser handoff. Identity session token mints; games receive only an
   * app token.
   */
  readonly portal: PortalAPI;
  /** Public platform discovery (shared game-api URL, free app quota). */
  readonly platform: PlatformAPI;
  /** Organizations, members, RBAC roles, and org API tokens (studio admin). */
  readonly organizations: OrganizationsAPI;
  /** App access tiers + per-user access grants (studio admin). */
  readonly appAccess: AppAccessAPI;
  /** Org wallet + per-app spend budgets (studio admin). */
  readonly billing: BillingAPI;
  /** Payment checkouts: wallet top-ups, plan purchases (studio admin). */
  readonly payments: PaymentsAPI;
  /** Usage quotas at the org/app scope (studio admin). */
  readonly quotas: QuotasAPI;
  /** Dedicated customer environments: provision, scale, deploy (studio admin). */
  readonly environments: EnvironmentsAPI;
  /** Replication + GraphQL usage reporting (studio admin). */
  readonly usage: UsageAPI;
  /** Shared-environment publishing, runtime gating, auto-billing (studio admin). */
  readonly sharedEnvironment: SharedEnvironmentAPI;
  /** Operator (control-plane) surface — requires `is_operator`. */
  readonly operator: ControlPlaneAPI;
  /**
   * Studio-admin facade grouping the privileged management sub-clients
   * (`organizations`, `appAccess`, `billing`, `payments`, `quotas`,
   * `environments`, `usage`, `sharedEnvironment`, `grids`) under one namespace.
   */
  readonly admin: AdminAPI;

  // Game (game-api).
  /** Chunk reads/writes: terrain, LODs, chunk state, distance queries. */
  readonly chunks: ChunksAPI;
  /** Voxel reads/writes: list, history, rollback, single-voxel edits. */
  readonly voxels: VoxelsAPI;
  /** Persisted-actor CRUD (durable records; realtime is `udp`/`world`). */
  readonly actors: ActorsAPI;
  /** Teleport: move an actor to a destination chunk/world. */
  readonly teleport: TeleportAPI;
  /** Per-user/per-app persisted state blobs. */
  readonly state: StateAPI;
  /** Server status + version discovery (UDP availability, version floors). */
  readonly serverStatus: ServerStatusAPI;
  /** Channels: location-independent pub/sub messaging groups. */
  readonly channels: ChannelsAPI;
  /** Teams: app-scoped player groups with roles and delegated management. */
  readonly teams: TeamsAPI;
  /** UDP proxy: spatial sends + the shared realtime notification subscription. */
  readonly udp: UdpAPI;
  /** Abstract game model: containers, properties, functions, sessions. */
  readonly gameModel: GameModelAPI;
  /** Compute Modules: server-side Rust/WASM logic (manage, invoke, observe). */
  readonly compute: ComputeAPI;
  /** Player-authored Rust/WASM bound to player-owned grids. */
  readonly playerCompute: PlayerComputeAPI;
  /** Cloud source projects consumed by the project-first Mod Studio. */
  readonly playerCodeProjects: PlayerCodeProjectsAPI;

  /** P4a marketplace (free mode): store, installs, consent, claim flows. */
  readonly marketplace: MarketplaceAPI;
  /** Player wallet, spend caps, hourly usage charges, and player policy (P2). */
  readonly playerWallet: PlayerWalletAPI;
  /** Player-owned flexible model data and grid-confined automations. */
  readonly playerModel: PlayerModelAPI;
  /** Durable avatars + per-app avatar state (owner-aware reads). */
  readonly avatars: AvatarsAPI;
  /** Game-host election + actor liveness heartbeat. */
  readonly host: HostAPI;
  /** App grids + grid runtime-permission administration (app admin). */
  readonly gameApps: GameAppsAPI;

  constructor(config: CrowdyClientConfig = {}) {
    this.session = new AuthState(config.tokenStore);
    const lbCookieStore = config.lbCookieStore ?? new LbCookieStore();

    this.graphql = new GraphQLClient(
      {
        httpUrl: config.httpUrl,
        graphqlEndpoint:
          config.graphqlEndpoint ?? toGraphqlEndpoint(config.httpUrl, 'graphql'),
        timeout: config.timeout,
        logger: config.logger,
        lbCookieStore,
      },
      this.session,
    );

    this.metrics = new RealtimeMetrics();

    this.realtime = new SubscriptionManager(
      {
        wsEndpoint:
          config.wsEndpoint ?? toGraphqlEndpoint(config.wsUrl, 'graphql'),
        logger: config.logger,
        lbCookieStore,
        ...config.realtime,
      },
      this.session,
      this.metrics,
    );

    const managementGraphqlEndpoint =
      config.managementGraphqlEndpoint ??
      toGraphqlEndpoint(config.managementUrl, 'graphql') ??
      config.graphqlEndpoint;

    // Management-api client. Falls back to game-api endpoint if the caller
    // hasn't configured `managementUrl` yet (single-endpoint legacy mode).
    this.management = new GraphQLClient(
      {
        httpUrl: config.managementUrl ?? config.httpUrl,
        graphqlEndpoint: managementGraphqlEndpoint,
        timeout: config.timeout,
        logger: config.logger,
      },
      this.session,
    );

    this.auth = new AuthAPI(this.management, this.session);
    this.users = new UsersAPI(this.management);
    this.apps = new AppsAPI(this.management);
    this.portal = new PortalAPI(this.management, this.session, config.pkceStore);
    this.platform = new PlatformAPI(this.management);
    this.organizations = new OrganizationsAPI(this.management);
    this.appAccess = new AppAccessAPI(this.management);
    this.billing = new BillingAPI(this.management);
    this.payments = new PaymentsAPI(this.management);
    this.quotas = new QuotasAPI(this.management);
    this.environments = new EnvironmentsAPI(this.management);
    this.usage = new UsageAPI(this.management);
    this.sharedEnvironment = new SharedEnvironmentAPI(this.management);
    this.operator = new ControlPlaneAPI(this.management);

    this.chunks = new ChunksAPI(this.graphql);
    this.voxels = new VoxelsAPI(this.graphql);
    this.actors = new ActorsAPI(this.graphql);
    this.teleport = new TeleportAPI(this.graphql);
    this.state = new StateAPI(this.graphql);
    this.serverStatus = new ServerStatusAPI(this.graphql);
    this.channels = new ChannelsAPI(this.graphql);
    this.teams = new TeamsAPI(this.graphql);
    this.udp = new UdpAPI(this.graphql, this.realtime, this.metrics);
    this.gameModel = new GameModelAPI(this.graphql, {
      wsUrl: config.wsEndpoint ?? toGraphqlEndpoint(config.wsUrl, 'graphql'),
      getToken: () => this.session.getToken(),
    });
    this.compute = new ComputeAPI(this.graphql);
    this.playerCompute = new PlayerComputeAPI(this.graphql);
    this.playerCodeProjects = new PlayerCodeProjectsAPI(this.graphql);
    this.playerWallet = new PlayerWalletAPI(this.management);
    this.marketplace = new MarketplaceAPI(this.graphql, this.management);
    this.playerModel = new PlayerModelAPI(this.graphql);
    this.avatars = new AvatarsAPI(this.graphql);
    this.host = new HostAPI(this.graphql);
    this.gameApps = new GameAppsAPI(this.graphql);

    this.admin = new AdminAPI({
      organizations: this.organizations,
      apps: this.apps,
      appAccess: this.appAccess,
      billing: this.billing,
      payments: this.payments,
      quotas: this.quotas,
      environments: this.environments,
      usage: this.usage,
      sharedEnvironment: this.sharedEnvironment,
      grids: this.gameApps,
    });
  }

  /** Imperatively set the Bearer token (useful for SSO / token rehydrate). */
  setToken(token: string | null): void {
    this.session.setToken(token);
  }

  /** Read the current Bearer token (null if no session). */
  getToken(): string | null {
    return this.session.getToken();
  }

  /**
   * Rotate an active gameplay token without orphaning its old UDP proxy.
   *
   * This is the supported refresh path while a game client has an open UDP
   * proxy: it disconnects that proxy while the old Bearer token is still
   * active, calls {@link PortalAPI.refresh} to rotate and store the new token,
   * then opens a proxy authenticated by the new token. The session token
   * listener restarts the existing realtime subscription in place, so its
   * registered notification handlers are retained rather than duplicated.
   * Concurrent calls share one in-flight rotation.
   *
   * Failure semantics:
   * - If the old proxy disconnect rejects or does not confirm closure, rotation
   *   is aborted and the old token remains active.
   * - If refresh rejects, the old token remains active (the old proxy has
   *   already closed and can be opened again with {@link UdpAPI.connect}).
   * - If opening the new proxy rejects, the fresh token remains active. Surface
   *   the error and retry {@link UdpAPI.connect}; do not repeat the rotation
   *   merely to retry that connection.
   *
   * @returns The fresh app-scoped token response stored on this client.
   * @throws {CrowdyProtocolError} if the old proxy does not confirm closure.
   * @throws Transport or GraphQL errors from the disconnect, refresh, or
   *   reconnect step, with token state preserved as described above.
   */
  async refreshGameplayToken(): Promise<AppTokenResponse> {
    if (this.gameplayTokenRefresh) return this.gameplayTokenRefresh;

    const operation = this.performGameplayTokenRefresh();
    this.gameplayTokenRefresh = operation;
    try {
      return await operation;
    } finally {
      if (this.gameplayTokenRefresh === operation) {
        this.gameplayTokenRefresh = null;
      }
    }
  }

  private async performGameplayTokenRefresh(): Promise<AppTokenResponse> {
    const disconnected = await this.udp.disconnect();
    if (!disconnected) {
      throw new CrowdyProtocolError({
        message:
          'UDP proxy did not confirm disconnect; gameplay token rotation was aborted',
      });
    }

    const token = await this.portal.refresh();
    await this.udp.connect();
    return token;
  }

  /**
   * Ergonomic, app-scoped realtime facade. `client.world(appId)` returns a
   * {@link WorldClient} whose `actor()` and `subscribe()` helpers pass `appId`
   * for you and manage chunk/sequence bookkeeping — the recommended entry point
   * for game loops. The lower-level `client.udp` remains available.
   *
   * @param appId - The app to scope realtime traffic to (BigInt as a decimal string).
   */
  world(appId: string): WorldClient {
    return new WorldClient(appId, this.udp);
  }

  /**
   * App-scoped **Game Kit** facade over `client.gameModel`: high-level
   * building blocks that map traditional game concepts onto Game Models +
   * Automations — `kit.inventory` (bags/item stacks), `kit.objects` (lockable
   * doors/chests with custom permissions), `kit.npcs` (server-driven NPCs),
   * and the studio-side `kit.deploy(blueprints)` that loads the matching
   * rules/state into the app (requires `manage_apps`). See
   * {@link GameKitClient} and the "CrowdyJS → Game Kit" docs guide.
   *
   * @param appId - The app to scope model calls to (BigInt as a decimal string).
   * @param options - Optional per-helper config when your blueprints use
   *   non-default type names/prefixes.
   */
  kit(appId: string, options?: GameKitOptions): GameKitClient {
    return new GameKitClient(appId, this.gameModel, this.gameApps, options, {
      channels: this.channels,
      teams: this.teams,
      udp: this.udp,
      compute: this.compute,
    });
  }

  /** Closes the WebSocket and clears the in-memory auth token. */
  close(): void {
    this.realtime.close();
    this.session.setToken(null);
  }
}

export function createCrowdyClient(
  config: CrowdyClientConfig = {},
): CrowdyClient {
  return new CrowdyClient(config);
}

/**
 * Normalize a base URL into a GraphQL endpoint. Accepts either a base origin
 * (`https://game.example.com`) or a full endpoint already ending in `/graphql`
 * (the historical form some callers pass as `httpUrl`/`wsUrl`), so the portal's
 * `gameApiUrl` (a base URL) is usable directly. Returns undefined for empty input.
 */
function toGraphqlEndpoint(
  url: string | undefined,
  suffix: string,
): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const noSlash = trimmed.replace(/\/$/, '');
  return noSlash.endsWith(`/${suffix}`) ? noSlash : `${noSlash}/${suffix}`;
}
