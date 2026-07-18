/**
 * World Stores — opt-in, SDK-managed game state for CrowdyJS
 * (`@crowdedkingdoms/crowdyjs/stores`).
 *
 * The core client is a thin transport; this layer adds the source-of-truth
 * data structures every game otherwise hand-writes: typed codecs, actor
 * registries, chunk/voxel caches, error attribution, message inboxes, host
 * tracking, and durable-state wrappers. Import only what you use — the core
 * bundle never includes this module, and unused stores tree-shake away
 * (`"sideEffects": false`).
 *
 * Entry point: {@link createWorldSession}.
 */

export {
  bool8,
  bytes,
  f32,
  f64,
  i8,
  i16,
  i32,
  jsonCodec,
  rawCodec,
  reserved,
  structCodec,
  textCodec,
  u8,
  u16,
  u32,
  type StateCodec,
  type StructCodec,
  type StructField,
  type StructSpec,
  type StructValue,
} from './codec.js';
export {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  chunkDistance,
  chunkKey,
  chunksAround,
  fromChunkInput,
  parseChunkKey,
  toChunkInput,
  voxelCoordFromIndex,
  voxelIndex,
  worldToChunk,
  worldToLocalVoxel,
  type ChunkCoord,
} from './keys.js';
export {
  intervalTicker,
  manualTicker,
  workerTicker,
  type ManualTicker,
  type Ticker,
} from './ticker.js';
export {
  WorldSessionCore,
  type BusKey,
  type SentPacketKind,
  type SentPacketRecord,
  type WorldSessionBaseConfig,
  type WorldSessionContext,
  type WorldStoresClient,
} from './session.js';
export {
  LocalActorStore,
  RemoteActorLane,
  RemoteActorStore,
  attachLocalActor,
  attachRemoteActors,
  localStorageUuidStore,
  memoryUuidStore,
  type AckedActorUpdate,
  type ActorSendError,
  type ActorUpdateEcho,
  type GenericErrorEcho,
  type LocalActorConfig,
  type LocalActorStatus,
  type RemoteActor,
  type RemoteActorSample,
  type RemoteActorsConfig,
  type SendReason,
  type SentActorUpdate,
  type UuidStore,
} from './actors.js';

import {
  LocalActorStore,
  RemoteActorStore,
  type LocalActorConfig,
  type RemoteActorsConfig,
} from './actors.js';
import {
  WorldSessionCore,
  type WorldSessionBaseConfig,
  type WorldStoresClient,
} from './session.js';

/**
 * Configuration for {@link createWorldSession}. Only configured stores are
 * constructed (and only they appear on the returned session's type).
 */
export interface WorldSessionConfig<TSelf = unknown, TActors = TSelf>
  extends WorldSessionBaseConfig {
  /** Your own actor: identity, typed state, send loop ({@link LocalActorStore}). */
  self?: LocalActorConfig<TSelf>;
  /**
   * Remote actors: typed registry with lanes, history, staleness
   * ({@link RemoteActorStore}). The self-echo filter is wired from `self`
   * automatically; set `selfUuid` yourself otherwise.
   */
  actors?: RemoteActorsConfig<TActors>;
}

/** The session returned by {@link createWorldSession}. */
export interface WorldSession<TSelf = unknown, TActors = TSelf> {
  /** The app this session is scoped to. */
  readonly appId: string;
  /** The local actor store (present when `config.self` was given). */
  readonly self?: LocalActorStore<TSelf>;
  /** The remote actor registry (present when `config.actors` was given). */
  readonly actors?: RemoteActorStore<TActors>;
  /** Close the shared subscription, cancel timers, and release the stores. */
  dispose(): void;
  /** The wiring context (for custom store implementations). */
  readonly context: WorldSessionCore;
}

/**
 * Create a **world session**: one shared `udpNotifications` subscription
 * fanned out to the stores you configure, one shared {@link Ticker}, and a
 * single `dispose()`. Pass your `CrowdyClient` (it satisfies
 * {@link WorldStoresClient} structurally) and the app id.
 *
 * ```ts
 * import { createWorldSession, structCodec, f32, u8, workerTicker } from '@crowdedkingdoms/crowdyjs/stores';
 *
 * const poseCodec = structCodec({ x: f32(), y: f32(), z: f32(), flags: u8() });
 * const session = createWorldSession(client, appId, {
 *   ticker: workerTicker(), // hold 5 Hz in backgrounded tabs
 *   self: { codec: poseCodec, initialState: { x: 0, y: 0, z: 0, flags: 0 } },
 * });
 * await session.self.join({ x: '0', y: '0', z: '0' });
 * session.self.patchState({ x: 12.5 }); // next tick replicates it
 * session.dispose();
 * ```
 */
export function createWorldSession<TSelf = unknown, TActors = TSelf>(
  client: WorldStoresClient,
  appId: string,
  config: WorldSessionConfig<TSelf, TActors> = {},
): WorldSession<TSelf, TActors> {
  const core = new WorldSessionCore(client, appId, config.ticker);
  const self = config.self ? new LocalActorStore(core, config.self) : undefined;
  const actors = config.actors
    ? new RemoteActorStore(core, {
        // Filter the local echo automatically when a self store exists.
        selfUuid: self ? () => self.uuid : undefined,
        ...config.actors,
      })
    : undefined;
  return {
    appId,
    context: core,
    ...(self ? { self } : {}),
    ...(actors ? { actors } : {}),
    dispose: () => core.dispose(),
  };
}
