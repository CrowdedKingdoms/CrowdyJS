import {
  projectTargets,
  type CreateCrowdyStudioProjectInput,
  type CrowdyStudioProjectFile,
  type CrowdyStudioProjectKind,
  type CrowdyStudioProjectMetadata,
} from './models.js';

const SDK_VERSION = '0.1.8';

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
   * The SERVER target's crate, its package named for the project; required when the kind
   * has a SERVER target.
   */
  modStarter?: CrowdyStudioModStarter;
}

/**
 * Create a compile-oriented starter without introducing a raw JSON source map. The SERVER
 * target is the mod starter's crate and its module name fits a mod's (a mod has no client
 * pairing, so the preference is `NONE`); the CLIENT target is a `crowdy-compute-sdk` crate.
 */
export function createCrowdyStudioStarterProject(
  options: CrowdyStudioNewProjectOptions,
): CreateCrowdyStudioProjectInput {
  const targets = projectTargets(options.kind);
  const mod = options.modStarter;
  if (targets.includes('SERVER') && !mod) {
    throw new Error('A SERVER target starts from the mod starter (client.exec.modStarter)');
  }
  const base = mod ? modModuleBase(options.name) : moduleName(options.name);
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
    pairingPreference: 'NONE',
  };
  return {
    appId: options.appId,
    gridId: options.gridId,
    kind: options.kind,
    metadata,
    files: targets.flatMap((target) =>
      target === 'SERVER'
        ? modStarterFiles(mod!, metadata.serverModuleName!)
        : clientStarterFiles(metadata.clientModuleName!),
    ),
  };
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

function moduleName(value: string): string {
  const slug = slugModuleName(value).slice(0, 48);
  return slug || 'player-mod';
}

/**
 * A mod module base: short enough for `<base>-server` to be a mod name, and starting with a
 * letter, as a build's crate names must.
 */
function modModuleBase(value: string): string {
  const slug = slugModuleName(value);
  if (!slug) return 'player-mod';
  const cut = (/^[a-z]/u.test(slug) ? slug : `mod-${slug}`).slice(0, MOD_BASE_MAX);
  // The slug has no runs of dashes, so the cut leaves at most one at the end.
  return cut.endsWith('-') ? cut.slice(0, -1) : cut;
}

function clientStarterFiles(name: string): CrowdyStudioProjectFile[] {
  return [
    {
      target: 'CLIENT',
      path: 'Cargo.toml',
      content: clientCargoToml(name),
    },
    {
      target: 'CLIENT',
      path: 'src/lib.rs',
      content: clientSource(),
    },
  ];
}

function clientCargoToml(name: string): string {
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

# How often the browser calls CLIENT on_tick (clamped 16–1000 ms).
# 1000 = HUD/text. 50 = physics minigames (pool). 16 = shooters, if a tick stays cheap.
[package.metadata.crowdy]
tick_interval_ms = 1000

[dependencies]
crowdy-compute-sdk = "${SDK_VERSION}"
serde_json = "1"
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
