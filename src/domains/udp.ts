import type { GraphQLClient } from '../client.js';
import type {
  SubscriptionManager,
  UdpNotificationHandlers,
} from '../subscriptions.js';

import {
  ConnectUdpProxyDocument,
  type ConnectUdpProxyMutation,
  DisconnectUdpProxyDocument,
  UdpProxyConnectionStatusDocument,
  type UdpProxyConnectionStatusQuery,
  SendActorUpdateDocument,
  type SendActorUpdateMutationVariables,
  SendVoxelUpdateDocument,
  type SendVoxelUpdateMutationVariables,
  SendAudioPacketDocument,
  type SendAudioPacketMutationVariables,
  SendTextPacketDocument,
  type SendTextPacketMutationVariables,
  SendClientEventDocument,
  type SendClientEventMutationVariables,
} from '../generated/graphql.js';
import type { SpatialNotification } from '../realtime.js';
import { SequenceAllocator } from '../utils.js';

/**
 * UDP proxy access for browser-style clients that can't open raw UDP
 * sockets. Exposed as `client.udp`. All send mutations go over the same
 * GraphQL HTTP endpoint and are forwarded to the assigned game server by
 * the API's UDP proxy module. Notifications come back over a single shared
 * WebSocket subscription managed by `SubscriptionManager`.
 */
export class UdpAPI {
  private readonly sequences = new SequenceAllocator();

  constructor(
    private gql: GraphQLClient,
    private subs: SubscriptionManager,
  ) {}

  async connect(): Promise<ConnectUdpProxyMutation['connectUdpProxy']> {
    const data = await this.gql.request(ConnectUdpProxyDocument, undefined);
    return data.connectUdpProxy;
  }

  async disconnect(): Promise<boolean> {
    const data = await this.gql.request(DisconnectUdpProxyDocument, undefined);
    return data.disconnectUdpProxy;
  }

  async connectionStatus(): Promise<
    UdpProxyConnectionStatusQuery['udpProxyConnectionStatus']
  > {
    const data = await this.gql.request(
      UdpProxyConnectionStatusDocument,
      undefined,
    );
    return data.udpProxyConnectionStatus;
  }

  async sendActorUpdate(
    input: SendActorUpdateMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendActorUpdateDocument, { input });
    return data.sendActorUpdate;
  }

  async sendActorUpdateAndWait(
    input: SendActorUpdateMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendActorUpdate(request);
    return wait;
  }

  async sendVoxelUpdate(
    input: SendVoxelUpdateMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendVoxelUpdateDocument, { input });
    return data.sendVoxelUpdate;
  }

  async sendVoxelUpdateAndWait(
    input: SendVoxelUpdateMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendVoxelUpdate(request);
    return wait;
  }

  async sendAudioPacket(
    input: SendAudioPacketMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendAudioPacketDocument, { input });
    return data.sendAudioPacket;
  }

  async sendAudioPacketAndWait(
    input: SendAudioPacketMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendAudioPacket(request);
    return wait;
  }

  async sendTextPacket(
    input: SendTextPacketMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendTextPacketDocument, { input });
    return data.sendTextPacket;
  }

  async sendTextPacketAndWait(
    input: SendTextPacketMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendTextPacket(request);
    return wait;
  }

  async sendClientEvent(
    input: SendClientEventMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendClientEventDocument, { input });
    return data.sendClientEvent;
  }

  async sendClientEventAndWait(
    input: SendClientEventMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendClientEvent(request);
    return wait;
  }

  /**
   * Subscribe to udpNotifications. Pass any combination of typename
   * handlers; the returned function detaches all of them. The first
   * subscriber opens the shared WebSocket; the last one to leave closes
   * it.
   */
  subscribe(handlers: UdpNotificationHandlers): () => void {
    return this.subs.subscribe(handlers);
  }

  private withSequence<T extends { sequenceNumber?: number | null }>(
    input: T,
  ): T & { sequenceNumber: number } {
    return {
      ...input,
      sequenceNumber: input.sequenceNumber ?? this.sequences.next(),
    };
  }
}
