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

    this.wsClient = new WebSocket(wsUrl, 'graphql-ws');

    this.wsClient.onopen = () => {
      // Send connection_init message with authorization
      this.wsClient!.send(
        JSON.stringify({
          type: 'connection_init',
          payload: {
            authorization: `Bearer ${this.token}`,
            Authorization: `Bearer ${this.token}`, // Some servers expect capitalized
          },
        })
      );
    };

    this.wsClient.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'connection_ack') {
          // Subscribe to udpNotifications
          const startMessage = {
            id: this.subscriptionId,
            type: 'start',
            payload: {
              query: `subscription {
                udpNotifications {
                  __typename
                  ... on ActorUpdateNotification {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    state
                  }
                  ... on ActorUpdateResponse {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    sequenceNumber
                  }
                  ... on VoxelUpdateNotification {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    voxelX
                    voxelY
                    voxelZ
                    voxelType
                    voxelState
                  }
                  ... on VoxelUpdateResponse {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    sequenceNumber
                  }
                  ... on ClientAudioNotification {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    audioData
                  }
                  ... on ClientTextNotification {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    text
                  }
                  ... on ClientEventNotification {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    eventType
                    state
                  }
                  ... on ServerEventNotification {
                    mapId
                    chunkX
                    chunkY
                    chunkZ
                    uuid
                    eventType
                    state
                  }
                  ... on GenericErrorResponse {
                    sequenceNumber
                    errorCode
                  }
                }
              }`,
            },
          };
          this.wsClient!.send(JSON.stringify(startMessage));
        } else if (message.type === 'connection_error') {
          console.error('Connection error:', message.payload);
          const errorMsg =
            message.payload?.message || 'Connection rejected - check authorization token';
          // Notify all handlers of error? Or just log?
          console.error('WebSocket connection error:', errorMsg);
        } else if (message.type === 'data') {
          // Handle null values (subscription is active but no notification yet)
          if (message.payload?.data?.udpNotifications === null) {
            // Don't call handlers for null values - subscription is working, just no data yet
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
          console.error('WebSocket error message:', message.payload);
          const errorMsg = message.payload?.message
            ? Array.isArray(message.payload.message)
              ? message.payload.message.join(', ')
              : String(message.payload.message)
            : 'WebSocket error';
          console.error('WebSocket error:', errorMsg);
        } else if (message.type === 'ping') {
          // Respond to ping with pong (graphql-ws protocol keepalive)
          this.wsClient!.send(
            JSON.stringify({
              type: 'pong',
            })
          );
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.wsClient.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.wsClient.onclose = (event) => {
      if (event.code !== 1000) {
        console.warn(`WebSocket closed unexpectedly: ${event.reason || event.code}`);
      }
      this.wsClient = null;
    };

    // Store unsubscribe function
    this.wsUnsubscribe = () => {
      if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
        // Send stop message before closing
        if (this.subscriptionId) {
          this.wsClient.send(
            JSON.stringify({
              id: this.subscriptionId,
              type: 'stop',
            })
          );
        }
        this.wsClient.close();
      }
      this.wsClient = null;
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

