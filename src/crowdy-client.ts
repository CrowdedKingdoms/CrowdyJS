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
import { SubscriptionManager } from './subscriptions.js';
import type { CrowdyLogger } from './logger.js';
import type { TokenStore } from './session.js';
import { WorldClient } from './world.js';

import { AuthAPI } from './domains/auth.js';
import { UsersAPI } from './domains/users.js';
import { AppsAPI } from './domains/apps.js';
import { PlatformAPI } from './domains/platform.js';
import { ChunksAPI } from './domains/chunks.js';
import { VoxelsAPI } from './domains/voxels.js';
import { ActorsAPI } from './domains/actors.js';
import { TeleportAPI } from './domains/teleport.js';
import { StateAPI } from './domains/state.js';
import { ServerStatusAPI } from './domains/serverStatus.js';
import { ChannelsAPI } from './domains/channels.js';
import { UdpAPI } from './domains/udp.js';

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
  timeout?: number;
  tokenStore?: TokenStore;
  logger?: CrowdyLogger;
  realtime?: {
    retryAttempts?: number;
    retryInitialDelayMs?: number;
    retryMaxDelayMs?: number;
    waitTimeoutMs?: number;
  };
}

export class CrowdyClient {
  /** Shared token state for both game-api and management-api requests. */
  readonly session: AuthState;
  /** game-api HTTP client. */
  readonly graphql: GraphQLClient;
  /** game-api WebSocket subscription manager. */
  readonly realtime: SubscriptionManager;
  /** management-api HTTP client. Same `AuthState` as `graphql`. */
  readonly management: GraphQLClient;

  // Identity + catalog (management-api).
  readonly auth: AuthAPI;
  readonly users: UsersAPI;
  readonly apps: AppsAPI;
  /** Public platform discovery (shared game-api URL, free app quota). */
  readonly platform: PlatformAPI;

  // Game (game-api).
  readonly chunks: ChunksAPI;
  readonly voxels: VoxelsAPI;
  readonly actors: ActorsAPI;
  readonly teleport: TeleportAPI;
  readonly state: StateAPI;
  readonly serverStatus: ServerStatusAPI;
  readonly channels: ChannelsAPI;
  readonly udp: UdpAPI;

  constructor(config: CrowdyClientConfig = {}) {
    this.session = new AuthState(config.tokenStore);

    this.graphql = new GraphQLClient(
      {
        httpUrl: config.httpUrl,
        graphqlEndpoint: config.graphqlEndpoint,
        timeout: config.timeout,
        logger: config.logger,
      },
      this.session,
    );

    this.realtime = new SubscriptionManager(
      {
        wsUrl: config.wsUrl,
        wsEndpoint: config.wsEndpoint,
        logger: config.logger,
        ...config.realtime,
      },
      this.session,
    );

    const managementGraphqlEndpoint =
      config.managementGraphqlEndpoint ??
      (config.managementUrl
        ? `${config.managementUrl.replace(/\/$/, '')}/graphql`
        : config.graphqlEndpoint);

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
    this.platform = new PlatformAPI(this.management);

    this.chunks = new ChunksAPI(this.graphql);
    this.voxels = new VoxelsAPI(this.graphql);
    this.actors = new ActorsAPI(this.graphql);
    this.teleport = new TeleportAPI(this.graphql);
    this.state = new StateAPI(this.graphql);
    this.serverStatus = new ServerStatusAPI(this.graphql);
    this.channels = new ChannelsAPI(this.graphql);
    this.udp = new UdpAPI(this.graphql, this.realtime);
  }

  /** Imperatively set the Bearer token (useful for SSO / token rehydrate). */
  setToken(token: string | null): void {
    this.session.setToken(token);
  }

  /** Read the current Bearer token (null if no session). */
  getToken(): string | null {
    return this.session.getToken();
  }

  world(appId: string): WorldClient {
    return new WorldClient(appId, this.udp);
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
