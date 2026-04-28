import type { UdpAPI } from './domains/udp.js';
import type {
  ActorUpdateRequestInput,
  ChunkCoordinatesInput,
  ClientEventNotificationInput,
  ClientTextPacketInput,
  Scalars,
  VoxelUpdateRequestInput,
} from './generated/graphql.js';
import type { SpatialNotification, UdpNotificationHandlers } from './realtime.js';
import { generateCrowdyUuid, validateChunkCoordinates, validateCrowdyUuid } from './utils.js';

export interface ActorOptions {
  uuid?: string;
  defaultDistance?: number;
  defaultDecayRate?: number;
}

export class WorldClient {
  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly udp: UdpAPI,
  ) {}

  actor(options: ActorOptions = {}): ActorClient {
    return new ActorClient(this.appId, this.udp, {
      uuid: options.uuid ?? generateCrowdyUuid(),
      defaultDistance: options.defaultDistance,
      defaultDecayRate: options.defaultDecayRate,
    });
  }

  subscribe(handlers: UdpNotificationHandlers): () => void {
    return this.udp.subscribe(handlers);
  }
}

export class ActorClient {
  readonly uuid: string;
  private chunk: ChunkCoordinatesInput | null = null;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly udp: UdpAPI,
    private readonly options: Required<Pick<ActorOptions, 'uuid'>> &
      Pick<ActorOptions, 'defaultDistance' | 'defaultDecayRate'>,
  ) {
    validateCrowdyUuid(options.uuid);
    this.uuid = options.uuid;
  }

  async join(
    chunk: ChunkCoordinatesInput,
    state = 'AA==',
  ): Promise<SpatialNotification> {
    this.chunk = chunk;
    return this.sendState(state, { chunk });
  }

  async sendState(
    state: string,
    options: Partial<Pick<ActorUpdateRequestInput, 'chunk' | 'distance' | 'decayRate'>> = {},
  ): Promise<SpatialNotification> {
    const chunk = options.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending state');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendActorUpdateAndWait({
      appId: this.appId,
      chunk,
      uuid: this.uuid,
      state,
      distance: options.distance ?? this.options.defaultDistance,
      decayRate: options.decayRate ?? this.options.defaultDecayRate,
    });
  }

  async sendVoxelUpdate(
    input: Omit<VoxelUpdateRequestInput, 'appId' | 'uuid' | 'chunk'> & {
      chunk?: ChunkCoordinatesInput;
    },
  ): Promise<SpatialNotification> {
    const chunk = input.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending voxel updates');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendVoxelUpdateAndWait({
      ...input,
      appId: this.appId,
      chunk,
      uuid: this.uuid,
    });
  }

  async sendText(
    text: string,
    input: Partial<Omit<ClientTextPacketInput, 'appId' | 'uuid' | 'text' | 'chunk'>> & {
      chunk?: ChunkCoordinatesInput;
    } = {},
  ): Promise<SpatialNotification> {
    const chunk = input.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending text');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendTextPacketAndWait({
      ...input,
      appId: this.appId,
      chunk,
      uuid: this.uuid,
      text,
    });
  }

  async sendEvent(
    eventType: number,
    state: string,
    input: Partial<Omit<ClientEventNotificationInput, 'appId' | 'uuid' | 'eventType' | 'state' | 'chunk'>> & {
      chunk?: ChunkCoordinatesInput;
    } = {},
  ): Promise<SpatialNotification> {
    const chunk = input.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending events');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendClientEventAndWait({
      ...input,
      appId: this.appId,
      chunk,
      uuid: this.uuid,
      eventType,
      state,
    });
  }
}
