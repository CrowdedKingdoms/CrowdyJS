/**
 * Main CrowdyClient class - public API for the SDK
 */

import { GraphQLClient } from './client.js';
import { SubscriptionManager } from './subscriptions.js';

import { AuthAPI } from './domains/auth.js';
import { UsersAPI } from './domains/users.js';
import { OrganizationsAPI } from './domains/organizations.js';
import { AppsAPI } from './domains/apps.js';
import { AppAccessAPI } from './domains/appAccess.js';
import { BillingAPI } from './domains/billing.js';
import { QuotasAPI } from './domains/quotas.js';
import { ChunksAPI } from './domains/chunks.js';
import { VoxelsAPI } from './domains/voxels.js';
import { ActorsAPI } from './domains/actors.js';
import { TeleportAPI } from './domains/teleport.js';
import { StateAPI } from './domains/state.js';
import { ServerStatusAPI } from './domains/serverStatus.js';

import type {
  CrowdyClientConfig,
  AuthResponse,
  UdpProxyConnectionStatus,
  ActorUpdateRequestInput,
  VoxelUpdateRequestInput,
  ClientAudioPacketInput,
  ClientTextPacketInput,
  ClientEventNotificationInput,
  ActorUpdateHandler,
  ActorUpdateResponseHandler,
  VoxelUpdateHandler,
  VoxelUpdateResponseHandler,
  ClientAudioHandler,
  ClientTextHandler,
  ClientEventHandler,
  ServerEventHandler,
  GenericErrorHandler,
  UnsubscribeFn,
} from './types.js';

export class CrowdyClient {
  private client: GraphQLClient;
  private subscriptions: SubscriptionManager;

  // Domain wrappers (typed via codegen)
  readonly auth: AuthAPI;
  readonly users: UsersAPI;
  readonly orgs: OrganizationsAPI;
  readonly apps: AppsAPI;
  readonly appAccess: AppAccessAPI;
  readonly billing: BillingAPI;
  readonly quotas: QuotasAPI;
  readonly chunks: ChunksAPI;
  readonly voxels: VoxelsAPI;
  readonly actors: ActorsAPI;
  readonly teleport: TeleportAPI;
  readonly state: StateAPI;
  readonly serverStatus: ServerStatusAPI;

  constructor(config: CrowdyClientConfig = {}) {
    this.client = new GraphQLClient({
      graphqlEndpoint: config.graphqlEndpoint,
      timeout: config.timeout,
    });

    this.subscriptions = new SubscriptionManager({
      wsEndpoint: config.wsEndpoint,
    });

    this.auth = new AuthAPI(this.client, this.subscriptions);
    this.users = new UsersAPI(this.client);
    this.orgs = new OrganizationsAPI(this.client);
    this.apps = new AppsAPI();
    this.appAccess = new AppAccessAPI(this.client);
    this.billing = new BillingAPI(this.client);
    this.quotas = new QuotasAPI(this.client);
    this.chunks = new ChunksAPI(this.client);
    this.voxels = new VoxelsAPI(this.client);
    this.actors = new ActorsAPI(this.client);
    this.teleport = new TeleportAPI(this.client);
    this.state = new StateAPI(this.client);
    this.serverStatus = new ServerStatusAPI(this.client);
  }

  // -------------------------------------------------------------------------
  // Authentication shortcuts (kept for backwards compatibility)
  // -------------------------------------------------------------------------
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.client.login(email, password);
    this.subscriptions.setAuthToken(response.token);
    return response;
  }

  async register(email: string, password: string, gamertag?: string): Promise<AuthResponse> {
    const response = await this.client.register(email, password, gamertag);
    this.subscriptions.setAuthToken(response.token);
    return response;
  }

  getAuthToken(): string | null {
    return this.client.getAuthToken();
  }

  // -------------------------------------------------------------------------
  // UDP Proxy
  // -------------------------------------------------------------------------
  async connectUdpProxy(): Promise<UdpProxyConnectionStatus> {
    return this.client.connectUdpProxy();
  }

  async disconnectUdpProxy(): Promise<boolean> {
    return this.client.disconnectUdpProxy();
  }

  async getConnectionStatus(): Promise<UdpProxyConnectionStatus> {
    return this.client.getConnectionStatus();
  }

  // -------------------------------------------------------------------------
  // Replication mutations (UDP fast path) -- unchanged
  // -------------------------------------------------------------------------
  async sendActorUpdate(input: ActorUpdateRequestInput): Promise<boolean> {
    return this.client.sendActorUpdate(input);
  }

  async sendVoxelUpdate(input: VoxelUpdateRequestInput): Promise<boolean> {
    return this.client.sendVoxelUpdate(input);
  }

  async sendAudioPacket(input: ClientAudioPacketInput): Promise<boolean> {
    return this.client.sendAudioPacket(input);
  }

  async sendTextPacket(input: ClientTextPacketInput): Promise<boolean> {
    return this.client.sendTextPacket(input);
  }

  async sendClientEvent(input: ClientEventNotificationInput): Promise<boolean> {
    return this.client.sendClientEvent(input);
  }

  // -------------------------------------------------------------------------
  // Type-specific subscription handlers -- unchanged
  // -------------------------------------------------------------------------
  onActorUpdate(handler: ActorUpdateHandler): UnsubscribeFn {
    return this.subscriptions.onActorUpdate(handler);
  }

  onActorUpdateResponse(handler: ActorUpdateResponseHandler): UnsubscribeFn {
    return this.subscriptions.onActorUpdateResponse(handler);
  }

  onVoxelUpdate(handler: VoxelUpdateHandler): UnsubscribeFn {
    return this.subscriptions.onVoxelUpdate(handler);
  }

  onVoxelUpdateResponse(handler: VoxelUpdateResponseHandler): UnsubscribeFn {
    return this.subscriptions.onVoxelUpdateResponse(handler);
  }

  onClientAudio(handler: ClientAudioHandler): UnsubscribeFn {
    return this.subscriptions.onClientAudio(handler);
  }

  onClientText(handler: ClientTextHandler): UnsubscribeFn {
    return this.subscriptions.onClientText(handler);
  }

  onClientEvent(handler: ClientEventHandler): UnsubscribeFn {
    return this.subscriptions.onClientEvent(handler);
  }

  onServerEvent(handler: ServerEventHandler): UnsubscribeFn {
    return this.subscriptions.onServerEvent(handler);
  }

  onGenericError(handler: GenericErrorHandler): UnsubscribeFn {
    return this.subscriptions.onGenericError(handler);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  close(): void {
    this.subscriptions.close();
    this.client.setAuthToken(null);
  }
}
