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

export {
  ErrorStore,
  attachErrorStore,
  type AttributedError,
  type ErrorStoreConfig,
} from './errors.js';
export {
  ChunkStore,
  attachChunkStore,
  type CachedChunk,
  type ChunkLoadState,
  type ChunkStoreConfig,
  type SetVoxelInput,
} from './chunks.js';
export {
  ActorInbox,
  ChannelInbox,
  EventRouter,
  attachActorInbox,
  attachChannelInbox,
  attachEventRouter,
  type ActorInboxConfig,
  type ChannelInboxConfig,
  type EventRouterConfig,
  type InboxMessage,
  type TypedEvent,
} from './inbox.js';
export {
  AvatarStateStore,
  HostTracker,
  SaveStateStore,
  attachAvatarState,
  attachHostTracker,
  attachSaveState,
  type AvatarStateConfig,
  type HostTrackerConfig,
  type SaveStateConfig,
} from './durable.js';

import {
  LocalActorStore,
  RemoteActorStore,
  type LocalActorConfig,
  type RemoteActorsConfig,
} from './actors.js';
import { ChunkStore, type ChunkStoreConfig } from './chunks.js';
import {
  AvatarStateStore,
  HostTracker,
  SaveStateStore,
  type AvatarStateConfig,
  type HostTrackerConfig,
  type SaveStateConfig,
} from './durable.js';
import { ErrorStore, type ErrorStoreConfig } from './errors.js';
import {
  ActorInbox,
  ChannelInbox,
  EventRouter,
  type ActorInboxConfig,
  type ChannelInboxConfig,
  type EventRouterConfig,
} from './inbox.js';
import {
  WorldSessionCore,
  type WorldSessionBaseConfig,
  type WorldStoresClient,
} from './session.js';

/**
 * Configuration for {@link createWorldSession}. Only configured stores are
 * constructed (and only they appear on the returned session's type).
 */
export interface WorldSessionConfig<
  TSelf = unknown,
  TActors = TSelf,
  TVoxelState = string,
  TChunkState = string,
  TChannel = string,
  TDirect = string,
  TSave = unknown,
  TAvatarPublic = unknown,
  TAvatarPrivate = unknown,
  TAvatarApp = unknown,
> extends WorldSessionBaseConfig {
  /** Your own actor: identity, typed state, send loop ({@link LocalActorStore}). */
  self?: LocalActorConfig<TSelf>;
  /**
   * Remote actors: typed registry with lanes, history, staleness
   * ({@link RemoteActorStore}). The self-echo filter is wired from `self`
   * automatically; set `selfUuid` yourself otherwise.
   */
  actors?: RemoteActorsConfig<TActors>;
  /**
   * Send-error log: attributes `GenericErrorResponse`s to the sends that
   * caused them ({@link ErrorStore}). Pass `true` for the defaults.
   */
  errors?: ErrorStoreConfig | true;
  /**
   * Chunk/voxel cache: bulk loading, typed states, realtime merge,
   * optimistic edits, worldgen write-back ({@link ChunkStore}). Pass `true`
   * for the defaults. The outbound sender uuid is wired from `self`
   * automatically.
   */
  chunks?: ChunkStoreConfig<TVoxelState, TChunkState> | true;
  /**
   * Channel message inbox: per-channel typed history + send
   * ({@link ChannelInbox}). Pass `true` for text-payload defaults.
   */
  channelInbox?: ChannelInboxConfig<TChannel> | true;
  /**
   * Direct actor-to-actor message inbox ({@link ActorInbox}). Pass `true`
   * for text-payload defaults.
   */
  actorInbox?: ActorInboxConfig<TDirect> | true;
  /**
   * App-defined event router: per-eventType codecs + handlers, lastEvent
   * cache ({@link EventRouter}). Pass `true` for the defaults.
   */
  events?: EventRouterConfig | true;
  /**
   * Host election tracking: heartbeat loop + isHost/onHostChanged
   * ({@link HostTracker}). Pass `true` for the defaults.
   */
  host?: HostTrackerConfig | true;
  /**
   * Typed per-user app save blob with optional debounced autosave
   * ({@link SaveStateStore}). Pass `true` for JSON defaults.
   */
  save?: SaveStateConfig<TSave> | true;
  /**
   * Typed avatar public/private/app state ({@link AvatarStateStore}). Pass
   * `true` for JSON defaults.
   */
  avatar?: AvatarStateConfig<TAvatarPublic, TAvatarPrivate, TAvatarApp> | true;
}

/** The session returned by {@link createWorldSession}. */
export interface WorldSession<
  TSelf = unknown,
  TActors = TSelf,
  TVoxelState = string,
  TChunkState = string,
  TChannel = string,
  TDirect = string,
  TSave = unknown,
  TAvatarPublic = unknown,
  TAvatarPrivate = unknown,
  TAvatarApp = unknown,
> {
  /** The app this session is scoped to. */
  readonly appId: string;
  /** The local actor store (present when `config.self` was given). */
  readonly self?: LocalActorStore<TSelf>;
  /** The remote actor registry (present when `config.actors` was given). */
  readonly actors?: RemoteActorStore<TActors>;
  /** The attributed send-error log (present when `config.errors` was given). */
  readonly errors?: ErrorStore;
  /** The chunk/voxel cache (present when `config.chunks` was given). */
  readonly chunks?: ChunkStore<TVoxelState, TChunkState>;
  /** The channel message inbox (present when `config.channelInbox` was given). */
  readonly channelInbox?: ChannelInbox<TChannel>;
  /** The direct-message inbox (present when `config.actorInbox` was given). */
  readonly actorInbox?: ActorInbox<TDirect>;
  /** The typed event router (present when `config.events` was given). */
  readonly events?: EventRouter;
  /** The host election tracker (present when `config.host` was given). */
  readonly host?: HostTracker;
  /** The typed save-state store (present when `config.save` was given). */
  readonly save?: SaveStateStore<TSave>;
  /** The typed avatar-state store (present when `config.avatar` was given). */
  readonly avatar?: AvatarStateStore<TAvatarPublic, TAvatarPrivate, TAvatarApp>;
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
export function createWorldSession<
  TSelf = unknown,
  TActors = TSelf,
  TVoxelState = string,
  TChunkState = string,
  TChannel = string,
  TDirect = string,
  TSave = unknown,
  TAvatarPublic = unknown,
  TAvatarPrivate = unknown,
  TAvatarApp = unknown,
>(
  client: WorldStoresClient,
  appId: string,
  config: WorldSessionConfig<
    TSelf,
    TActors,
    TVoxelState,
    TChunkState,
    TChannel,
    TDirect,
    TSave,
    TAvatarPublic,
    TAvatarPrivate,
    TAvatarApp
  > = {},
): WorldSession<
  TSelf,
  TActors,
  TVoxelState,
  TChunkState,
  TChannel,
  TDirect,
  TSave,
  TAvatarPublic,
  TAvatarPrivate,
  TAvatarApp
> {
  const core = new WorldSessionCore(client, appId, config.ticker);
  // The error store registers the send-tracking sink — construct it first so
  // the very first actor/chunk sends are already attributable.
  const errors = config.errors
    ? new ErrorStore(core, config.errors === true ? {} : config.errors)
    : undefined;
  const self = config.self ? new LocalActorStore(core, config.self) : undefined;
  const actors = config.actors
    ? new RemoteActorStore(core, {
        // Filter the local echo automatically when a self store exists.
        selfUuid: self ? () => self.uuid : undefined,
        ...config.actors,
      })
    : undefined;
  const chunks = config.chunks
    ? new ChunkStore<TVoxelState, TChunkState>(core, {
        // Stamp outbound voxel edits with the local actor's uuid.
        actorUuid: self ? () => self.uuid : undefined,
        ...(config.chunks === true ? {} : config.chunks),
      })
    : undefined;
  const selfUuid = self ? () => self.uuid : undefined;
  const channelInbox = config.channelInbox
    ? new ChannelInbox<TChannel>(core, {
        senderUuid: selfUuid,
        ...(config.channelInbox === true ? {} : config.channelInbox),
      })
    : undefined;
  const actorInbox = config.actorInbox
    ? new ActorInbox<TDirect>(core, config.actorInbox === true ? {} : config.actorInbox)
    : undefined;
  const events = config.events
    ? new EventRouter(core, {
        senderUuid: selfUuid,
        ...(config.events === true ? {} : config.events),
      })
    : undefined;
  const host = config.host
    ? new HostTracker(core, config.host === true ? {} : config.host)
    : undefined;
  const save = config.save
    ? new SaveStateStore<TSave>(core, config.save === true ? {} : config.save)
    : undefined;
  const avatar = config.avatar
    ? new AvatarStateStore<TAvatarPublic, TAvatarPrivate, TAvatarApp>(
        core,
        config.avatar === true ? {} : config.avatar,
      )
    : undefined;
  return {
    appId,
    context: core,
    ...(self ? { self } : {}),
    ...(actors ? { actors } : {}),
    ...(errors ? { errors } : {}),
    ...(chunks ? { chunks } : {}),
    ...(channelInbox ? { channelInbox } : {}),
    ...(actorInbox ? { actorInbox } : {}),
    ...(events ? { events } : {}),
    ...(host ? { host } : {}),
    ...(save ? { save } : {}),
    ...(avatar ? { avatar } : {}),
    dispose: () => core.dispose(),
  };
}
