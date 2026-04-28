/**
 * Public surface of the SDK. Construct one `CrowdyClient` per session and
 * access everything via the typed sub-clients (`client.auth`, `client.udp`,
 * `client.orgs`, ...). The legacy `client.login()` / `client.sendActorUpdate`
 * shortcuts are gone - use `client.auth.login()` / `client.udp.sendActorUpdate()`
 * instead.
 */

import { AuthState } from './auth-state.js';
import { GraphQLClient } from './client.js';
import { SubscriptionManager } from './subscriptions.js';
import type { CrowdyLogger } from './logger.js';
import type { TokenStore } from './session.js';
import { WorldClient } from './world.js';

import { AuthAPI } from './domains/auth.js';
import { UsersAPI } from './domains/users.js';
import { OrganizationsAPI } from './domains/organizations.js';
import { AppsAPI } from './domains/apps.js';
import { AppAccessAPI } from './domains/appAccess.js';
import { BillingAPI } from './domains/billing.js';
import { QuotasAPI } from './domains/quotas.js';
import { PaymentsAPI } from './domains/payments.js';
import { ChunksAPI } from './domains/chunks.js';
import { VoxelsAPI } from './domains/voxels.js';
import { ActorsAPI } from './domains/actors.js';
import { TeleportAPI } from './domains/teleport.js';
import { StateAPI } from './domains/state.js';
import { ServerStatusAPI } from './domains/serverStatus.js';
import { UdpAPI } from './domains/udp.js';

export interface CrowdyClientConfig {
  httpUrl?: string;
  wsUrl?: string;
  graphqlEndpoint?: string;
  wsEndpoint?: string;
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
  // Internal infrastructure (kept private; tests can poke via the auth
  // sub-client's `setToken` / `getToken` for token rehydration).
  readonly session: AuthState;
  readonly graphql: GraphQLClient;
  readonly realtime: SubscriptionManager;

  // Domain wrappers - the canonical surface area.
  readonly auth: AuthAPI;
  readonly users: UsersAPI;
  readonly orgs: OrganizationsAPI;
  readonly apps: AppsAPI;
  readonly appAccess: AppAccessAPI;
  readonly billing: BillingAPI;
  readonly quotas: QuotasAPI;
  readonly payments: PaymentsAPI;
  readonly chunks: ChunksAPI;
  readonly voxels: VoxelsAPI;
  readonly actors: ActorsAPI;
  readonly teleport: TeleportAPI;
  readonly state: StateAPI;
  readonly serverStatus: ServerStatusAPI;
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

    this.auth = new AuthAPI(this.graphql, this.session);
    this.users = new UsersAPI(this.graphql);
    this.orgs = new OrganizationsAPI(this.graphql);
    this.apps = new AppsAPI(this.graphql);
    this.appAccess = new AppAccessAPI(this.graphql);
    this.billing = new BillingAPI(this.graphql);
    this.quotas = new QuotasAPI(this.graphql);
    this.payments = new PaymentsAPI(this.graphql);
    this.chunks = new ChunksAPI(this.graphql);
    this.voxels = new VoxelsAPI(this.graphql);
    this.actors = new ActorsAPI(this.graphql);
    this.teleport = new TeleportAPI(this.graphql);
    this.state = new StateAPI(this.graphql);
    this.serverStatus = new ServerStatusAPI(this.graphql);
    this.udp = new UdpAPI(this.graphql, this.realtime);
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

export function createCrowdyClient(config: CrowdyClientConfig = {}): CrowdyClient {
  return new CrowdyClient(config);
}
