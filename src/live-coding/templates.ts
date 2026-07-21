/**
 * Starter templates for the live-coding panel (08 §5). These are minimal,
 * compile-ready single-file mods written against the public host surface —
 * the panel seeds them and games (BWF) supply their own richer set. Each
 * value is the JSON source map playerComputeDeploy expects.
 */
export interface PlayerCodeTemplate {
  id: string;
  title: string;
  target: 'server' | 'client';
  description: string;
  /** JSON string: { "Cargo.toml": "...", "src/lib.rs": "..." } */
  sourceFilesJson: string;
}

function cargo(name: string): string {
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
crowdy-compute-sdk = "0.1.5"
`;
}

function src(name: string, lib: string): string {
  return JSON.stringify({ 'Cargo.toml': cargo(name), 'src/lib.rs': lib });
}

export const PLAYER_CODE_TEMPLATES: PlayerCodeTemplate[] = [
  {
    id: 'server-ticker',
    title: 'Grid ticker (server)',
    target: 'server',
    description: 'A low-rate server tick you can grow into an auto-farm or spawner.',
    sourceFilesJson: src(
      'grid-ticker',
      `fn on_init() {}
fn on_tick(_dt: u32) {
    // Runs on the server as the grid owner while someone is in the grid.
    // Read/write only inside your grid; egress is grid-clamped.
}
fn on_invoke(_payload: &[u8]) -> Vec<u8> { Vec::new() }
crowdy_compute_sdk::register_module!(init: on_init, tick: on_tick, invoke: on_invoke);`,
    ),
  },
  {
    id: 'server-invoke',
    title: 'Invoke tool (server)',
    target: 'server',
    description: 'A callable export a client tool or automation can invoke as you.',
    sourceFilesJson: src(
      'invoke-tool',
      `fn on_init() {}
fn on_tick(_dt: u32) {}
fn on_invoke(_payload: &[u8]) -> Vec<u8> {
    b"{\\"ok\\":true}".to_vec()
}
crowdy_compute_sdk::register_module!(init: on_init, tick: on_tick, invoke: on_invoke);`,
    ),
  },
  {
    id: 'client-hud',
    title: 'Grid HUD (client)',
    target: 'client',
    description:
      'A browser mod that draws a HUD panel for your grid via the presentation hook.',
    sourceFilesJson: src(
      'grid-hud',
      `fn on_init() {}
fn on_tick(_dt: u32) {
    // Client-side, runs as you in the browser sandbox. Use the hud_set host
    // call (via the SDK) to render into the game's mod HUD region.
}
fn on_invoke(_payload: &[u8]) -> Vec<u8> { Vec::new() }
crowdy_compute_sdk::register_module!(init: on_init, tick: on_tick, invoke: on_invoke);`,
    ),
  },
];

export function templateById(id: string): PlayerCodeTemplate | undefined {
  return PLAYER_CODE_TEMPLATES.find((t) => t.id === id);
}
