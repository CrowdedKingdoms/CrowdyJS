import type { GridScope } from '../grid-scope.js';
import type { PlayerCodeHostCall } from '../player-runtime/player-code-broker.js';
import type { ChunksAPI } from '../domains/chunks.js';
import type { VoxelsAPI } from '../domains/voxels.js';
import type { StateAPI } from '../domains/state.js';

/**
 * Game-local fast paths. A game that already holds the world in memory (a
 * chunk store, an actor store) answers reads from there instead of a round
 * trip; anything it leaves out falls through to the server path.
 */
export interface GridHostLocal {
  chunkVoxels?(x: bigint, y: bigint, z: bigint): { voxelsBase64: string | null } | null;
  actorsInChunk?(x: bigint, y: bigint, z: bigint): Array<Record<string, unknown>>;
  setVoxel?(input: {
    chunk: { x: number; y: number; z: number };
    x: number;
    y: number;
    z: number;
    voxelType: number;
    state?: string;
  }): Promise<boolean>;
  drainPointerClicks?(): unknown;
}

export interface GridHostCallsOptions {
  /** The grid, bound (`client.grid(appId, gridId, box)`), box required. */
  scope: GridScope;
  /** The page client's domain clients (a CrowdyClient satisfies this). */
  client: {
    chunks: ChunksAPI;
    voxels: VoxelsAPI;
    state: StateAPI;
  };
  local?: GridHostLocal;
  /**
   * Channels a mod may post to. Default: the grid's own channels only (the
   * server rule for grid code). A game may widen it to channels the player
   * can post to anyway.
   */
  channelFilter?: (channelId: string) => boolean | Promise<boolean>;
  /** Stable 32-hex actor uuid the mod's spatial sends are attributed to. */
  actorUuid?: string;
}

/** Thrown for a host call this game does not offer in the browser. */
export class GridHostCallRefused extends Error {
  constructor(readonly fn: string, reason = 'not offered in the browser') {
    super(`host call '${fn}' ${reason}`);
    this.name = 'GridHostCallRefused';
  }
}

const SPATIAL_KINDS = new Set(['actor', 'client_event', 'server_event', 'text']);

/**
 * The page-side answer to every CLIENT host call in the platform catalog,
 * through ordinary CrowdyJS confined to one grid (DN-10 §4). Hand the result
 * to `PlayerCodeBroker({ onHostCall })`; the broker has already applied the
 * allowlist, rate caps and chunk clamps, and answers `grid_info`, `emit_event`,
 * `hud_set` and `overlay_draw` itself.
 */
export function createGridHostCalls(
  options: GridHostCallsOptions,
): (call: PlayerCodeHostCall) => Promise<unknown> {
  const { scope, client, local } = options;
  const appId = scope.appId;
  let gridChannels: Promise<Set<string>> | null = null;
  const ownChannels = () =>
    (gridChannels ??= scope.channels
      .list()
      .then((rows) => new Set(rows.map((row) => String(row.groupId))))
      .catch(() => {
        gridChannels = null;
        return new Set<string>();
      }));
  const channelAllowed = async (channelId: string) =>
    options.channelFilter
      ? options.channelFilter(channelId)
      : (await ownChannels()).has(channelId);
  const uuid = (args: Record<string, unknown>) =>
    typeof args.uuidHex === 'string' && /^[0-9a-f]{64}$/i.test(args.uuidHex)
      ? hexToAscii(args.uuidHex)
      : (options.actorUuid ?? '0'.repeat(32));

  return async ({ fn, args }) => {
    switch (fn) {
      case 'chunk_get': {
        const [x, y, z] = coords(args.x, args.y, args.z);
        scope.assertContains({ x, y, z });
        const hit = local?.chunkVoxels?.(x, y, z);
        if (hit !== undefined) return { voxelsBase64: hit?.voxelsBase64 ?? null };
        const chunk = await client.chunks.get({
          appId,
          coordinates: { x: x.toString(), y: y.toString(), z: z.toString() },
        });
        return { voxelsBase64: (chunk as { voxels?: string | null } | null)?.voxels ?? null };
      }
      case 'voxels_list': {
        const [x, y, z] = coords(args.x, args.y, args.z);
        scope.assertContains({ x, y, z });
        return {
          voxels: await client.voxels.list({
            appId,
            coordinates: { x: x.toString(), y: y.toString(), z: z.toString() },
          }),
        };
      }
      case 'actors_list':
      case 'actors_list_radius': {
        const [x, y, z] = coords(args.x, args.y, args.z);
        scope.assertContains({ x, y, z });
        if (!local?.actorsInChunk) throw new GridHostCallRefused(fn);
        // Same clamps as the server host: radiusXz <= 3, radiusY <= 1, box-clipped.
        const rXz = fn === 'actors_list' ? 0n : BigInt(clampInt(args.radiusXz ?? args.radius, 0, 3));
        const rY = fn === 'actors_list' ? 0n : BigInt(clampInt(args.radiusY, 0, 1));
        const box = scope.bounds!;
        const actors: Array<Record<string, unknown>> = [];
        for (let cx = max(box.low.x, x - rXz); cx <= min(box.high.x, x + rXz); cx++)
          for (let cy = max(box.low.y, y - rY); cy <= min(box.high.y, y + rY); cy++)
            for (let cz = max(box.low.z, z - rXz); cz <= min(box.high.z, z + rXz); cz++)
              actors.push(...local.actorsInChunk(cx, cy, cz));
        return { actors };
      }
      case 'voxel_set': {
        const chunk = coords(args.chunkX, args.chunkY, args.chunkZ);
        scope.assertContains({ x: chunk[0], y: chunk[1], z: chunk[2] });
        const voxel = {
          x: Number(args.voxelX ?? 0),
          y: Number(args.voxelY ?? 0),
          z: Number(args.voxelZ ?? 0),
        };
        const voxelType = Number(args.voxelType ?? 0);
        const state = typeof args.stateBase64 === 'string' ? args.stateBase64 : undefined;
        if (local?.setVoxel) {
          return {
            ok: await local.setVoxel({
              chunk: { x: Number(chunk[0]), y: Number(chunk[1]), z: Number(chunk[2]) },
              ...voxel,
              voxelType,
              state,
            }),
          };
        }
        await client.voxels.update({
          appId,
          coordinates: { x: chunk[0].toString(), y: chunk[1].toString(), z: chunk[2].toString() },
          location: voxel,
          voxelType,
          ...(state ? { state } : {}),
        });
        return { ok: true };
      }
      case 'emit_spatial': {
        const kind = String(args.kind ?? '');
        if (!SPATIAL_KINDS.has(kind)) throw new GridHostCallRefused(fn, 'has an unknown kind');
        const [x, y, z] = coords(args.chunkX, args.chunkY, args.chunkZ);
        const chunk = { x: x.toString(), y: y.toString(), z: z.toString() };
        const payload = String(args.payloadBase64 ?? '');
        const distance = Math.max(0, Math.min(8, Number(args.distance ?? 0) | 0));
        const common = { chunk, uuid: uuid(args), distance };
        if (kind === 'actor') return scope.send.actorUpdate({ ...common, state: payload });
        if (kind === 'text') {
          return scope.send.text({ ...common, text: atob(payload) });
        }
        // client_event / server_event: [u16 eventType LE][state]
        const bytes = base64Bytes(payload);
        if (bytes.length < 2) throw new GridHostCallRefused(fn, 'needs a uint16 eventType prefix');
        return scope.send.clientEvent({
          ...common,
          eventType: bytes[0]! | (bytes[1]! << 8),
          state: bytesBase64(bytes.subarray(2)),
        });
      }
      case 'emit_channel': {
        const channelId = String(args.channelId ?? '');
        if (!(await channelAllowed(channelId))) {
          throw new GridHostCallRefused(fn, 'targets a channel outside this grid');
        }
        return scope.channels.send(channelId, uuid(args), String(args.payloadBase64 ?? ''));
      }
      case 'user_state_get':
        return client.state.getOne(appId);
      case 'user_state_set':
        return client.state.update({
          appId,
          state: typeof args.stateBase64 === 'string' ? args.stateBase64 : null,
        });
      case 'pointer_clicks':
        if (!local?.drainPointerClicks) throw new GridHostCallRefused(fn);
        return local.drainPointerClicks();
      default:
        // The model host calls (container_*, property_set, edge_*, model_invoke,
        // sessions_list) went with the game model and the player model;
        // grid_state_*, avatar_state_get and grid_permission_check have no
        // browser GraphQL surface.
        throw new GridHostCallRefused(fn);
    }
  };
}

function coords(x: unknown, y: unknown, z: unknown): [bigint, bigint, bigint] {
  return [BigInt(x as string), BigInt(y as string), BigInt(z as string)];
}

function clampInt(value: unknown, lo: number, hi: number): number {
  const n = Number(value ?? lo);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.trunc(n))) : lo;
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function hexToAscii(hex: string): string {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
