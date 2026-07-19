import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector, EngineInvokeResult } from './engine.js';
import { kitContainerProperties } from './shared.js';
import { parseContactDamage, type ContactDamageEvent } from './wire.js';

/** Options for {@link MobsKit}. Must match the deployed mob engine. */
export interface MobsKitOptions {
  /** The compute module serving `attack_mob`/`status`. Defaults to `'mob-engine'`. */
  moduleName?: string;
  /** The mob-definition container type. Defaults to `'MobDef'`. */
  defTypeName?: string;
  /** The mob slot container type. Defaults to `'Mob'`. */
  slotTypeName?: string;
}

/** A parsed mob definition container. */
export interface KitMobDef {
  containerId: string;
  displayName: string;
  mobId: string;
  maxHealth: number;
  damage: number;
  speed: number;
  hostile: boolean;
  spawnTime: string;
  properties: Record<string, unknown>;
}

/** A parsed mob slot container (durable state; live poses ride the mob lane). */
export interface KitMobSlot {
  containerId: string;
  displayName: string;
  mobId: string;
  actorUuid: string;
  health: number;
  x: number;
  y: number;
  z: number;
  /** health > 0 — the slot is live and being simulated. */
  alive: boolean;
  properties: Record<string, unknown>;
}

/** The referee's verdict for an accepted/denied attack. */
export interface KitAttackResult {
  success: boolean;
  /** Remaining health after an accepted hit. */
  health?: number;
  killed?: boolean;
  /** The referee's denial reason ("out of range", "mob not live", ...). */
  reason?: string;
}

/**
 * Runtime helpers for compute-module mob engines (the Wave 1 `mob-engine`
 * template / BWF's `bwf-mobs`): definition + slot reads off the model, the
 * refereed `attack_mob` invoke, and the type-77 contact-damage event parser.
 *
 * Live mob poses arrive on the actor stream (FLAG_MOB, container-id
 * suffix) — decode them with `kit/wire`'s {@link engineLanes} +
 * `enginePoseCodec` in your world session; this kit reads the durable side.
 *
 * Obtained via `client.kit(appId).mobs`.
 */
export class MobsKit {
  private readonly moduleName: string;
  private readonly defTypeName: string;
  private readonly slotTypeName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly engines: EngineDetector,
    options: MobsKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'mob-engine';
    this.defTypeName = options.defTypeName ?? 'MobDef';
    this.slotTypeName = options.slotTypeName ?? 'Mob';
  }

  /** Is the mob engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /**
   * Attack a live mob slot through the server referee: presence, range and
   * damage clamps are validated engine-side before health moves. Denials
   * resolve with `success: false` and the referee's `reason`.
   */
  async attack(containerId: string, amount = 1): Promise<KitAttackResult> {
    const result: EngineInvokeResult = await this.engines.invoke(
      this.moduleName,
      'attack_mob',
      { containerId, amount },
    );
    return {
      success: result.success,
      health: typeof result.body.health === 'number' ? result.body.health : undefined,
      killed: typeof result.body.killed === 'boolean' ? result.body.killed : undefined,
      reason: result.reason,
    };
  }

  /** The engine's `status` snapshot (mob/def counts, tick counter). */
  async status(): Promise<EngineInvokeResult> {
    return this.engines.invoke(this.moduleName, 'status');
  }

  /** List mob definitions with parsed stats. */
  async defs(): Promise<KitMobDef[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.defTypeName,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          mobId: String(props.mob_id ?? ''),
          maxHealth: Number(props.max_health ?? 0),
          damage: Number(props.damage ?? 0),
          speed: Number(props.speed ?? 0),
          hostile: props.hostile === true || props.hostile === 'true',
          spawnTime: String(props.spawn_time ?? 'any'),
          properties: props,
        };
      }),
    );
  }

  /** List mob slots (durable positions/health; `alive` = health > 0). */
  async slots(): Promise<KitMobSlot[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.slotTypeName,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        const health = Number(props.health ?? 0);
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          mobId: String(props.mob_id ?? ''),
          actorUuid: String(props.actor_uuid ?? ''),
          health,
          x: Number(props.x ?? 0),
          y: Number(props.y ?? 0),
          z: Number(props.z ?? 0),
          alive: health > 0,
          properties: props,
        };
      }),
    );
  }

  /**
   * Parse a server-event payload as engine contact damage (type 77), or
   * null when it is another event type. Feed it your world session's
   * server-event stream and apply the damage to your own player when
   * `targetUuid` matches your actor uuid.
   */
  parseContactDamage(payload: Uint8Array): ContactDamageEvent | null {
    return parseContactDamage(payload);
  }
}
