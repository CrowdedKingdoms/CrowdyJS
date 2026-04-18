/**
 * WebSocket subscription manager for the udpNotifications stream.
 *
 * Owns one shared `graphql-transport-ws` socket and dispatches incoming
 * `udpNotifications` payloads to per-typename handler arrays. Reads its
 * bearer token from `AuthState` so HTTP and WS auth can never drift.
 *
 * Public API is now `subscribe(handlers)` which returns an unsubscribe
 * function; the per-handler `onActorUpdate` etc. shims are gone.
 */

import { AuthState } from './auth-state.js';
import type {
  UdpNotification,
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

export interface UdpNotificationHandlers {
  onActorUpdate?: ActorUpdateHandler;
  onActorUpdateResponse?: ActorUpdateResponseHandler;
  onVoxelUpdate?: VoxelUpdateHandler;
  onVoxelUpdateResponse?: VoxelUpdateResponseHandler;
  onClientAudio?: ClientAudioHandler;
  onClientText?: ClientTextHandler;
  onClientEvent?: ClientEventHandler;
  onServerEvent?: ServerEventHandler;
  onGenericError?: GenericErrorHandler;
}

interface RegisteredSubscription {
  id: string;
  handlers: UdpNotificationHandlers;
}

export interface SubscriptionManagerConfig {
  wsEndpoint?: string;
}

export class SubscriptionManager {
  private readonly wsEndpoint: string;
  private readonly authState: AuthState;
  private wsClient: WebSocket | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private subscriptionId: string | null = null;
  private subscribers = new Map<string, RegisteredSubscription>();
  private nextSubscriberId = 1;

  constructor(config: SubscriptionManagerConfig = {}, authState: AuthState) {
    this.wsEndpoint = config.wsEndpoint || 'ws://localhost:3000/graphql';
    this.authState = authState;
  }

  /**
   * Register handlers for the udpNotifications stream. The first call opens
   * the shared socket (provided we have a token); subsequent calls reuse it.
   * The returned function detaches just this set of handlers and closes the
   * socket once the last subscriber leaves.
   */
  subscribe(handlers: UdpNotificationHandlers): UnsubscribeFn {
    const id = `s${this.nextSubscriberId++}`;
    this.subscribers.set(id, { id, handlers });
    this.ensureSubscription();
    return () => {
      this.subscribers.delete(id);
      this.checkIfShouldUnsubscribe();
    };
  }

  private ensureSubscription(): void {
    if (
      !this.wsClient ||
      (this.wsClient.readyState !== WebSocket.OPEN &&
        this.wsClient.readyState !== WebSocket.CONNECTING)
    ) {
      this.startSubscription();
    }
  }

  private startSubscription(): void {
    const token = this.authState.getToken();
    if (!token) {
      throw new Error('Must be authenticated to subscribe');
    }

    this.subscriptionId = `udp-notifications-${Date.now()}`;
    const ws = new WebSocket(this.wsEndpoint, 'graphql-transport-ws');
    this.wsClient = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'connection_init',
          payload: {
            Authorization: `Bearer ${token}`,
          },
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(
          typeof event.data === 'string' ? event.data : '',
        );

        if (message.type === 'connection_ack') {
          ws.send(
            JSON.stringify({
              id: this.subscriptionId,
              type: 'subscribe',
              payload: { query: UDP_NOTIFICATIONS_QUERY },
            }),
          );
        } else if (message.type === 'next') {
          if (message.payload?.data?.udpNotifications === null) return;
          const notification = message.payload?.data
            ?.udpNotifications as UdpNotification | undefined;
          if (notification) {
            this.dispatch(notification);
          } else if (message.payload?.errors) {
            console.error('Subscription errors:', message.payload.errors);
          }
        } else if (message.type === 'error') {
          console.error('Subscription error:', message.payload);
        } else if (message.type === 'complete') {
          if (this.wsClient === ws) this.wsClient = null;
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = (event) => {
      if (event.code !== 1000) {
        console.warn(
          `WebSocket closed unexpectedly: ${event.reason || event.code}`,
        );
      }
      if (this.wsClient === ws) this.wsClient = null;
    };

    this.wsUnsubscribe = () => {
      if (ws.readyState === WebSocket.OPEN) {
        if (this.subscriptionId) {
          ws.send(
            JSON.stringify({
              id: this.subscriptionId,
              type: 'complete',
            }),
          );
        }
        ws.close();
      }
      if (this.wsClient === ws) this.wsClient = null;
      this.wsUnsubscribe = null;
    };
  }

  private dispatch(notification: UdpNotification): void {
    const type = notification.__typename;
    if (!type) {
      console.warn('Received notification without __typename:', notification);
      return;
    }
    // Snapshot the subscribers list so handlers that mutate the registry
    // (e.g. by calling close()) don't affect this dispatch loop.
    for (const sub of [...this.subscribers.values()]) {
      try {
        switch (type) {
          case 'ActorUpdateNotification':
            sub.handlers.onActorUpdate?.(notification as any);
            break;
          case 'ActorUpdateResponse':
            sub.handlers.onActorUpdateResponse?.(notification as any);
            break;
          case 'VoxelUpdateNotification':
            sub.handlers.onVoxelUpdate?.(notification as any);
            break;
          case 'VoxelUpdateResponse':
            sub.handlers.onVoxelUpdateResponse?.(notification as any);
            break;
          case 'ClientAudioNotification':
            sub.handlers.onClientAudio?.(notification as any);
            break;
          case 'ClientTextNotification':
            sub.handlers.onClientText?.(notification as any);
            break;
          case 'ClientEventNotification':
            sub.handlers.onClientEvent?.(notification as any);
            break;
          case 'ServerEventNotification':
            sub.handlers.onServerEvent?.(notification as any);
            break;
          case 'GenericErrorResponse':
            sub.handlers.onGenericError?.(notification as any);
            break;
        }
      } catch (error) {
        console.error(`Handler for ${type} threw:`, error);
      }
    }
  }

  private checkIfShouldUnsubscribe(): void {
    if (this.subscribers.size === 0 && this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
  }

  close(): void {
    this.subscribers.clear();
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
    }
  }
}

const UDP_NOTIFICATIONS_QUERY = `subscription {
  udpNotifications {
    __typename
    ... on ActorUpdateNotification { appId chunkX chunkY chunkZ distance decayRate uuid state sequenceNumber epochMillis }
    ... on VoxelUpdateNotification { appId chunkX chunkY chunkZ distance decayRate uuid voxelX voxelY voxelZ voxelType voxelState sequenceNumber epochMillis }
    ... on GenericErrorResponse { sequenceNumber errorCode }
    ... on ActorUpdateResponse { appId chunkX chunkY chunkZ distance decayRate uuid sequenceNumber epochMillis }
    ... on VoxelUpdateResponse { appId chunkX chunkY chunkZ distance decayRate uuid sequenceNumber epochMillis }
    ... on ClientAudioNotification { appId chunkX chunkY chunkZ distance decayRate uuid audioData sequenceNumber epochMillis }
    ... on ClientTextNotification { appId chunkX chunkY chunkZ distance decayRate uuid text sequenceNumber epochMillis }
    ... on ClientEventNotification { appId chunkX chunkY chunkZ distance decayRate uuid eventType state sequenceNumber epochMillis }
    ... on ServerEventNotification { appId chunkX chunkY chunkZ distance decayRate uuid eventType state sequenceNumber epochMillis }
  }
}`;
