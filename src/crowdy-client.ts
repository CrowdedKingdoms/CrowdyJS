/**
 * Main CrowdyClient class - public API for the SDK
 */

import { GraphQLClient } from './client.js';
import { SubscriptionManager } from './subscriptions.js';
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
  UnsubscribeFn,
} from './types.js';

export class CrowdyClient {
  private client: GraphQLClient;
  private subscriptions: SubscriptionManager;

  constructor(config: CrowdyClientConfig = {}) {
    this.client = new GraphQLClient({
      graphqlEndpoint: config.graphqlEndpoint,
      timeout: config.timeout,
    });

    this.subscriptions = new SubscriptionManager({
      wsEndpoint: config.wsEndpoint,
    });
  }

  // Authentication
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

  // UDP Proxy
  async connectUdpProxy(): Promise<UdpProxyConnectionStatus> {
    return this.client.connectUdpProxy();
  }

  async disconnectUdpProxy(): Promise<boolean> {
    return this.client.disconnectUdpProxy();
  }

  async getConnectionStatus(): Promise<UdpProxyConnectionStatus> {
    return this.client.getConnectionStatus();
  }

  // Actor Updates
  async sendActorUpdate(input: ActorUpdateRequestInput): Promise<boolean> {
    return this.client.sendActorUpdate(input);
  }

  // Voxel Updates
  async sendVoxelUpdate(input: VoxelUpdateRequestInput): Promise<boolean> {
    return this.client.sendVoxelUpdate(input);
  }

  // Client Packets
  async sendAudioPacket(input: ClientAudioPacketInput): Promise<boolean> {
    return this.client.sendAudioPacket(input);
  }

  async sendTextPacket(input: ClientTextPacketInput): Promise<boolean> {
    return this.client.sendTextPacket(input);
  }

  async sendClientEvent(input: ClientEventNotificationInput): Promise<boolean> {
    return this.client.sendClientEvent(input);
  }

  // Type-specific subscription handlers
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

  // Cleanup
  close(): void {
    this.subscriptions.close();
    this.client.setAuthToken(null);
  }
}

