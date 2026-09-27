import type { CrowdyStudioServerEngine } from './controller.js';
import {
  projectTargets,
  type CreateCrowdyStudioProjectInput,
  type CrowdyStudioProjectFile,
  type CrowdyStudioProjectKind,
  type CrowdyStudioProjectMetadata,
  type CrowdyStudioTarget,
} from './models.js';

const SDK_VERSION = '0.1.8';
/** crowdy-client-sdk, what a ck-exec mod's CLIENT half builds on; the build points it at the platform's copy. */
const CLIENT_SDK_VERSION = '0.1.0';

/** A mod's name is at most 48 characters, and the SERVER module name is `<base>-server`. */
const MOD_BASE_MAX = 48 - '-server'.length;

/** ck-exec's mod starter crate (`client.exec.modStarter(appId)`). */
export interface CrowdyStudioModStarter {
  /** `Cargo.toml` and `src/**` of a `ckx-sdk` crate. */
  files: readonly { path: string; content: string }[];
}

export interface CrowdyStudioNewProjectOptions {
  appId: string;
  gridId: string;
  name: string;
  kind: CrowdyStudioProjectKind;
  description?: string;
  /**
   * The SERVER target starts from this crate, its package named for the project, instead of
   * the legacy compute SDK crate, and the server module name fits a mod's. A mod has no
   * client pairing, so a full-stack project records `NONE`.
   */
  modStarter?: CrowdyStudioModStarter;
  /**
   * `'ck-exec'`: the project is a ck-exec mod. Its SERVER target starts from `modStarter`
   * (required with one), its CLIENT target from a `crowdy-client-sdk` crate, the mod's CLIENT
   * half, and both module names fit a mod's. Default `'player-compute'`, where the CLIENT target
   * is a legacy compute SDK crate.
   */
  engine?: CrowdyStudioServerEngine;
}

/** Create a compile-oriented starter without introducing a raw JSON source map. */
export function createCrowdyStudioStarterProject(
  options: CrowdyStudioNewProjectOptions,
): CreateCrowdyStudioProjectInput {
  const mod = options.modStarter;
  const exec = options.engine === 'ck-exec';
  const targets = projectTargets(options.kind);
  if (exec && targets.includes('SERVER') && !mod) {
    throw new Error('A ck-exec SERVER target starts from the mod starter (client.exec.modStarter)');
  }
  const base = mod || exec ? modModuleBase(options.name) : moduleName(options.name);
  const metadata: CrowdyStudioProjectMetadata = {
    name: options.name.trim() || 'Untitled mod',
    ...(options.description?.trim()
      ? { description: options.description.trim() }
      : {}),
    ...(targets.includes('SERVER')
      ? { serverModuleName: `${base}-server` }
      : {}),
    ...(targets.includes('CLIENT')
      ? { clientModuleName: `${base}-client` }
      : {}),
    pairingPreference:
      options.kind === 'FULL_STACK' && !mod && !exec ? 'REQUIRED' : 'NONE',
  };
  return {
    appId: options.appId,
    gridId: options.gridId,
    kind: options.kind,
    metadata,
    files: targets.flatMap((target) =>
      target === 'SERVER'
        ? mod
          ? modStarterFiles(mod, metadata.serverModuleName!)
          : starterFiles(target, metadata.serverModuleName!)
        : exec
          ? clientHalfStarterFiles(metadata.clientModuleName!)
          : starterFiles(target, metadata.clientModuleName!),
    ),
  };
}

/**
 * A ck-exec mod's CLIENT half: one `crowdy-client-sdk` crate within the build's rules (only
 * `[package]`, `[lib]` as a cdylib, the SDK and serde dependencies, and
 * `[package.metadata.crowdy] tick_interval_ms`).
 */
function clientHalfStarterFiles(name: string): CrowdyStudioProjectFile[] {
  return [
    {
      target: 'CLIENT',
      path: 'Cargo.toml',
      content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

# How often visitors' browsers call tick (clamped 16–1000 ms).
# 1000 = HUD/text. 50 = physics minigames (pool). 16 = shooters, if a tick stays cheap.
[package.metadata.crowdy]
tick_interval_ms = 1000

[dependencies]
crowdy-client-sdk = "${CLIENT_SDK_VERSION}"
serde_json = "1"
`,
    },
    {
      target: 'CLIENT',
      path: 'src/lib.rs',
      content: `use crowdy_client_sdk as crowdy;

fn init() {
    // Runs once in each visitor's browser, after they consent to this CLIENT half
    // (or trust you) and while they stand in this grid.
    crowdy::log(1, "ready");
}

fn tick(_dt_ms: u32) {
    // Every tick_interval_ms (Cargo.toml). The state blob lasts as long as the page's worker.
    let ticks = u32::from_le_bytes(crowdy::state_get().try_into().unwrap_or([0; 4])).wrapping_add(1);
    crowdy::state_set(&ticks.to_le_bytes());
    // Host calls cross the page's broker as the visiting player, inside this grid: the HUD and
    // overlay, chunk and actor reads, voxel writes, spatial and channel sends, grid events.
    // Type "crowdy::api::" for the rest. The page's DOM and tokens are never reachable.
    let _ = crowdy::api::hud_set(serde_json::json!({ "text": format!("Ticks here: {ticks}") }));
    //
    // Mouse (holodeck canvas only; Studio chrome is omitted). Drain every tick:
    //   let data = crowdy::api::pointer_clicks().unwrap_or(serde_json::json!({}));
    // data["clicks"] = [{ "t": "down"|"up", "button": 0, "atMs", "heldMs", "nx", "ny" }]
}

fn invoke(payload: &[u8]) -> Vec<u8> {
    payload.to_vec()
}

fn event(_payload: &[u8]) {
    // Grid events from the other CLIENT halves on this page (crowdy::api::emit_event).
}

crowdy::register_module!(init: init, tick: tick, invoke: invoke, event: event);
`,
    },
  ];
}

function modStarterFiles(
  starter: CrowdyStudioModStarter,
  name: string,
): CrowdyStudioProjectFile[] {
  const paths = new Set(starter.files.map((file) => file.path));
  if (!paths.has('Cargo.toml') || !paths.has('src/lib.rs')) {
    throw new Error('The mod starter has no Cargo.toml or src/lib.rs');
  }
  return starter.files.map((file) => ({
    target: 'SERVER',
    path: file.path,
    content:
      file.path === 'Cargo.toml'
        ? renamePackage(file.content, name)
        : file.content,
  }));
}

/** The first `name` in `[package]`, set to `name`; every other line as it was. */
function renamePackage(manifest: string, name: string): string {
  let section = '';
  let renamed = false;
  return manifest
    .split('\n')
    .map((line) => {
      const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (header) {
        section = header[1].trim();
        return line;
      }
      if (section !== 'package' || renamed || !/^\s*name\s*=/.test(line)) {
        return line;
      }
      renamed = true;
      return `name = "${name}"`;
    })
    .join('\n');
}

/**
 * A mod module base: short enough for `<base>-server` and `<base>-client` to be mod names, and
 * starting with a letter, as a build's crate names must.
 */
function modModuleBase(value: string): string {
  const slug = slugModuleName(value);
  if (!slug) return 'player-mod';
  const cut = (/^[a-z]/u.test(slug) ? slug : `mod-${slug}`).slice(0, MOD_BASE_MAX);
  // The slug has no runs of dashes, so the cut leaves at most one at the end.
  return cut.endsWith('-') ? cut.slice(0, -1) : cut;
}

function starterFiles(
  target: CrowdyStudioTarget,
  name: string,
): CrowdyStudioProjectFile[] {
  return [
    {
      target,
      path: 'Cargo.toml',
      content: cargoToml(target, name),
    },
    {
      target,
      path: 'src/lib.rs',
      content: target === 'SERVER' ? serverSource() : clientSource(),
    },
  ];
}

function cargoToml(target: CrowdyStudioTarget, name: string): string {
  const clientTick =
    target === 'CLIENT'
      ? `
# How often the browser calls CLIENT on_tick (clamped 16–1000 ms).
# 1000 = HUD/text. 50 = physics minigames (pool). 16 = shooters, if a tick stays cheap.
[package.metadata.crowdy]
tick_interval_ms = 1000
`
      : '';
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]
${clientTick}
[dependencies]
crowdy-compute-sdk = "${SDK_VERSION}"
serde_json = "1"
`;
}

function serverSource(): string {
  return `use crowdy_compute_sdk as crowdy;

fn on_init() {
    // Runs once when this SERVER module starts on the owned grid.
}

fn on_tick(_dt_ms: u32) {
    // The host only ticks when tickIntervalMs is set (omit/0 = invoke-only).
    // Server host calls are permission checked and clamped to the owned grid.
    // Type "crowdy::" for the platform-indexed host-call surface.
}

fn on_invoke(payload: &[u8]) -> Vec<u8> {
    // Called by Crowdy Studio's Invoke panel or an allowed game caller.
    payload.to_vec()
}

crowdy::register_module!(init: on_init, tick: on_tick, invoke: on_invoke);
`;
}

function clientSource(): string {
  return `use crowdy_compute_sdk as crowdy;

fn on_init() {
    // Runs after the hash-bound CLIENT artifact enters the browser sandbox.
}

fn on_tick(_dt_ms: u32) {
    // dt_ms is wall time since the last tick. The host interval comes from
    // Cargo.toml [package.metadata.crowdy] tick_interval_ms (default 1000).
    // Client host calls are allow-listed by PlayerCodeBroker. Presentation
    // effects (for example HUD updates) never receive the page's app token.
    // Type "crowdy::" for lifecycle and host-call completions.
    //
    // Mouse (holodeck canvas only; Studio chrome is omitted). Drain every tick:
    //   let data = crowdy::api::pointer_clicks().unwrap_or(serde_json::json!({}));
    // data["clicks"] = [{ "t": "down"|"up", "button": 0, "atMs", "heldMs", "nx", "ny" }]
    // data["buttons"] is MouseEvent.buttons (1 = left held).
    // data["holdingMs"]["0"] is ms the left button has been down (power meter).
    // Click-to-charge: start on left down, read holdingMs while held, fire on up.
}

fn on_invoke(payload: &[u8]) -> Vec<u8> {
    payload.to_vec()
}

crowdy::register_module!(init: on_init, tick: on_tick, invoke: on_invoke);
`;
}

function moduleName(value: string): string {
  const slug = slugModuleName(value).slice(0, 48);
  return slug || 'player-mod';
}

/**
 * Same span as trim + lower + `/[^a-z0-9]+/gu` → `-`, then `/^-+|-+$/gu`.
 * Linear scan; non-ASCII and punctuation collapse to a single dash.
 */
function slugModuleName(value: string): string {
  const trimmed = value.trim().toLowerCase();
  let dashed = '';
  let pendingDash = false;
  let started = false;
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0;
    const alnum = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (alnum) {
      if (pendingDash && started) dashed += '-';
      dashed += ch;
      started = true;
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return dashed;
}
