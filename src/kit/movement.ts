import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';
import { parseMovementViolation, type MovementViolationEvent } from './wire.js';

/** Options for {@link MovementKit}. */
export interface MovementKitOptions {
  /** The warden module name. Defaults to `'movement-warden'`. */
  moduleName?: string;
  /** The warden-config container type. Defaults to `'WardenConfig'`. */
  configTypeName?: string;
}

/** A user's violation book as the warden reports it. */
export interface KitViolations {
  userId: string;
  speed: number;
  teleport: number;
  bounds: number;
  log: Array<{ atMs: number; kind: string; detail: string }>;
}

/**
 * Runtime helpers for the movement-warden (Wave 3, observe/flag posture):
 * read violation books, inspect the live envelope config, and parse type-95
 * violation events. The warden never corrects or kicks — client prediction
 * stays exactly as it is; games decide what flags mean (scoreboard shame,
 * moderation reports, tournament DQs).
 *
 * Client-prediction guidance: keep your movement client-authoritative and
 * SMOOTH — the envelopes are generous (speed tolerance + one-sample jitter
 * forgiveness) so honest clients never flag; teleports (fast travel,
 * respawns) should be paired with game-known context you can correlate
 * against the violation log.
 *
 * Obtained via `client.kit(appId).movement`.
 */
export class MovementKit {
  private readonly moduleName: string;
  private readonly configTypeName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly engines: EngineDetector,
    options: MovementKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'movement-warden';
    this.configTypeName = options.configTypeName ?? 'WardenConfig';
  }

  /** Is the warden deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /** A user's violation book (your own without an argument). */
  async violations(userId?: string): Promise<KitViolations> {
    const body = await this.invoke('violations', userId ? { userId } : {});
    return {
      userId: String(body.userId ?? ''),
      speed: Number(body.speed ?? 0),
      teleport: Number(body.teleport ?? 0),
      bounds: Number(body.bounds ?? 0),
      log: Array.isArray(body.log)
        ? (body.log as Array<Record<string, unknown>>).map((entry) => ({
            atMs: Number(entry.atMs ?? 0),
            kind: String(entry.kind ?? ''),
            detail: String(entry.detail ?? ''),
          }))
        : [],
    };
  }

  /** The live envelope configuration (posture is always `'observe'` v1). */
  async config() {
    return this.invoke('config', {});
  }

  /** Warden totals (watched actors, flagged users, samples). */
  async status() {
    return this.invoke('status', {});
  }

  /** STUDIO (admin) — create/adjust the WardenConfig container. */
  async defineConfig(input: {
    displayName?: string;
    chunk?: [number, number, number];
    radiusXz?: number;
    maxSpeed?: number;
    maxTeleport?: number;
    bounds?: [number, number, number, number];
    tolerancePct?: number;
  }) {
    const properties = [
      ...(input.chunk
        ? [
            { key: 'chunk_x', valueType: 'int', valueJson: String(input.chunk[0]) },
            { key: 'chunk_y', valueType: 'int', valueJson: String(input.chunk[1]) },
            { key: 'chunk_z', valueType: 'int', valueJson: String(input.chunk[2]) },
          ]
        : []),
      ...(input.radiusXz !== undefined
        ? [{ key: 'radius_xz', valueType: 'int', valueJson: String(input.radiusXz) }]
        : []),
      ...(input.maxSpeed !== undefined
        ? [{ key: 'max_speed', valueType: 'int', valueJson: String(input.maxSpeed) }]
        : []),
      ...(input.maxTeleport !== undefined
        ? [{ key: 'max_teleport', valueType: 'int', valueJson: String(input.maxTeleport) }]
        : []),
      ...(input.bounds
        ? [
            { key: 'min_x', valueType: 'int', valueJson: String(input.bounds[0]) },
            { key: 'max_x', valueType: 'int', valueJson: String(input.bounds[1]) },
            { key: 'min_z', valueType: 'int', valueJson: String(input.bounds[2]) },
            { key: 'max_z', valueType: 'int', valueJson: String(input.bounds[3]) },
          ]
        : []),
      ...(input.tolerancePct !== undefined
        ? [{ key: 'tolerance_pct', valueType: 'int', valueJson: String(input.tolerancePct) }]
        : []),
    ];
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.configTypeName,
      displayName: input.displayName ?? 'warden-config',
      properties,
    });
  }

  /** Parse a type-95 movement-violation server event. */
  parseViolation(bytes: Uint8Array): MovementViolationEvent | null {
    return parseMovementViolation(bytes);
  }

  private async invoke(exportName: string, params: Record<string, unknown>) {
    const result = await this.engines.invoke(this.moduleName, exportName, params);
    if (!result.success) {
      throw new Error(`movement.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }
}
