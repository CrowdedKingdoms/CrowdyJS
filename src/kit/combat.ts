import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import { combatNames, type CombatNames } from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link CombatKit}. Must match the deployed combat blueprint. */
export interface CombatKitOptions {
  /** The `typePrefix` the combat blueprint was deployed with. */
  typePrefix?: string;
}

/** A parsed view of one combatant. */
export interface KitCombatant {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  combatKey: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  alive: boolean;
}

/** A parsed view of one status effect. */
export interface KitStatusEffect {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  effectId: string;
  targetKey: string;
  magnitude: number;
  ticksLeft: number;
}

/**
 * Runtime helpers for the {@link combatBlueprint} conventions: spawn
 * combatants, attack (server-side damage formula + death flip), arm status
 * effects the tick automation applies over time, respawn, and — with
 * `hostSynced` — persist host-simulated hp. Denials resolve with
 * `success: false`.
 *
 * Obtained via `client.kit(appId).combat`.
 */
export class CombatKit {
  private readonly names: CombatNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: CombatKitOptions = {},
  ) {
    this.names = combatNames(options.typePrefix ?? '');
  }

  /**
   * Spawn a combatant with a unique `combat_key` (the status-effect join
   * key) and the `owner_user_id` mirror.
   */
  async spawnCombatant(input: {
    ownerUserId: Scalars['BigInt']['input'];
    displayName: string;
    hp?: number;
    maxHp?: number;
    attack?: number;
    defense?: number;
    combatKey?: string;
    sessionId?: string;
    properties?: SeedPropertyInput[];
  }) {
    const combatKey =
      input.combatKey ?? `ck-${input.ownerUserId}-${Math.random().toString(16).slice(2, 10)}`;
    const maxHp = input.maxHp ?? 100;
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.combatantType,
      displayName: input.displayName,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      properties: [
        { key: 'owner_user_id', valueType: 'int', valueJson: String(input.ownerUserId) },
        { key: 'combat_key', valueType: 'string', valueJson: JSON.stringify(combatKey) },
        { key: 'hp', valueType: 'int', valueJson: String(input.hp ?? maxHp) },
        { key: 'max_hp', valueType: 'int', valueJson: String(maxHp) },
        { key: 'attack', valueType: 'int', valueJson: String(input.attack ?? 10) },
        { key: 'defense', valueType: 'int', valueJson: String(input.defense ?? 0) },
        ...(input.properties ?? []),
      ],
    });
  }

  /** Read one combatant's state. */
  async state(combatantId: string): Promise<KitCombatant> {
    const container = await this.gameModel.container({
      appId: this.appId,
      containerId: combatantId,
    });
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      combatantId,
    );
    return {
      containerId: container.containerId,
      displayName: container.displayName,
      ownerUserId: container.ownerUserId != null ? String(container.ownerUserId) : null,
      combatKey: String(props.combat_key ?? ''),
      hp: Number(props.hp ?? 0),
      maxHp: Number(props.max_hp ?? 0),
      attack: Number(props.attack ?? 0),
      defense: Number(props.defense ?? 0),
      alive: props.alive === true,
    };
  }

  /**
   * Attack a target with your combatant. The damage formula and the death
   * flip run server-side. Resolves with the target's remaining hp.
   */
  async attack(
    attackerId: string,
    targetId: string,
  ): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.attackFn,
      selfContainerId: attackerId,
      params: { target_id: targetId },
    });
  }

  /**
   * Arm a status effect against a target's `combat_key`: creates the
   * caller's StatusEffect container (when `effectContainerId` is omitted)
   * and invokes the gated apply function; the interval automation then
   * ticks it server-side.
   */
  async applyEffect(input: {
    targetKey: string;
    effectId: string;
    magnitude: number;
    ticks: number;
    effectContainerId?: string;
    sessionId?: string;
  }): Promise<KitInvokeResult<number>> {
    let effectId = input.effectContainerId;
    if (!effectId) {
      const created = await this.gameModel.createContainer({
        appId: this.appId,
        typeName: this.names.effectType,
        displayName: `Effect ${input.effectId}`,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      });
      effectId = created.containerId;
    }
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.applyEffectFn,
      selfContainerId: effectId,
      params: {
        target_key: input.targetKey,
        effect_id: input.effectId,
        magnitude: input.magnitude,
        ticks: input.ticks,
      },
    });
  }

  /** List the active status effects targeting a combat_key. */
  async effects(targetKey?: string): Promise<KitStatusEffect[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.effectType,
    });
    const all = await Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          effectId: String(props.effect_id ?? ''),
          targetKey: String(props.target_key ?? ''),
          magnitude: Number(props.magnitude ?? 0),
          ticksLeft: Number(props.ticks_left ?? 0),
        };
      }),
    );
    return all.filter(
      (e) =>
        e.ticksLeft > 0 && (targetKey === undefined || e.targetKey === targetKey),
    );
  }

  /** Respawn your downed combatant at full hp. */
  async respawn(combatantId: string): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.respawnFn,
      selfContainerId: combatantId,
      params: {},
    });
  }

  /** Revive a downed combatant (blueprint deployed with `reviveGroup`). */
  async revive(combatantId: string): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.reviveFn,
      selfContainerId: combatantId,
      params: {},
    });
  }

  /**
   * Persist host-simulated hp (blueprint deployed with `hostSynced: true`;
   * `is_host` enforced server-side). Resolves with the clamped hp.
   */
  async syncCombatant(
    combatantId: string,
    hp: number,
  ): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.syncFn,
      selfContainerId: combatantId,
      params: { hp },
    });
  }
}
