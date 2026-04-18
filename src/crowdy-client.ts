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
  graphqlEndpoint?: string;
  wsEndpoint?: string;
  timeout?: number;
}

export class CrowdyClient {
  // Internal infrastructure (kept private; tests can poke via the auth
  // sub-client's `setToken` / `getToken` for token rehydration).
  private readonly authState: AuthState;
  private readonly client: GraphQLClient;
  private readonly subscriptions: SubscriptionManager;

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
    this.authState = new AuthState();
    this.client = new GraphQLClient(
      { graphqlEndpoint: config.graphqlEndpoint, timeout: config.timeout },
      this.authState,
    );
    this.subscriptions = new SubscriptionManager(
      { wsEndpoint: config.wsEndpoint },
      this.authState,
    );

    this.auth = new AuthAPI(this.client, this.authState);
    this.users = new UsersAPI(this.client);
    this.orgs = new OrganizationsAPI(this.client);
    this.apps = new AppsAPI(this.client);
    this.appAccess = new AppAccessAPI(this.client);
    this.billing = new BillingAPI(this.client);
    this.quotas = new QuotasAPI(this.client);
    this.payments = new PaymentsAPI(this.client);
    this.chunks = new ChunksAPI(this.client);
    this.voxels = new VoxelsAPI(this.client);
    this.actors = new ActorsAPI(this.client);
    this.teleport = new TeleportAPI(this.client);
    this.state = new StateAPI(this.client);
    this.serverStatus = new ServerStatusAPI(this.client);
    this.udp = new UdpAPI(this.client, this.subscriptions);
  }

  /** Closes the WebSocket and clears the in-memory auth token. */
  close(): void {
    this.subscriptions.close();
    this.authState.setToken(null);
  }
}
