import {
  projectTargets,
  type CreateCrowdyStudioProjectInput,
  type CrowdyStudioProjectFile,
  type CrowdyStudioProjectKind,
  type CrowdyStudioProjectMetadata,
  type CrowdyStudioTarget,
} from './models.js';

const SDK_VERSION = '0.1.5';

export interface CrowdyStudioNewProjectOptions {
  appId: string;
  gridId: string;
  name: string;
  kind: CrowdyStudioProjectKind;
  description?: string;
}

/** Create a compile-oriented starter without introducing a raw JSON source map. */
export function createCrowdyStudioStarterProject(
  options: CrowdyStudioNewProjectOptions,
): CreateCrowdyStudioProjectInput {
  const base = moduleName(options.name);
  const targets = projectTargets(options.kind);
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
    pairingPreference: options.kind === 'FULL_STACK' ? 'REQUIRED' : 'NONE',
  };
  return {
    appId: options.appId,
    gridId: options.gridId,
    kind: options.kind,
    metadata,
    files: targets.flatMap((target) =>
      starterFiles(target, target === 'SERVER'
        ? metadata.serverModuleName!
        : metadata.clientModuleName!),
    ),
  };
}

function starterFiles(
  target: CrowdyStudioTarget,
  name: string,
): CrowdyStudioProjectFile[] {
  return [
    {
      target,
      path: 'Cargo.toml',
      content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
crowdy-compute-sdk = "${SDK_VERSION}"
`,
    },
    {
      target,
      path: 'src/lib.rs',
      content: target === 'SERVER' ? serverSource() : clientSource(),
    },
  ];
}

function serverSource(): string {
  return `use crowdy_compute_sdk as crowdy;

fn on_init() {
    // Runs once when this SERVER module starts on the owned grid.
}

fn on_tick(_dt_ms: u32) {
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
    // Client host calls are allow-listed by PlayerCodeBroker. Presentation
    // effects (for example HUD updates) never receive the page's app token.
    // Type "crowdy::" for lifecycle and host-call completions.
}

fn on_invoke(payload: &[u8]) -> Vec<u8> {
    payload.to_vec()
}

crowdy::register_module!(init: on_init, tick: on_tick, invoke: on_invoke);
`;
}

function moduleName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return slug || 'player-mod';
}
