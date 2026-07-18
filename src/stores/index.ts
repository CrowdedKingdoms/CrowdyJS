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
  ContainerMirror,
  attachContainerMirror,
  type ContainerMirrorConfig,
  type MirroredContainer,
} from './model.js';
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
import type { StateCodec } from './codec.js';
import { ChunkStore, type ChunkStoreConfig } from './chunks.js';
import {
  AvatarStateStore,
  HostTracker,
  SaveStateStore,
  type AvatarStateConfig,
  type HostTrackerConfig,
  type SaveStateConfig,
} from './durable.js';
import { ContainerMirror, type ContainerMirrorConfig } from './model.js';
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
 * Configuration for {@link createWorldSession}: one optional key per store.
 * Only configured stores are constructed — and, via {@link WorldSession}'s
 * conditional typing, only configured stores exist on the returned session's
 * TYPE, so touching an unconfigured store is a compile error, not a runtime
 * surprise. Keys documented on each store's config type; `true` selects a
 * store's defaults.
 */
export interface WorldSessionConfig extends WorldSessionBaseConfig {
  /** Your own actor: identity, typed state, 5 Hz send loop ({@link LocalActorStore}). */
  self?: LocalActorConfig<any>;
  /**
   * Remote actors: typed registry with lanes, history, staleness
   * ({@link RemoteActorStore}). The self-echo filter is wired from `self`
   * automatically; set `selfUuid` yourself otherwise.
   */
  actors?: RemoteActorsConfig<any>;
  /**
   * Send-error log: attributes `GenericErrorResponse`s to the sends that
   * caused them ({@link ErrorStore}).
   */
  errors?: ErrorStoreConfig | true;
  /**
   * Chunk/voxel cache: bulk loading, typed states, realtime merge,
   * optimistic edits, worldgen write-back ({@link ChunkStore}). The outbound
   * sender uuid is wired from `self` automatically.
   */
  chunks?: ChunkStoreConfig<any, any> | true;
  /** Channel message inbox: per-channel typed history + send ({@link ChannelInbox}). */
  channelInbox?: ChannelInboxConfig<any> | true;
  /** Direct actor-to-actor message inbox ({@link ActorInbox}). */
  actorInbox?: ActorInboxConfig<any> | true;
  /**
   * App-defined event router: per-eventType codecs + handlers, lastEvent
   * cache ({@link EventRouter}).
   */
  events?: EventRouterConfig | true;
  /** Host election tracking: heartbeat loop + isHost ({@link HostTracker}). */
  host?: HostTrackerConfig | true;
  /** Typed per-user app save blob with debounced autosave ({@link SaveStateStore}). */
  save?: SaveStateConfig<any> | true;
  /** Typed avatar public/private/app state ({@link AvatarStateStore}). */
  avatar?: AvatarStateConfig<any, any, any> | true;
  /**
   * Game-model mirror: typed cached container snapshots with coalesced
   * refresh + notify-to-pull channel binding ({@link ContainerMirror}).
   */
  model?: ContainerMirrorConfig | true;
}

/** Infer the payload type of a `codec` config field (else the default `D`). */
type CodecType<CC, D> = CC extends { codec: StateCodec<infer T> } ? T : D;
type VoxelStateType<CC> = CC extends { voxelStateCodec: StateCodec<infer T> } ? T : string;
type ChunkStateType<CC> = CC extends { chunkStateCodec: StateCodec<infer T> } ? T : string;
type AvatarPublicType<CC> = CC extends { publicCodec: StateCodec<infer T> } ? T : unknown;
type AvatarPrivateType<CC> = CC extends { privateCodec: StateCodec<infer T> } ? T : unknown;
type AvatarAppType<CC> = CC extends { appCodec: StateCodec<infer T> } ? T : unknown;

/** The parts of a {@link WorldSession} that exist regardless of config. */
export interface WorldSessionBase {
  /** The app this session is scoped to. */
  readonly appId: string;
  /** Close the shared subscription, cancel timers, and release the stores. */
  dispose(): void;
  /** The wiring context (for custom store implementations). */
  readonly context: WorldSessionCore;
}

/**
 * The session returned by {@link createWorldSession}: the base surface plus
 * exactly the stores your config declared, with every store's value types
 * inferred from the codecs you passed. Annotate variables as
 * `WorldSession<typeof config>` when you need a name for it.
 */
export type WorldSession<C extends WorldSessionConfig = WorldSessionConfig> =
  WorldSessionBase &
    (C extends { self: LocalActorConfig<infer T> }
      ? { readonly self: LocalActorStore<T> }
      : unknown) &
    (C extends { actors: RemoteActorsConfig<infer T> }
      ? { readonly actors: RemoteActorStore<T> }
      : unknown) &
    (C extends { errors: ErrorStoreConfig | true }
      ? { readonly errors: ErrorStore }
      : unknown) &
    (C extends { chunks: infer CC }
      ? { readonly chunks: ChunkStore<VoxelStateType<CC>, ChunkStateType<CC>> }
      : unknown) &
    (C extends { channelInbox: infer CC }
      ? { readonly channelInbox: ChannelInbox<CodecType<CC, string>> }
      : unknown) &
    (C extends { actorInbox: infer CC }
      ? { readonly actorInbox: ActorInbox<CodecType<CC, string>> }
      : unknown) &
    (C extends { events: EventRouterConfig | true }
      ? { readonly events: EventRouter }
      : unknown) &
    (C extends { host: HostTrackerConfig | true }
      ? { readonly host: HostTracker }
      : unknown) &
    (C extends { save: infer CC }
      ? { readonly save: SaveStateStore<CodecType<CC, unknown>> }
      : unknown) &
    (C extends { avatar: infer CC }
      ? {
          readonly avatar: AvatarStateStore<
            AvatarPublicType<CC>,
            AvatarPrivateType<CC>,
            AvatarAppType<CC>
          >;
        }
      : unknown) &
    (C extends { model: ContainerMirrorConfig | true }
      ? { readonly model: ContainerMirror }
      : unknown);

/**
 * Create a **world session**: one shared `udpNotifications` subscription
 * fanned out to the stores you configure, one shared {@link Ticker}, and a
 * single `dispose()`. Pass your `CrowdyClient` (it satisfies
 * {@link WorldStoresClient} structurally) and the app id.
 *
 * ```ts
 * import { createWorldSession, structCodec, f32, u8, jsonCodec, workerTicker } from '@crowdedkingdoms/crowdyjs/stores';
 *
 * const poseCodec = structCodec({ x: f32(), y: f32(), z: f32(), flags: u8() });
 * const session = createWorldSession(client, appId, {
 *   ticker: workerTicker(), // hold 5 Hz in backgrounded tabs
 *   self: { codec: poseCodec, initialState: { x: 0, y: 0, z: 0, flags: 0 } },
 *   actors: { codec: poseCodec },
 *   errors: true,
 *   save: { codec: jsonCodec<{ level: number }>(), autosaveMs: 5000 },
 * });
 * await session.self.join({ x: '0', y: '0', z: '0' });
 * session.self.patchState({ x: 12.5 });          // next tick replicates it
 * for (const other of session.actors.list()) {}  // typed poses, self filtered
 * session.save.set({ level: 2 });                // autosaves, typed
 * // session.chunks — compile error: not configured.
 * session.dispose();
 * ```
 */
export function createWorldSession<const C extends WorldSessionConfig = Record<never, never>>(
  client: WorldStoresClient,
  appId: string,
  config?: C,
): WorldSession<C> {
  const cfg: WorldSessionConfig = config ?? {};
  const opt = <T>(value: T | true | undefined): T | undefined =>
    value === true ? ({} as T) : value;

  const core = new WorldSessionCore(client, appId, cfg.ticker);
  // The error store registers the send-tracking sink — construct it first so
  // the very first actor/chunk sends are already attributable.
  const errors = cfg.errors ? new ErrorStore(core, opt(cfg.errors)) : undefined;
  const self = cfg.self ? new LocalActorStore(core, cfg.self) : undefined;
  const selfUuid = self ? () => self.uuid : undefined;
  const actors = cfg.actors
    ? new RemoteActorStore(core, {
        // Filter the local echo automatically when a self store exists.
        selfUuid,
        ...cfg.actors,
      })
    : undefined;
  const chunks = cfg.chunks
    ? new ChunkStore(core, {
        // Stamp outbound voxel edits with the local actor's uuid.
        actorUuid: selfUuid,
        ...opt(cfg.chunks),
      })
    : undefined;
  const channelInbox = cfg.channelInbox
    ? new ChannelInbox(core, { senderUuid: selfUuid, ...opt(cfg.channelInbox) })
    : undefined;
  const actorInbox = cfg.actorInbox
    ? new ActorInbox(core, opt(cfg.actorInbox))
    : undefined;
  const events = cfg.events
    ? new EventRouter(core, { senderUuid: selfUuid, ...opt(cfg.events) })
    : undefined;
  const host = cfg.host ? new HostTracker(core, opt(cfg.host)) : undefined;
  const save = cfg.save ? new SaveStateStore(core, opt(cfg.save)) : undefined;
  const avatar = cfg.avatar ? new AvatarStateStore(core, opt(cfg.avatar)) : undefined;
  const model = cfg.model ? new ContainerMirror(core, opt(cfg.model)) : undefined;

  const session = {
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
    ...(model ? { model } : {}),
    dispose: () => core.dispose(),
  };
  return session as unknown as WorldSession<C>;
}
