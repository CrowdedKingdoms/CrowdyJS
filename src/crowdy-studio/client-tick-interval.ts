/**
 * CLIENT mod tick cadence declared in Cargo.toml and honored by the Studio
 * broker. The wasm does not choose this at runtime; the host reads it when
 * starting that mod's worker.
 */

export const DEFAULT_CLIENT_TICK_INTERVAL_MS = 1_000;
export const MIN_CLIENT_TICK_INTERVAL_MS = 16;
export const MAX_CLIENT_TICK_INTERVAL_MS = 1_000;

/**
 * Read `[package.metadata.crowdy] tick_interval_ms` from a CLIENT Cargo.toml.
 * Missing/invalid values fall back to {@link DEFAULT_CLIENT_TICK_INTERVAL_MS}.
 * Out-of-range values are clamped.
 */
export function parseClientTickIntervalMs(
  cargoToml: string | null | undefined,
): number {
  if (!cargoToml) return DEFAULT_CLIENT_TICK_INTERVAL_MS;
  const match = cargoToml.match(/^[ \t]*tick_interval_ms[ \t]*=[ \t]*(\d+)[ \t]*$/m);
  if (!match) return DEFAULT_CLIENT_TICK_INTERVAL_MS;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_CLIENT_TICK_INTERVAL_MS;
  }
  return Math.min(
    MAX_CLIENT_TICK_INTERVAL_MS,
    Math.max(MIN_CLIENT_TICK_INTERVAL_MS, value),
  );
}
