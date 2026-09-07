/**
 * Curated closed-world API cards for Studio Problems→chat seeds.
 * Keep in sync with cks-game-api/src/crowdy-studio-agent/tools/api-doc-cards.ts
 */

export interface ApiDocCard {
  id: string;
  matchers: RegExp[];
  signature: string;
  canonicalCall: string;
  wrongShapes: string[];
  notes: string;
}

export interface ApiDocMatchInput {
  message?: string | null;
  code?: string | null;
  path?: string | null;
  target?: string | null;
  blockText?: string | null;
}

export const VOXEL_SET_CARD: ApiDocCard = {
  id: 'voxel_set',
  matchers: [
    /\bvoxel_set\b/i,
    /\bplace_block\b/i,
    /\bhost_place_block\b/i,
    /\bset_block\b/i,
  ],
  signature:
    'crowdy::api::voxel_set(chunk: (i64, i64, i64), voxel: (u8, u8, u8), voxel_type: i32, state_base64: Option<&str>) -> Result<Value, HostError>',
  canonicalCall:
    'crowdy::api::voxel_set((cx, cy, cz), (vx, vy, vz), block_i32, None)',
  wrongShapes: [
    '3-arg voxel_set(pos, block, None)',
    'world XYZ in the chunk tuple with (0,0,0) local',
    'string block names ("stone")',
    'voxel_set::set_block / host_place_block / crowdy::spawn',
  ],
  notes:
    'First tuple is chunk coords (i64); second is local voxel within the chunk (u8). Block type is numeric i32, not a string.',
};

export const GLAM_CARD: ApiDocCard = {
  id: 'glam',
  matchers: [/\bglam\b/i],
  signature: '(not available — glam is forbidden in Crowdy Studio crates)',
  canonicalCall: 'Use crowdy::api::* only; do not add glam to Cargo.toml',
  wrongShapes: ['extern crate glam', 'use glam::', 'glam = "…" in Cargo.toml'],
  notes:
    'Cargo.toml may only declare allowlisted crates (crowdy-compute-sdk, game-kit-*, serde, serde_json, rand).',
};

export const SPAWN_CARD: ApiDocCard = {
  id: 'crowdy_spawn',
  matchers: [/\bcrowdy::spawn\b/i, /\bhost_place_block\b/i],
  signature: '(not available — crowdy::spawn / host_place_block are invented)',
  canonicalCall:
    'crowdy::api::voxel_set((cx, cy, cz), (vx, vy, vz), block_i32, None)',
  wrongShapes: ['crowdy::spawn(...)', 'host_place_block(...)'],
  notes: 'Durable world writes go through crowdy::api::voxel_set only.',
};

export const INVOKE_PARAMS_CARD: ApiDocCard = {
  id: 'invoke_params',
  matchers: [/\bon_invoke\b/i, /\binvoke_params\b/i, /\bparams\.chunk\b/i],
  signature:
    'fn on_invoke(payload: &[u8]) -> Vec<u8>  // UTF-8 JSON {export, params, callerUserId, gridId}',
  canonicalCall:
    'let env: serde_json::Value = serde_json::from_slice(payload).unwrap_or_default();\n' +
    'let params = env.get("params").cloned().unwrap_or(env);\n' +
    'let chunk = params.get("chunk").and_then(|v| v.as_array())\n' +
    '    .or_else(|| parse chunk_x / chunk_y / chunk_z);\n' +
    '// fallback: current chunk from game_context, never (0,0,0) and never first 24 bytes',
  wrongShapes: [
    'String::from_utf8_lossy(payload) as a raw command string',
    'first 24 little-endian i64 bytes as chunk coords',
    'hardcoded DISCO_CHUNK / (0,0,0) when the player is elsewhere',
  ],
  notes:
    'Studio Invoke sends a JSON envelope. Parse params.chunk or chunk_x/y/z. ' +
    'If params omit a chunk, use the live current chunk from game_context.',
};

export const API_DOC_CARDS: readonly ApiDocCard[] = [
  VOXEL_SET_CARD,
  GLAM_CARD,
  SPAWN_CARD,
  INVOKE_PARAMS_CARD,
];

export function formatApiDocCard(card: ApiDocCard): string {
  return [
    `API_DOC · ${card.id}`,
    `Signature: ${card.signature}`,
    `Example: ${card.canonicalCall}`,
    `Wrong: ${card.wrongShapes.join('; ')}`,
    `Notes: ${card.notes}`,
  ].join('\n');
}

export function formatApiDocCards(cards: readonly ApiDocCard[]): string {
  return cards.map(formatApiDocCard).join('\n\n');
}

export function matchApiDocCards(input: ApiDocMatchInput): ApiDocCard[] {
  const haystack = [
    input.message ?? '',
    input.code ?? '',
    input.path ?? '',
    input.target ?? '',
    input.blockText ?? '',
  ].join('\n');
  if (!haystack.trim()) return [];
  const matched: ApiDocCard[] = [];
  const seen = new Set<string>();
  for (const card of API_DOC_CARDS) {
    if (card.matchers.some((pattern) => pattern.test(haystack))) {
      if (!seen.has(card.id)) {
        seen.add(card.id);
        matched.push(card);
      }
    }
  }
  return matched;
}
