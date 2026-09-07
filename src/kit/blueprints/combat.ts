import type {
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerMirrorProperty,
  toSnakeCase,
  type KitAutomationSpec,
  type KitBlueprint,
  type KitInvokePolicy,
  type KitOwnerIdKind,
} from './core.js';

/** Options for {@link combatBlueprint}. */
export interface CombatBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /**
   * Turn-based mode: adds `is_current_turn` to the attack/apply_effect
   * policies, so only the player whose session turn it is may act. Defaults
   * to false.
   */
  turnBased?: boolean;
  /**
   * Host-synced mode for **fast** combat: adds a `sync_combatant` function
   * gated `is_host` so the elected host client can run smooth per-frame
   * combat on the replication plane and periodically write the durable hp
   * back (the Blocks-with-Friends `mob_update` precedent, with the policy
   * actually enforced). Defaults to false.
   */
  hostSynced?: boolean;
  /**
   * Interval of the status-effect tick automation, in ms (dispatcher floor
   * is seconds). Defaults to 5000.
   */
  effectTickIntervalMs?: number;
  /**
   * Who may instantiate combatants: `'member'` (player characters; the
   * default) or `'admin'` (studio-spawned mobs).
   */
  combatantInstantiableBy?: 'member' | 'admin';
  /**
   * When set, adds a `revive` function gated on this team/group permission
   * (e.g. a healer role), usable on any downed combatant.
   */
  reviveGroup?: { groupId: string; permission?: string };
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link combatBlueprint} for a given prefix. */
export interface CombatNames {
  combatantType: string;
  effectType: string;
  attackFn: string;
  applyEffectFn: string;
  effectTickFn: string;
  respawnFn: string;
  reviveFn: string;
  syncFn: string;
  effectTickAutomation: string;
}

/** Compute the type/function names a combat blueprint (and its runtime helper) uses. */
export function combatNames(typePrefix = ''): CombatNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    combatantType: `${typePrefix}Combatant`,
    effectType: `${typePrefix}StatusEffect`,
    attackFn: `${fnPrefix}attack`,
    applyEffectFn: `${fnPrefix}apply_effect`,
    effectTickFn: `${fnPrefix}effect_tick`,
    respawnFn: `${fnPrefix}respawn`,
    reviveFn: `${fnPrefix}revive`,
    syncFn: `${fnPrefix}sync_combatant`,
    effectTickAutomation: `${fnPrefix.replace(/_/g, '-')}effect-tick`,
  };
}

/**
 * Blueprint for **server-authoritative combat** (the turn-based / MMO-durable
 * tier): `Combatant` containers (hp / attack / defense / alive), an `attack`
 * function whose damage formula and death flip run entirely server-side,
 * status effects as `StatusEffect` containers ticked by an interval
 * automation (damage-over-time between requests), and respawn/revive.
 *
 * The effect tick runs only while the app has a player in it (2026-09-01), which
 * for combat is usually what you want: nothing is fighting in an empty world.
 * Store an expiry timestamp on each effect rather than a remaining-ticks counter,
 * so an effect that should have lapsed while the app was empty is treated as
 * lapsed on the next tick instead of resuming with time left on it.
 *
 * The effect tick uses the selector **join** pattern: each combatant carries
 * a unique `combat_key`, effects record a `target_key`, and the automation's
 * selector binds the matching combatant as a `$target` ref param
 * (`where combat_key == self.target_key`) — automations cannot follow
 * property refs directly.
 *
 * For fast-twitch combat keep the per-frame simulation on the replication
 * plane under host authority and set `hostSynced: true` to get the
 * `is_host`-gated durable sync function.
 *
 * Runtime counterpart: `client.kit(appId).combat`.
 */
export function combatBlueprint(options: CombatBlueprintOptions = {}): KitBlueprint {
  const {
    typePrefix = '',
    turnBased = false,
    hostSynced = false,
    effectTickIntervalMs = 5000,
    combatantInstantiableBy = 'member',
    reviveGroup,
    ownerIdKind: kind = 'int',
  } = options;
  const names = combatNames(typePrefix);

  const actorPolicy = (condition: string): string => {
    const rules: KitInvokePolicy[] = [
      { type: 'owner_of_self' },
      ...(turnBased ? [{ type: 'is_current_turn' } as KitInvokePolicy] : []),
      { type: 'condition', expression: condition },
    ];
    return kitPolicyJson({ type: 'and', rules });
  };

  const propertyDefinitions: SeedPropertyDefInput[] = [
    ownerMirrorProperty(names.combatantType, kind),
    {
      containerTypeName: names.combatantType,
      key: 'combat_key',
      valueType: 'string',
      defaultValueJson: '""',
      description:
        'Unique join key the status-effect automation selector matches against effect target_key.',
    },
    {
      containerTypeName: names.combatantType,
      key: 'hp',
      valueType: 'int',
      defaultValueJson: '100',
      description: 'Current hit points (never below 0).',
    },
    {
      containerTypeName: names.combatantType,
      key: 'max_hp',
      valueType: 'int',
      defaultValueJson: '100',
      description: 'Hit point ceiling (respawn/heal target).',
    },
    {
      containerTypeName: names.combatantType,
      key: 'attack',
      valueType: 'int',
      defaultValueJson: '10',
      description: 'Attack stat fed into the damage formula.',
    },
    {
      containerTypeName: names.combatantType,
      key: 'defense',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Damage reduction stat.',
    },
    {
      containerTypeName: names.combatantType,
      key: 'alive',
      valueType: 'bool',
      defaultValueJson: 'true',
      description: 'Flipped server-side when hp reaches 0.',
    },
    {
      containerTypeName: names.combatantType,
      key: 'respawn_x',
      valueType: 'float',
      defaultValueJson: '0',
      description: 'Respawn anchor (informational; movement is the replication plane).',
    },
    {
      containerTypeName: names.combatantType,
      key: 'respawn_y',
      valueType: 'float',
      defaultValueJson: '0',
      description: 'Respawn anchor.',
    },
    {
      containerTypeName: names.combatantType,
      key: 'respawn_z',
      valueType: 'float',
      defaultValueJson: '0',
      description: 'Respawn anchor.',
    },
    ownerMirrorProperty(names.effectType, kind),
    {
      containerTypeName: names.effectType,
      key: 'effect_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: "Effect identifier (e.g. 'poison', 'burn').",
    },
    {
      containerTypeName: names.effectType,
      key: 'target_key',
      valueType: 'string',
      defaultValueJson: '""',
      description: "The target combatant's combat_key (selector join key).",
    },
    {
      containerTypeName: names.effectType,
      key: 'magnitude',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Damage applied per tick.',
    },
    {
      containerTypeName: names.effectType,
      key: 'ticks_left',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Remaining ticks; the automation only selects effects above 0.',
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.attackFn,
      containerTypeName: names.combatantType,
      returnType: 'int',
      parameters: [
        {
          name: 'target_id',
          valueType: 'container_ref',
          required: true,
          description: 'The combatant being attacked.',
        },
      ],
      mutations: [
        {
          target: 'ref($target_id)',
          property: 'hp',
          expression:
            'max(0, ref($target_id).hp - max(1, self.attack - ref($target_id).defense))',
        },
        {
          target: 'ref($target_id)',
          property: 'alive',
          expression: 'ref($target_id).hp > 0',
        },
      ],
      returnExpression: 'ref($target_id).hp',
      invokePolicyJson: actorPolicy('self.alive && ref($target_id).alive'),
      description:
        'Attack a target: the damage formula (attack vs defense, min 1) and the death flip run server-side in one transaction.',
    },
    {
      name: names.applyEffectFn,
      containerTypeName: names.effectType,
      returnType: 'int',
      parameters: [
        {
          name: 'target_key',
          valueType: 'string',
          required: true,
          description: "The target combatant's combat_key.",
        },
        {
          name: 'effect_id',
          valueType: 'string',
          required: true,
          description: 'Effect identifier.',
        },
        {
          name: 'magnitude',
          valueType: 'int',
          required: true,
          description: 'Damage per tick.',
        },
        {
          name: 'ticks',
          valueType: 'int',
          required: true,
          description: 'Number of ticks the effect lasts.',
        },
      ],
      mutations: [
        { target: 'self', property: 'effect_id', expression: '$effect_id' },
        { target: 'self', property: 'target_key', expression: '$target_key' },
        { target: 'self', property: 'magnitude', expression: 'max(0, $magnitude)' },
        { target: 'self', property: 'ticks_left', expression: '$ticks' },
      ],
      returnExpression: 'self.ticks_left',
      invokePolicyJson: actorPolicy('$ticks > 0 && self.ticks_left == 0'),
      description:
        'Arm a status effect against a target combat_key; the interval automation applies it tick by tick.',
    },
    {
      name: names.effectTickFn,
      containerTypeName: names.effectType,
      returnType: 'int',
      parameters: [
        {
          name: 'target',
          valueType: 'container_ref',
          required: true,
          description:
            'The affected combatant — bound by the automation selector join (combat_key == target_key).',
        },
      ],
      mutations: [
        {
          target: 'ref($target)',
          property: 'hp',
          expression: 'max(0, ref($target).hp - self.magnitude)',
        },
        {
          target: 'ref($target)',
          property: 'alive',
          expression: 'ref($target).hp > 0',
        },
        {
          target: 'self',
          property: 'ticks_left',
          expression: 'self.ticks_left - 1',
        },
      ],
      returnExpression: 'self.ticks_left',
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description:
        'Server-driven damage-over-time tick (automation-only): applies magnitude to the joined target and decrements ticks_left.',
    },
    {
      name: names.respawnFn,
      containerTypeName: names.combatantType,
      returnType: 'int',
      mutations: [
        { target: 'self', property: 'hp', expression: 'self.max_hp' },
        { target: 'self', property: 'alive', expression: 'true' },
      ],
      returnExpression: 'self.hp',
      invokePolicyJson: kitPolicyJson({
        type: 'and',
        rules: [
          { type: 'owner_of_self' },
          { type: 'condition', expression: 'not(self.alive)' },
        ],
      }),
      description:
        'Respawn your downed combatant at full hp (move the actor to the respawn anchor client-side).',
    },
  ];

  if (reviveGroup) {
    functions.push({
      name: names.reviveFn,
      containerTypeName: names.combatantType,
      returnType: 'int',
      mutations: [
        { target: 'self', property: 'hp', expression: 'self.max_hp' },
        { target: 'self', property: 'alive', expression: 'true' },
      ],
      returnExpression: 'self.hp',
      invokePolicyJson: kitPolicyJson({
        type: 'and',
        rules: [
          {
            type: 'group_permission',
            groupId: reviveGroup.groupId,
            ...(reviveGroup.permission !== undefined
              ? { permission: reviveGroup.permission }
              : {}),
          },
          { type: 'condition', expression: 'not(self.alive)' },
        ],
      }),
      description: 'Revive any downed combatant (team/group-permission gated).',
    });
  }

  if (hostSynced) {
    functions.push({
      name: names.syncFn,
      containerTypeName: names.combatantType,
      returnType: 'int',
      parameters: [
        {
          name: 'hp',
          valueType: 'int',
          required: true,
          description: 'The host-simulated hp to persist (clamped to 0..max_hp).',
        },
      ],
      mutations: [
        { target: 'self', property: 'hp', expression: 'clamp($hp, 0, self.max_hp)' },
        { target: 'self', property: 'alive', expression: 'self.hp > 0' },
      ],
      returnExpression: 'self.hp',
      invokePolicyJson: kitPolicyJson({ type: 'is_host' }),
      description:
        'Persist host-simulated combat state (is_host enforced): the fast tier runs on the replication plane, durable hp syncs here at low frequency.',
    });
  }

  const automations: KitAutomationSpec[] = [
    {
      name: names.effectTickAutomation,
      functionName: names.effectTickFn,
      targetMode: 'type',
      targetTypeName: names.effectType,
      triggerType: 'schedule',
      scheduleKind: 'interval',
      intervalMs: effectTickIntervalMs,
      maxTargets: 32,
      selectorJson: JSON.stringify({
        selfWhere: [{ key: 'ticks_left', op: '>', value: 0 }],
        ofType: names.combatantType,
        where: [{ key: 'combat_key', op: '==', value: 'self.target_key' }],
        bindAs: { ref: 'target' },
      }),
      description:
        'Ticks active status effects: joins each effect to its target combatant and applies damage-over-time.',
    },
  ];

  return {
    name: names.combatantType,
    containerTypes: [
      {
        typeName: names.combatantType,
        displayName: names.combatantType,
        instantiableBy: combatantInstantiableBy,
        description: 'A combat participant with server-authoritative hp/stats.',
      },
      {
        typeName: names.effectType,
        displayName: names.effectType,
        instantiableBy: 'member',
        description: 'An armed status effect ticked by the server automation.',
      },
    ],
    propertyDefinitions,
    functions,
    automations,
  };
}
