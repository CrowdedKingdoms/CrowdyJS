import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';
import { parseAbilityEvent, type AbilityEvent } from './wire.js';

/** Options for {@link AbilitiesKit}. */
export interface AbilitiesKitOptions {
  /** The abilities engine module name. Defaults to `'abilities-engine'`. */
  moduleName?: string;
  /** The ability-definition container type. Defaults to `'AbilityDef'`. */
  defTypeName?: string;
}

/** One ability as the engine's loadout reports it. */
export interface KitAbility {
  abilityId: string;
  cooldownMs: number;
  resourceCost: number;
  range: number;
  kind: 'instant' | 'projectile' | 'aoe' | string;
}

/**
 * Runtime helpers for the abilities engine (Wave 3): realtime casts with
 * server-side cooldown/resource/range books, tick-stepped projectiles, and
 * delayed AoEs. The caster's position is their live pose — `cast()` only
 * carries the TARGET; the server decides everything else. Type-94
 * cast/impact events carry the visuals.
 *
 * Obtained via `client.kit(appId).abilities`.
 */
export class AbilitiesKit {
  private readonly moduleName: string;
  private readonly defTypeName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly engines: EngineDetector,
    options: AbilitiesKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'abilities-engine';
    this.defTypeName = options.defTypeName ?? 'AbilityDef';
  }

  /** Is the abilities engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /** STUDIO (admin) — create an ability definition container. */
  async defineAbility(input: {
    abilityId: string;
    displayName?: string;
    spec: Record<string, unknown>;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.defTypeName,
      displayName: input.displayName ?? `ability-${input.abilityId}`,
      properties: [
        { key: 'ability_id', valueType: 'string', valueJson: JSON.stringify(input.abilityId) },
        { key: 'spec', valueType: 'string', valueJson: JSON.stringify(JSON.stringify(input.spec)) },
      ],
    });
  }

  /** Cast at a target point (your position comes from your live pose). */
  async cast(abilityId: string, targetX: number, targetZ: number) {
    return this.invoke('cast', { abilityId, targetX, targetZ });
  }

  /** The deployed ability loadout. */
  async loadout(): Promise<KitAbility[]> {
    const body = await this.invoke('loadout', {});
    return Array.isArray(body.abilities)
      ? (body.abilities as Array<Record<string, unknown>>).map((a) => ({
          abilityId: String(a.abilityId ?? ''),
          cooldownMs: Number(a.cooldownMs ?? 0),
          resourceCost: Number(a.resourceCost ?? 0),
          range: Number(a.range ?? 0),
          kind: String(a.kind ?? ''),
        }))
      : [];
  }

  /** YOUR caster book: resource pool + live cooldowns. */
  async book() {
    return this.invoke('book', {});
  }

  /** Engine totals (casters, live projectiles, hits). */
  async status() {
    return this.invoke('status', {});
  }

  /** Parse a type-94 cast/impact server event. */
  parseAbilityEvent(bytes: Uint8Array): AbilityEvent | null {
    return parseAbilityEvent(bytes);
  }

  private async invoke(exportName: string, params: Record<string, unknown>) {
    const result = await this.engines.invoke(this.moduleName, exportName, params);
    if (!result.success) {
      throw new Error(`abilities.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }
}
