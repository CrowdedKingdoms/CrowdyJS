import { print } from 'graphql';
import { createClient, type Client } from 'graphql-ws';
import type { SessionStore } from './session.js';
import type { CrowdyLogger } from './logger.js';
import { silentLogger } from './logger.js';
import { CrowdyRealtimeError } from './errors.js';
import {
  UdpNotificationsDocument,
  type UdpNotificationsSubscription,
} from './generated/graphql.js';

export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export type UdpNotification = NonNullable<
  UdpNotificationsSubscription['udpNotifications']
>;

export type SpatialNotification = Extract<
  UdpNotification,
  { sequenceNumber: number }
>;

export interface UdpNotificationHandlers {
  actorUpdate?: (notification: Extract<UdpNotification, { __typename?: 'ActorUpdateNotification' }>) => void;
  actorUpdateResponse?: (notification: Extract<UdpNotification, { __typename?: 'ActorUpdateResponse' }>) => void;
  voxelUpdate?: (notification: Extract<UdpNotification, { __typename?: 'VoxelUpdateNotification' }>) => void;
  voxelUpdateResponse?: (notification: Extract<UdpNotification, { __typename?: 'VoxelUpdateResponse' }>) => void;
  audio?: (notification: Extract<UdpNotification, { __typename?: 'ClientAudioNotification' }>) => void;
  text?: (notification: Extract<UdpNotification, { __typename?: 'ClientTextNotification' }>) => void;
  clientEvent?: (notification: Extract<UdpNotification, { __typename?: 'ClientEventNotification' }>) => void;
  serverEvent?: (notification: Extract<UdpNotification, { __typename?: 'ServerEventNotification' }>) => void;
  genericError?: (notification: Extract<UdpNotification, { __typename?: 'GenericErrorResponse' }>) => void;
  connectionEvent?: (notification: Extract<UdpNotification, { __typename?: 'RealtimeConnectionEvent' }>) => void;
  error?: (error: CrowdyRealtimeError) => void;
  any?: (notification: UdpNotification) => void;
}

export interface RealtimeConfig {
  wsUrl?: string;
  wsEndpoint?: string;
  retryAttempts?: number;
  retryInitialDelayMs?: number;
  retryMaxDelayMs?: number;
  waitTimeoutMs?: number;
  logger?: CrowdyLogger;
}

interface PendingWait {
  resolve(notification: SpatialNotification): void;
  reject(error: CrowdyRealtimeError): void;
  timer: ReturnType<typeof setTimeout>;
}

export class RealtimeClient {
  private readonly wsUrl: string;
  private readonly logger: CrowdyLogger;
  private readonly retryAttempts: number;
  private readonly retryInitialDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly waitTimeoutMs: number;
  private client: Client | null = null;
  private release: (() => void) | null = null;
  private desired = false;
  private statusValue: RealtimeStatus = 'idle';
  private readonly statusListeners = new Set<(status: RealtimeStatus) => void>();
  private readonly subscribers = new Map<string, UdpNotificationHandlers>();
  private readonly pending = new Map<number, PendingWait[]>();
  private nextSubscriberId = 1;

  constructor(
    config: RealtimeConfig = {},
    private readonly session: SessionStore,
  ) {
    this.wsUrl = config.wsUrl || config.wsEndpoint || 'ws://localhost:3000/graphql';
    this.logger = config.logger ?? silentLogger;
    this.retryAttempts = config.retryAttempts ?? 8;
    this.retryInitialDelayMs = config.retryInitialDelayMs ?? 250;
    this.retryMaxDelayMs = config.retryMaxDelayMs ?? 5000;
    this.waitTimeoutMs = config.waitTimeoutMs ?? 5000;

    this.session.onChange((token) => {
      if (!this.desired) return;
      if (!token) {
        this.disconnect();
        this.dispatchError(
          new CrowdyRealtimeError('Realtime disconnected because the session token was cleared', {
            code: 'AUTH_CLEARED',
            retryable: false,
          }),
        );
        return;
      }
      this.restart();
    });
  }

  status(): RealtimeStatus {
    return this.statusValue;
  }

  onStatus(listener: (status: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statusValue);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  connect(): void {
    this.desired = true;
    this.ensureSubscription();
  }

  disconnect(): void {
    this.desired = false;
    this.release?.();
    this.release = null;
    this.client?.dispose();
    this.client = null;
    this.setStatus('disconnected');
  }

  close(): void {
    this.disconnect();
    this.subscribers.clear();
    this.rejectAllPending(new CrowdyRealtimeError('Realtime client closed', { retryable: false }));
  }

  subscribe(handlers: UdpNotificationHandlers): () => void {
    const id = `s${this.nextSubscriberId++}`;
    this.subscribers.set(id, handlers);
    this.connect();
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0 && this.desired) {
        this.disconnect();
      }
    };
  }

  waitForSequence(
    sequenceNumber: number,
    timeoutMs = this.waitTimeoutMs,
  ): Promise<SpatialNotification> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removePending(sequenceNumber, wait);
        reject(
          new CrowdyRealtimeError(
            `Timed out waiting for UDP response sequence ${sequenceNumber}`,
            { code: 'UDP_SEQUENCE_TIMEOUT', retryable: true },
          ),
        );
      }, timeoutMs);
      const wait: PendingWait = { resolve, reject, timer };
      const waits = this.pending.get(sequenceNumber) ?? [];
      waits.push(wait);
      this.pending.set(sequenceNumber, waits);
    });
  }

  private ensureSubscription(): void {
    if (this.release) return;

    const token = this.session.getToken();
    if (!token) {
      const error = new CrowdyRealtimeError('Must be authenticated to subscribe', {
        code: 'AUTH_REQUIRED',
        retryable: false,
      });
      this.setStatus('failed');
      this.dispatchError(error);
      throw error;
    }

    this.setStatus('connecting');
    this.client = createClient({
      url: this.wsUrl,
      lazy: true,
      retryAttempts: this.retryAttempts,
      connectionParams: () => {
        const currentToken = this.session.getToken();
        return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
      },
      retryWait: async (retries) => {
        this.setStatus('reconnecting');
        const delay = Math.min(
          this.retryMaxDelayMs,
          this.retryInitialDelayMs * 2 ** retries,
        );
        const jitter = Math.floor(Math.random() * this.retryInitialDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      },
      on: {
        connected: () => this.setStatus('connected'),
        closed: () => {
          if (this.desired) {
            this.setStatus('reconnecting');
          } else {
            this.setStatus('disconnected');
          }
        },
        error: (error) => {
          this.logger.error?.('Realtime WebSocket error', error);
          this.dispatchError(
            new CrowdyRealtimeError('Realtime WebSocket error', {
              code: 'WEBSOCKET_ERROR',
              retryable: true,
              cause: error,
            }),
          );
        },
      },
    });

    this.release = this.client.subscribe(
      { query: print(UdpNotificationsDocument) },
      {
        next: (message) => {
          const data = message.data as UdpNotificationsSubscription | undefined;
          const notification = data?.udpNotifications;
          if (notification) this.dispatch(notification);
          if (message.errors?.length) {
            this.dispatchError(
              new CrowdyRealtimeError(message.errors[0]?.message ?? 'Subscription error', {
                code: 'SUBSCRIPTION_ERROR',
                retryable: true,
                cause: message.errors,
              }),
            );
          }
        },
        error: (error) => {
          this.setStatus('failed');
          this.dispatchError(
            new CrowdyRealtimeError('Realtime subscription failed', {
              code: 'SUBSCRIPTION_FAILED',
              retryable: true,
              cause: error,
            }),
          );
        },
        complete: () => {
          this.release = null;
          if (this.desired) {
            this.setStatus('reconnecting');
            this.ensureSubscription();
          }
        },
      },
    );
  }

  private restart(): void {
    this.release?.();
    this.release = null;
    this.client?.dispose();
    this.client = null;
    this.ensureSubscription();
  }

  private dispatch(notification: UdpNotification): void {
    this.resolvePending(notification);

    for (const handlers of [...this.subscribers.values()]) {
      try {
        handlers.any?.(notification);
        switch (notification.__typename) {
          case 'ActorUpdateNotification':
            handlers.actorUpdate?.(notification);
            break;
          case 'ActorUpdateResponse':
            handlers.actorUpdateResponse?.(notification);
            break;
          case 'VoxelUpdateNotification':
            handlers.voxelUpdate?.(notification);
            break;
          case 'VoxelUpdateResponse':
            handlers.voxelUpdateResponse?.(notification);
            break;
          case 'ClientAudioNotification':
            handlers.audio?.(notification);
            break;
          case 'ClientTextNotification':
            handlers.text?.(notification);
            break;
          case 'ClientEventNotification':
            handlers.clientEvent?.(notification);
            break;
          case 'ServerEventNotification':
            handlers.serverEvent?.(notification);
            break;
          case 'GenericErrorResponse':
            handlers.genericError?.(notification);
            break;
          case 'RealtimeConnectionEvent':
            handlers.connectionEvent?.(notification);
            break;
        }
      } catch (error) {
        this.logger.error?.('Realtime notification handler threw', error);
      }
    }
  }

  private resolvePending(notification: UdpNotification): void {
    if (!('sequenceNumber' in notification)) return;
    const waits = this.pending.get(notification.sequenceNumber);
    if (!waits?.length) return;
    this.pending.delete(notification.sequenceNumber);

    for (const wait of waits) {
      clearTimeout(wait.timer);
      if (notification.__typename === 'GenericErrorResponse') {
        wait.reject(
          new CrowdyRealtimeError(`UDP request failed: ${notification.errorCode}`, {
            code: notification.errorCode,
            retryable: false,
          }),
        );
      } else {
        wait.resolve(notification);
      }
    }
  }

  private removePending(sequenceNumber: number, wait: PendingWait): void {
    const waits = this.pending.get(sequenceNumber);
    if (!waits) return;
    const next = waits.filter((candidate) => candidate !== wait);
    if (next.length) {
      this.pending.set(sequenceNumber, next);
    } else {
      this.pending.delete(sequenceNumber);
    }
  }

  private rejectAllPending(error: CrowdyRealtimeError): void {
    for (const waits of this.pending.values()) {
      for (const wait of waits) {
        clearTimeout(wait.timer);
        wait.reject(error);
      }
    }
    this.pending.clear();
  }

  private dispatchError(error: CrowdyRealtimeError): void {
    for (const handlers of [...this.subscribers.values()]) {
      handlers.error?.(error);
    }
  }

  private setStatus(status: RealtimeStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    for (const listener of [...this.statusListeners]) {
      listener(status);
    }
  }
}
