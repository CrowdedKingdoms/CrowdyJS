import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';
import { parseControlPointEvent, type ControlPointEvent } from './wire.js';

/** Options for {@link TerritoryKit}. */
export interface TerritoryKitOptions {
  /** The territory engine module name. Defaults to `'territory'`. */
  moduleName?: string;
}

/** A control point as the engine reports it. */
export interface KitControlPoint {
  pointId: string;
  x: number;
  z: number;
  radius: number;
  owner: string;
  challenger: string;
  progress: number;
  incomePerMin: number;
  siegeOpen: boolean;
}

/**
 * Runtime helpers for the territory engine (Wave 3): control-point state,
 * faction standings, and the admin CRUD for the map (factions, members,
 * points). Capture itself is pure presence — stand inside a point's radius
 * with your faction; the engine does the rest and announces flips as
 * type-96 events.
 *
 * Obtained via `client.kit(appId).territory`.
 */
export class TerritoryKit {
  private readonly moduleName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly engines: EngineDetector,
    options: TerritoryKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'territory';
  }

  /** Is the territory engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /** Every control point with live capture state. */
  async points(): Promise<KitControlPoint[]> {
    const body = await this.invoke('points', {});
    return Array.isArray(body.points)
      ? (body.points as Array<Record<string, unknown>>).map((p) => ({
          pointId: String(p.pointId ?? ''),
          x: Number(p.x ?? 0),
          z: Number(p.z ?? 0),
          radius: Number(p.radius ?? 0),
          owner: String(p.owner ?? ''),
          challenger: String(p.challenger ?? ''),
          progress: Number(p.progress ?? 0),
          incomePerMin: Number(p.incomePerMin ?? 0),
          siegeOpen: p.siegeOpen === true,
        }))
      : [];
  }

  /** Faction standings (id + treasury). */
  async factions(): Promise<Array<{ factionId: string; gold: number }>> {
    const body = await this.invoke('factions', {});
    return Array.isArray(body.factions)
      ? (body.factions as Array<Record<string, unknown>>).map((f) => ({
          factionId: String(f.factionId ?? ''),
          gold: Number(f.gold ?? 0),
        }))
      : [];
  }

  /** Engine totals (flips, income paid). */
  async status() {
    return this.invoke('status', {});
  }

  /** STUDIO (admin) — create a faction. */
  async defineFaction(factionId: string, displayName?: string) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: 'Faction',
      displayName: displayName ?? `faction-${factionId}`,
      properties: [
        { key: 'faction_id', valueType: 'string', valueJson: JSON.stringify(factionId) },
        { key: 'gold', valueType: 'int', valueJson: '0' },
      ],
    });
  }

  /** STUDIO (admin) — enroll a player in a faction. */
  async enroll(userId: string, factionId: string) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: 'FactionMember',
      displayName: `member-${userId}`,
      properties: [
        { key: 'user_id', valueType: 'string', valueJson: JSON.stringify(userId) },
        { key: 'faction_id', valueType: 'string', valueJson: JSON.stringify(factionId) },
      ],
    });
  }

  /** STUDIO (admin) — create a control point. */
  async definePoint(input: {
    pointId: string;
    x: number;
    z: number;
    radius: number;
    incomePerMin?: number;
    siegeFromMin?: number;
    siegeToMin?: number;
    displayName?: string;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: 'ControlPoint',
      displayName: input.displayName ?? `cp-${input.pointId}`,
      properties: [
        { key: 'point_id', valueType: 'string', valueJson: JSON.stringify(input.pointId) },
        { key: 'x', valueType: 'int', valueJson: String(Math.round(input.x)) },
        { key: 'z', valueType: 'int', valueJson: String(Math.round(input.z)) },
        { key: 'radius', valueType: 'int', valueJson: String(Math.round(input.radius)) },
        { key: 'owner_faction', valueType: 'string', valueJson: '""' },
        {
          key: 'income_per_min',
          valueType: 'int',
          valueJson: String(input.incomePerMin ?? 0),
        },
        ...(input.siegeFromMin !== undefined
          ? [{ key: 'siege_from_min', valueType: 'int', valueJson: String(input.siegeFromMin) }]
          : []),
        ...(input.siegeToMin !== undefined
          ? [{ key: 'siege_to_min', valueType: 'int', valueJson: String(input.siegeToMin) }]
          : []),
      ],
    });
  }

  /** Parse a type-96 control-point server event (flips). */
  parseControlPoint(bytes: Uint8Array): ControlPointEvent | null {
    return parseControlPointEvent(bytes);
  }

  private async invoke(exportName: string, params: Record<string, unknown>) {
    const result = await this.engines.invoke(this.moduleName, exportName, params);
    if (!result.success) {
      throw new Error(`territory.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }
}
