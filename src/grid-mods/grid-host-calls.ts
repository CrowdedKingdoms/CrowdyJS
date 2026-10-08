import type { GridChunk, GridScope } from '../grid-scope.js';
import type { PlayerCodeHostCall } from '../player-runtime/player-code-broker.js';
import type { AvatarsAPI } from '../domains/avatars.js';
import type { ChunksAPI } from '../domains/chunks.js';
import type { VoxelsAPI } from '../domains/voxels.js';
import type { StateAPI } from '../domains/state.js';

/**
 * Game-local fast paths and knowledge. A game that already holds the world in memory (a chunk
 * store, an actor store) answers reads from there instead of a round trip; anything it leaves
 * out falls through to the server path. The calls only the game can answer (`actors_list*`,
 * `avatar_state_get`, `grid_permission_check`, `pointer_clicks`) are refused without their
 * hook.
 */
export interface GridHostLocal {
  chunkVoxels?(x: bigint, y: bigint, z: bigint): { voxelsBase64: string | null } | null;
  actorsInChunk?(x: bigint, y: bigint, z: bigint): Array<Record<string, unknown>>;
  /**
   * The chunk of the avatar's live actor, from the game's actor store, or null when the game
   * sees none. `avatar_state_get` answers only for an avatar whose actor is inside the grid.
   */
  avatarChunk?(avatarId: string): GridChunk | null | undefined | Promise<GridChunk | null | undefined>;
  /**
   * The code-permission keys the visiting player holds on this grid, as the game knows them
   * (where Crowdy Studio's `targetPermissions` come from). `grid_permission_check` answers from
   * these, for that player, this grid and {@link GRID_PERMISSION_CHECK_KEYS} only, and refuses
   * any other key; the server still enforces the permissions.
   */
  gridPermissionKeys?(): Iterable<string> | Promise<Iterable<string>>;
  setVoxel?(input: {
    chunk: { x: number; y: number; z: number };
    x: number;
    y: number;
    z: number;
    voxelType: number;
    state?: string;
  }): Promise<boolean>;
  drainPointerClicks?(): unknown;
  /**
   * Answers a host call the page holds and the server does not: input, the
   * player's body, scene, presentation, and the player's own sends. Absent,
   * those calls are refused. A game that routes them itself does not use this.
   */
  page?(fn: string, args: Record<string, unknown>): unknown | Promise<unknown>;
}

export interface GridHostCallsOptions {
  /** The grid, bound (`client.grid(appId, gridId, box)`), box required. */
  scope: GridScope;
  /** The page client's domain clients (a CrowdyClient satisfies this). */
  client: {
    chunks: ChunksAPI;
    voxels: VoxelsAPI;
    state: StateAPI;
    /** For `avatar_state_get`, a public read (`avatarAppState`). */
    avatars?: Pick<AvatarsAPI, 'appState'>;
  };
  local?: GridHostLocal;
  /**
   * The visiting player's user id. `grid_permission_check` answers only about them, so without
   * it the call is refused.
   */
  userId?: string;
  /**
   * Channels a mod may post to. Default: the grid's own channels only (the
   * server rule for grid code). A game may widen it to channels the player
   * can post to anyway.
   */
  channelFilter?: (channelId: string) => boolean | Promise<boolean>;
  /**
   * The name of the actor a mod's spatial and channel sends go out as when it names none (its
   * `uuidHex` otherwise). Either way the wire uuid is {@link clientHalfActorUuid} of that name
   * on this grid, so a mod never sends as the player's avatar or as anyone else's.
   */
  actorUuid?: string;
}

/**
 * The permission keys `grid_permission_check` answers for: the player's code-permission keys,
 * the only ones a game knows for a grid. Any other key is refused rather than answered false.
 */
export const GRID_PERMISSION_CHECK_KEYS: readonly string[] = [
  'write_server_code',
  'run_server_code',
  'write_client_code',
  'run_client_code',
];

/**
 * The actor uuid a mod's spatial and channel sends carry on grid `gridId` for the actor it calls
 * `name`: the first 16 bytes of SHA-256 over both, as 32 lowercase hex characters. No name a mod
 * chooses maps to another uuid, so it cannot move a player's avatar or speak as one.
 */
export async function clientHalfActorUuid(gridId: string, name: string): Promise<string> {
  const input = new TextEncoder().encode(`crowdy/client-half-actor/v1\u0000${gridId}\u0000${name}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
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
 * The page-side answer to a CLIENT half's host calls (`EXEC_CLIENT_HOST_CALLS`,
 * what crowdy-client-sdk wraps), through ordinary CrowdyJS confined to one grid
 * (DN-10 §4). Hand the result to `PlayerCodeBroker({ onHostCall })`; the broker
 * has already applied the allowlist, the player's consent, rate caps and chunk
 * clamps, and answers `grid_info`, `emit_event`, `hud_set` and `overlay_draw`
 * itself.
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
    clientHalfActorUuid(
      scope.gridId,
      typeof args.uuidHex === 'string' && /^[0-9a-f]{64}$/i.test(args.uuidHex)
        ? hexToAscii(args.uuidHex)
        : (options.actorUuid ?? ''),
    );

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
        const vx = intIn(args.voxelX ?? 0, 0, 15);
        const vy = intIn(args.voxelY ?? 0, 0, 15);
        const vz = intIn(args.voxelZ ?? 0, 0, 15);
        const voxelType = intIn(args.voxelType ?? 0, 0, 255);
        if (vx === null || vy === null || vz === null || voxelType === null) {
          throw new GridHostCallRefused(fn, 'needs a voxel inside its chunk (0-15) and a voxel type 0-255');
        }
        const voxel = { x: vx, y: vy, z: vz };
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
        const common = { chunk, uuid: await uuid(args), distance };
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
        return scope.channels.send(channelId, await uuid(args), String(args.payloadBase64 ?? ''));
      }
      case 'avatar_state_get': {
        const avatarId = decimalId(args.avatarId);
        if (!avatarId) throw new GridHostCallRefused(fn, 'needs an avatar id');
        if (!local?.avatarChunk || !client.avatars) throw new GridHostCallRefused(fn);
        const at = await local.avatarChunk(avatarId);
        if (!at || !scope.contains(at)) {
          throw new GridHostCallRefused(fn, 'names an avatar with no live actor in this grid');
        }
        return client.avatars.appState(appId, avatarId);
      }
      case 'grid_permission_check': {
        const player = decimalId(options.userId);
        if (!local?.gridPermissionKeys || !player) throw new GridHostCallRefused(fn);
        const gridId = decimalId(args.gridId);
        if (!gridId || gridId !== decimalId(scope.gridId)) {
          throw new GridHostCallRefused(fn, 'names another grid');
        }
        if (decimalId(args.userId) !== player) {
          throw new GridHostCallRefused(fn, 'asks about another player');
        }
        const key = args.permissionKey;
        if (typeof key !== 'string' || !PERMISSION_KEY.test(key)) {
          throw new GridHostCallRefused(fn, 'needs a permission key');
        }
        if (!GRID_PERMISSION_CHECK_KEYS.includes(key)) {
          throw new GridHostCallRefused(
            fn,
            `cannot answer for '${key}': the page knows only the player's code-permission keys (${GRID_PERMISSION_CHECK_KEYS.join(', ')})`,
          );
        }
        return new Set(await local.gridPermissionKeys()).has(key);
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
      case 'clock':
        return { ms: Date.now() };
      // The page holds these. `local.page` is how a game answers them through
      // this helper; without it they are refused, the same as a missing hook.
      case 'actor_despawn':
      case 'actor_pose':
      case 'actor_spawn':
      case 'avatar_appearance':
      case 'avatar_state_set':
      case 'events_poll':
      case 'input_axes':
      case 'input_key':
      case 'input_look':
      case 'pose_get':
      case 'pose_release':
      case 'pose_set':
      case 'scene_catalog':
      case 'scene_instances':
      case 'send_actor_message':
      case 'send_channel_message':
      case 'send_client_event':
      case 'send_text':
      case 'teleport_request':
      case 'video_set':
      case 'voice_set':
        if (!local?.page) throw new GridHostCallRefused(fn);
        return local.page(fn, args);
      default:
        throw new GridHostCallRefused(fn);
    }
  };
}

/** As the runtime permission keys (`runtimePermissions`): lowercase, digits and `_`. */
const PERMISSION_KEY = /^[a-z][a-z0-9_]{0,63}$/;

/** A positive decimal id (BigInt as a decimal string, or a safe integer), normalized; else null. */
function decimalId(value: unknown): string | null {
  const text =
    typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^[1-9][0-9]{0,19}$/.test(text) ? text : null;
}

function coords(x: unknown, y: unknown, z: unknown): [bigint, bigint, bigint] {
  return [BigInt(x as string), BigInt(y as string), BigInt(z as string)];
}

/** An integer in [lo, hi] (a number, or a decimal string), else null. */
function intIn(value: unknown, lo: number, hi: number): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
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
