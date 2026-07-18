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

import {
  WorldSessionCore,
  type WorldSessionBaseConfig,
  type WorldStoresClient,
} from './session.js';

/**
 * Configuration for {@link createWorldSession}. Store-specific keys are
 * added as the store modules land; only configured stores are constructed
 * (and only they appear on the returned session's type).
 */
export interface WorldSessionConfig extends WorldSessionBaseConfig {}

/** The session returned by {@link createWorldSession}. */
export interface WorldSession {
  /** The app this session is scoped to. */
  readonly appId: string;
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
 * import { createWorldSession, workerTicker } from '@crowdedkingdoms/crowdyjs/stores';
 *
 * const session = createWorldSession(client, appId, { ticker: workerTicker() });
 * // ...configure stores (self / actors / chunks / …) — see each store module.
 * session.dispose();
 * ```
 */
export function createWorldSession(
  client: WorldStoresClient,
  appId: string,
  config: WorldSessionConfig = {},
): WorldSession {
  const core = new WorldSessionCore(client, appId, config.ticker);
  return {
    appId,
    context: core,
    dispose: () => core.dispose(),
  };
}
