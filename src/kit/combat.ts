import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import { combatNames, type CombatNames } from './blueprints/index.js';
import type { EngineDetector } from './engine.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link CombatKit}. Must match the deployed combat blueprint. */
export interface CombatKitOptions {
  /** The `typePrefix` the combat blueprint was deployed with. */
  typePrefix?: string;
  /**
   * The compute module whose referee serves `attack_mob` when the app runs
   * an engine. Defaults to `'mob-engine'`.
   */
  engineModuleName?: string;
}

/** The verdict of a routed attack ({@link CombatKit.attackRouted}). */
export interface KitRoutedAttack {
  success: boolean;
  /** The target's remaining health/hp after an accepted hit. */
  health?: number;
  killed?: boolean;
  /** The denial reason (engine referee) or error message (model path). */
  reason?: string;
  /** Which authority resolved the attack. */
  via: 'engine' | 'model';
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
  private readonly engineModuleName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: CombatKitOptions = {},
    private readonly engines?: EngineDetector,
  ) {
    this.names = combatNames(options.typePrefix ?? '');
    this.engineModuleName = options.engineModuleName ?? 'mob-engine';
  }

  /**
   * Route an attack through the strongest available authority: the compute
   * referee (`attack_mob` on the mob engine — presence/range validated
   * server-side) when the engine is deployed (capability-detected, cached),
   * else today's model attack function. One call, both deployments.
   *
   * @param input.targetId - The target container (engine mob slot or model
   *   combatant).
   * @param input.attackerId - The caller's combatant container — required
   *   for the model path, ignored by the engine referee (it referees by the
   *   caller's live actor position).
   * @param input.amount - Engine-path damage (clamped by the referee).
   */
  async attackRouted(input: {
    targetId: string;
    attackerId?: string;
    amount?: number;
  }): Promise<KitRoutedAttack> {
    if (this.engines && (await this.engines.has(this.engineModuleName))) {
      const result = await this.engines.invoke(this.engineModuleName, 'attack_mob', {
        containerId: input.targetId,
        amount: input.amount ?? 1,
      });
      return {
        success: result.success,
        health: typeof result.body.health === 'number' ? result.body.health : undefined,
        killed: typeof result.body.killed === 'boolean' ? result.body.killed : undefined,
        reason: result.reason,
        via: 'engine',
      };
    }
    if (!input.attackerId) {
      return {
        success: false,
        reason: 'attackerId is required for the model combat path',
        via: 'model',
      };
    }
    const result = await this.attack(input.attackerId, input.targetId);
    return {
      success: result.success,
      health: result.returnValue,
      reason: result.errorMessage,
      via: 'model',
    };
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
