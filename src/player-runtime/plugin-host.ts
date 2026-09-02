/**
 * Portable CLIENT plugin slots (appearance / mesh_assets / mechanics).
 * Games register adapters; this module only names the host_call surface,
 * validates args, and maps calls onto PlayerCodePresentation channels.
 * Presentation never reaches the SDK — the broker forwards to onPresentation.
 */

export const PLUGIN_HOST_FUNCTIONS = [
  'grid_skin_set',
  'grid_skin_clear',
  'mesh_asset_register',
  'mesh_asset_attach',
  'mesh_asset_spawn',
  'mesh_asset_clear',
  'mechanics_emit',
] as const;

export type PluginHostFunction = (typeof PLUGIN_HOST_FUNCTIONS)[number];

export const PLUGIN_PRESENT_FUNCTIONS = new Set<string>(PLUGIN_HOST_FUNCTIONS);

export type PluginPresentationChannel = 'appearance' | 'mesh' | 'mechanics';

const APPEARANCE_FNS = new Set(['grid_skin_set', 'grid_skin_clear']);
const MESH_FNS = new Set([
  'mesh_asset_register',
  'mesh_asset_attach',
  'mesh_asset_spawn',
  'mesh_asset_clear',
]);
const MECHANICS_FNS = new Set(['mechanics_emit']);

export const MAX_GRID_SKIN_REMAPS = 32;
export const MAX_GRID_SKIN_PAINTS = 16;
export const MAX_MESH_ID_BYTES = 64;
export const MAX_TILE_KEY_BYTES = 64;

const TILE_KEY = /^[a-z0-9_]{1,64}$/;
const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;
const FORBIDDEN_BLOB_KEYS = new Set([
  'bytes',
  'image',
  'png',
  'glb',
  'gltfBytes',
  'dataUrl',
  'dataURL',
  'base64',
]);

const MECHANICS_EVENTS = new Set(['fire', 'hit', 'score']);
const MESH_KINDS = new Set(['primitive', 'gltf']);
const MESH_ANCHORS = new Set(['hand', 'world']);

export function pluginChannelFor(
  fn: string,
): PluginPresentationChannel | null {
  if (APPEARANCE_FNS.has(fn)) return 'appearance';
  if (MESH_FNS.has(fn)) return 'mesh';
  if (MECHANICS_FNS.has(fn)) return 'mechanics';
  return null;
}

export function isPluginHostFunction(fn: string): fn is PluginHostFunction {
  return PLUGIN_PRESENT_FUNCTIONS.has(fn);
}

/**
 * Throw a denied-style Error if args are not a lawful plugin payload.
 * Callers must still rate-limit; this is shape + cap only.
 */
export function assertPluginHostArgs(
  fn: string,
  args: Record<string, unknown>,
): void {
  assertNoBlobKeys(args);
  switch (fn) {
    case 'grid_skin_clear':
    case 'mesh_asset_clear':
      return;
    case 'grid_skin_set':
      assertGridSkinSet(args);
      return;
    case 'mesh_asset_register':
      assertMeshRegister(args);
      return;
    case 'mesh_asset_attach':
      assertMeshAttach(args);
      return;
    case 'mesh_asset_spawn':
      assertMeshSpawn(args);
      return;
    case 'mechanics_emit':
      assertMechanicsEmit(args);
      return;
    default:
      throw new Error(`unknown plugin host function '${fn}'`);
  }
}

function assertNoBlobKeys(value: unknown, depth = 0): void {
  if (depth > 6 || value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) assertNoBlobKeys(entry, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_BLOB_KEYS.has(key)) {
      throw new Error('plugin host calls cannot carry raw asset bytes');
    }
    assertNoBlobKeys(child, depth + 1);
  }
}

function assertGridSkinSet(args: Record<string, unknown>): void {
  const remap = args.remap;
  const paint = args.paint;
  const bind = args.bind;
  if (remap != null) {
    if (!isPlainObject(remap)) throw new Error('grid_skin_set remap must be an object');
    const keys = Object.keys(remap);
    if (keys.length > MAX_GRID_SKIN_REMAPS) {
      throw new Error(`grid_skin_set remap exceeds ${MAX_GRID_SKIN_REMAPS} entries`);
    }
    for (const key of keys) {
      const id = Number(key);
      if (!Number.isInteger(id) || id < 1 || id > 255) {
        throw new Error('grid_skin_set remap keys must be voxel types 1–255');
      }
      assertFaceSpec(remap[key], 'remap');
    }
  }
  if (bind != null) {
    if (!isPlainObject(bind)) throw new Error('grid_skin_set bind must be an object');
    const keys = Object.keys(bind);
    if (keys.length > MAX_GRID_SKIN_REMAPS) {
      throw new Error(`grid_skin_set bind exceeds ${MAX_GRID_SKIN_REMAPS} entries`);
    }
    for (const key of keys) {
      const id = Number(key);
      if (!Number.isInteger(id) || id < 1 || id > 255) {
        throw new Error('grid_skin_set bind keys must be voxel types 1–255');
      }
      assertFaceSpec(bind[key], 'bind');
    }
  }
  if (paint != null) {
    if (!Array.isArray(paint)) throw new Error('grid_skin_set paint must be an array');
    if (paint.length > MAX_GRID_SKIN_PAINTS) {
      throw new Error(`grid_skin_set paint exceeds ${MAX_GRID_SKIN_PAINTS} slots`);
    }
    for (const entry of paint) {
      if (!isPlainObject(entry)) throw new Error('paint entry must be an object');
      const slot = Number(entry.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot > 15) {
        throw new Error('paint.slot must be 0–15');
      }
      if (entry.fill != null && (typeof entry.fill !== 'string' || !HEX_COLOR.test(entry.fill))) {
        throw new Error('paint.fill must be a 6-digit hex color');
      }
      if (
        entry.speckle != null &&
        (typeof entry.speckle !== 'string' || !HEX_COLOR.test(entry.speckle))
      ) {
        throw new Error('paint.speckle must be a 6-digit hex color');
      }
      if (entry.speckleCount != null) {
        const count = Number(entry.speckleCount);
        if (!Number.isInteger(count) || count < 0 || count > 64) {
          throw new Error('paint.speckleCount must be 0–64');
        }
      }
      if (entry.seed != null) {
        const seed = Number(entry.seed);
        if (!Number.isInteger(seed) || seed < 0 || seed > 65535) {
          throw new Error('paint.seed must be 0–65535');
        }
      }
    }
  }
}

function assertFaceSpec(raw: unknown, label: string): void {
  if (!isPlainObject(raw)) throw new Error(`grid_skin_set ${label} values must be objects`);
  for (const face of ['all', 'top', 'bottom', 'side', 'front'] as const) {
    const tile = raw[face];
    if (tile == null) continue;
    if (typeof tile !== 'string' || !TILE_KEY.test(tile) || tile.length > MAX_TILE_KEY_BYTES) {
      throw new Error(`grid_skin_set ${label} tile keys must be lowercase identifiers`);
    }
  }
  if (raw.emission != null) {
    const emission = Number(raw.emission);
    if (!Number.isInteger(emission) || emission < 0 || emission > 15) {
      throw new Error('emission must be 0–15');
    }
  }
  if (raw.transparency != null) {
    if (
      raw.transparency !== 'opaque' &&
      raw.transparency !== 'cutout' &&
      raw.transparency !== 'transparent'
    ) {
      throw new Error('transparency must be opaque, cutout, or transparent');
    }
  }
  if (raw.color != null) {
    const color = Number(raw.color);
    if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
      throw new Error('color must be a 24-bit integer');
    }
  }
}

function assertMeshId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESH_ID_BYTES) {
    throw new Error('mesh asset id must be a 1–64 character string');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) {
    throw new Error('mesh asset id must be alphanumeric, underscore, or hyphen');
  }
  return raw;
}

function assertMeshRegister(args: Record<string, unknown>): void {
  assertMeshId(args.id);
  const kind = args.kind;
  if (kind != null && (typeof kind !== 'string' || !MESH_KINDS.has(kind))) {
    throw new Error('mesh_asset_register kind must be primitive or gltf');
  }
  if (kind === 'gltf') {
    const hash = args.artifactHash;
    if (typeof hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(hash)) {
      throw new Error('mesh_asset_register artifactHash must be a 64-char hex SHA-256');
    }
  }
  if (args.primitive != null && !isPlainObject(args.primitive)) {
    throw new Error('mesh_asset_register primitive must be an object');
  }
}

function assertMeshAttach(args: Record<string, unknown>): void {
  assertMeshId(args.id);
  if (args.anchor != null && (typeof args.anchor !== 'string' || !MESH_ANCHORS.has(args.anchor))) {
    throw new Error("mesh_asset_attach anchor must be 'hand' or 'world'");
  }
}

function assertMeshSpawn(args: Record<string, unknown>): void {
  assertMeshId(args.id);
  if (args.kind != null && (typeof args.kind !== 'string' || !MESH_KINDS.has(args.kind))) {
    throw new Error('mesh_asset_spawn kind must be primitive or gltf');
  }
  if (args.pose != null) {
    if (!isPlainObject(args.pose)) throw new Error('mesh_asset_spawn pose must be an object');
    for (const axis of ['x', 'y', 'z', 'yaw', 'pitch'] as const) {
      if (args.pose[axis] != null && typeof args.pose[axis] !== 'number') {
        throw new Error('mesh_asset_spawn pose x/y/z/yaw/pitch must be numbers');
      }
    }
  }
}

function assertMechanicsEmit(args: Record<string, unknown>): void {
  if (typeof args.event !== 'string' || !MECHANICS_EVENTS.has(args.event)) {
    throw new Error("mechanics_emit event must be 'fire', 'hit', or 'score'");
  }
  if (args.payload != null && !isPlainObject(args.payload)) {
    throw new Error('mechanics_emit payload must be an object');
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
