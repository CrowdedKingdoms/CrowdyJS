/**
 * WebSocket subscription manager with type-specific handlers
 */

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

type HandlerMap = {
  ActorUpdateNotification: ActorUpdateHandler[];
  ActorUpdateResponse: ActorUpdateResponseHandler[];
  VoxelUpdateNotification: VoxelUpdateHandler[];
  VoxelUpdateResponse: VoxelUpdateResponseHandler[];
  ClientAudioNotification: ClientAudioHandler[];
  ClientTextNotification: ClientTextHandler[];
  ClientEventNotification: ClientEventHandler[];
  ServerEventNotification: ServerEventHandler[];
  GenericErrorResponse: GenericErrorHandler[];
};

export class SubscriptionManager {
  private handlers: HandlerMap = {
    ActorUpdateNotification: [],
    ActorUpdateResponse: [],
    VoxelUpdateNotification: [],
    VoxelUpdateResponse: [],
    ClientAudioNotification: [],
    ClientTextNotification: [],
    ClientEventNotification: [],
    ServerEventNotification: [],
    GenericErrorResponse: [],
  };

  private wsClient: WebSocket | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private subscriptionId: string | null = null;
  private wsEndpoint: string;
  private token: string | null = null;

  constructor(config: { wsEndpoint?: string } = {}) {
    this.wsEndpoint = config.wsEndpoint || 'ws://localhost:3000/graphql';
  }

  setAuthToken(token: string | null): void {
    this.token = token;
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
    if (!this.token) {
      throw new Error('Must be authenticated to subscribe');
    }

    if (
      this.wsClient &&
      (this.wsClient.readyState === WebSocket.OPEN ||
        this.wsClient.readyState === WebSocket.CONNECTING)
    ) {
      return; // Already connected or connecting
    }

    const wsUrl = this.wsEndpoint;
    this.subscriptionId = 'udp-notifications-' + Date.now();

    const ws = new WebSocket(wsUrl, 'graphql-transport-ws');
    this.wsClient = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'connection_init',
          payload: {
            Authorization: `Bearer ${this.token}`,
          },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(typeof event.data === 'string' ? event.data : '');

        if (message.type === 'connection_ack') {
          const subscribeMessage = {
            id: this.subscriptionId,
            type: 'subscribe',
            payload: {
              query: `subscription {
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
              }`,
            },
          };
          ws.send(JSON.stringify(subscribeMessage));
        } else if (message.type === 'next') {
          if (message.payload?.data?.udpNotifications === null) {
            return;
          }

          if (message.payload?.data?.udpNotifications) {
            const notification = message.payload.data.udpNotifications as UdpNotification;
            this.handleNotification(notification);
          } else if (message.payload?.errors) {
            console.error('Subscription errors:', message.payload.errors);
            const firstError = message.payload.errors[0];
            const errorMsg = firstError?.message
              ? Array.isArray(firstError.message)
                ? firstError.message.join(', ')
                : String(firstError.message)
              : firstError?.extensions?.message || 'Unknown subscription error';
            console.error('Subscription error:', errorMsg);
          }
        } else if (message.type === 'error') {
          console.error('Subscription error:', message.payload);
        } else if (message.type === 'complete') {
          // Server ended the subscription
          if (this.wsClient === ws) {
            this.wsClient = null;
          }
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
        console.warn(`WebSocket closed unexpectedly: ${event.reason || event.code}`);
      }
      if (this.wsClient === ws) {
        this.wsClient = null;
      }
    };

    this.wsUnsubscribe = () => {
      if (ws.readyState === WebSocket.OPEN) {
        if (this.subscriptionId) {
          ws.send(
            JSON.stringify({
              id: this.subscriptionId,
              type: 'complete',
            })
          );
        }
        ws.close();
      }
      if (this.wsClient === ws) {
        this.wsClient = null;
      }
      this.wsUnsubscribe = null;
    };
  }

  private handleNotification(notification: UdpNotification): void {
    const type = notification.__typename;
    if (!type) {
      console.warn('Received notification without __typename:', notification);
      return;
    }

    const handlers = this.handlers[type as keyof HandlerMap];
    if (handlers && handlers.length > 0) {
      handlers.forEach((handler) => {
        try {
          handler(notification as any);
        } catch (error) {
          console.error(`Error in handler for ${type}:`, error);
        }
      });
    }
  }

  onActorUpdate(handler: ActorUpdateHandler): UnsubscribeFn {
    this.handlers.ActorUpdateNotification.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.ActorUpdateNotification.indexOf(handler);
      if (index > -1) {
        this.handlers.ActorUpdateNotification.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onActorUpdateResponse(handler: ActorUpdateResponseHandler): UnsubscribeFn {
    this.handlers.ActorUpdateResponse.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.ActorUpdateResponse.indexOf(handler);
      if (index > -1) {
        this.handlers.ActorUpdateResponse.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onVoxelUpdate(handler: VoxelUpdateHandler): UnsubscribeFn {
    this.handlers.VoxelUpdateNotification.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.VoxelUpdateNotification.indexOf(handler);
      if (index > -1) {
        this.handlers.VoxelUpdateNotification.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onVoxelUpdateResponse(handler: VoxelUpdateResponseHandler): UnsubscribeFn {
    this.handlers.VoxelUpdateResponse.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.VoxelUpdateResponse.indexOf(handler);
      if (index > -1) {
        this.handlers.VoxelUpdateResponse.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onClientAudio(handler: ClientAudioHandler): UnsubscribeFn {
    this.handlers.ClientAudioNotification.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.ClientAudioNotification.indexOf(handler);
      if (index > -1) {
        this.handlers.ClientAudioNotification.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onClientText(handler: ClientTextHandler): UnsubscribeFn {
    this.handlers.ClientTextNotification.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.ClientTextNotification.indexOf(handler);
      if (index > -1) {
        this.handlers.ClientTextNotification.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onClientEvent(handler: ClientEventHandler): UnsubscribeFn {
    this.handlers.ClientEventNotification.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.ClientEventNotification.indexOf(handler);
      if (index > -1) {
        this.handlers.ClientEventNotification.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onServerEvent(handler: ServerEventHandler): UnsubscribeFn {
    this.handlers.ServerEventNotification.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.ServerEventNotification.indexOf(handler);
      if (index > -1) {
        this.handlers.ServerEventNotification.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  onGenericError(handler: GenericErrorHandler): UnsubscribeFn {
    this.handlers.GenericErrorResponse.push(handler);
    this.ensureSubscription();
    return () => {
      const index = this.handlers.GenericErrorResponse.indexOf(handler);
      if (index > -1) {
        this.handlers.GenericErrorResponse.splice(index, 1);
      }
      this.checkIfShouldUnsubscribe();
    };
  }

  private checkIfShouldUnsubscribe(): void {
    // Check if any handlers are still registered
    const hasHandlers = Object.values(this.handlers).some((handlers) => handlers.length > 0);
    if (!hasHandlers && this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
  }

  close(): void {
    // Clear all handlers
    Object.keys(this.handlers).forEach((key) => {
      this.handlers[key as keyof HandlerMap] = [];
    });

    // Close WebSocket if open
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
    }
  }
}

