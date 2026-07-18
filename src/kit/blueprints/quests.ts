import type {
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerEqualsCaller,
  ownerMirrorProperty,
  toSnakeCase,
  trustedAuthorityFields,
  type KitAutomationSpec,
  type KitAutomationTriggerSpec,
  type KitBlueprint,
  type KitOwnerIdKind,
  type KitTrustedAuthority,
} from './core.js';

/** An event-driven quest advance: bump matching QuestProgress rows on a model event. */
export interface QuestAdvanceSpec {
  /** Automation name (unique per app), e.g. `'advance-on-craft'`. */
  name: string;
  /** Only progress rows of this quest advance. */
  questId: string;
  /** The gameplay event that advances the quest (e.g. `consume_stack` invoked). */
  onEvent: 'function_invoked' | 'property_changed' | 'container_created';
  functionName?: string;
  containerTypeName?: string;
  propertyKey?: string;
  debounceMs?: number;
  /** Progress added per event. Defaults to 1. */
  amount?: number;
  /** Progress rows advanced per event. Defaults to 8. */
  maxTargets?: number;
}

/** Options for {@link questsBlueprint}. */
export interface QuestsBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /**
   * Who may advance quest progress. Defaults to `'server'`; use
   * `'automation'` when driving progress purely through `advanceOn` event
   * automations. Never plain players — they would complete their own quests.
   */
  advanceAuthority?: KitTrustedAuthority;
  /**
   * The wallet currency property that `claim_reward` pays `reward_gold`
   * into. Defaults to `'gold'` (compose with the economy blueprint's
   * wallet).
   */
  currencyProperty?: string;
  /** Cron for the daily reset automation. Defaults to `'0 0 * * *'` (UTC midnight). */
  dailyResetCron?: string;
  /** Event automations that advance quests from gameplay functions. */
  advanceOn?: QuestAdvanceSpec[];
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link questsBlueprint} for a given prefix. */
export interface QuestsNames {
  defType: string;
  progressType: string;
  advanceFn: string;
  claimFn: string;
  resetFn: string;
  dailyResetAutomation: string;
}

/** Compute the type/function names a quests blueprint (and its runtime helper) uses. */
export function questsNames(typePrefix = ''): QuestsNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    defType: `${typePrefix}QuestDef`,
    progressType: `${typePrefix}QuestProgress`,
    advanceFn: `${fnPrefix}advance_quest`,
    claimFn: `${fnPrefix}claim_reward`,
    resetFn: `${fnPrefix}reset_daily`,
    dailyResetAutomation: `${fnPrefix.replace(/_/g, '-')}daily-quest-reset`,
  };
}

/**
 * Blueprint for **quests**: an admin `QuestDef` catalog (objective count +
 * reward spec + daily flag) and per-player `QuestProgress` rows. Progress
 * advances through trusted calls or event automations on your gameplay
 * functions; `claim_reward` marks the progress claimed AND grants the item
 * and currency rewards through `container_ref` params in ONE transaction
 * (composing with the inventory stack and economy wallet types); a **cron
 * automation** resets daily quests at midnight.
 *
 * Runtime counterpart: `client.kit(appId).quests`.
 */
export function questsBlueprint(options: QuestsBlueprintOptions = {}): KitBlueprint {
  const {
    typePrefix = '',
    advanceAuthority = 'server',
    currencyProperty = 'gold',
    dailyResetCron = '0 0 * * *',
    advanceOn = [],
    ownerIdKind: kind = 'int',
  } = options;
  const names = questsNames(typePrefix);

  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: names.defType,
      key: 'quest_id',
      valueType: 'string',
      description: 'Stable quest identifier.',
    },
    {
      containerTypeName: names.defType,
      key: 'target_count',
      valueType: 'int',
      defaultValueJson: '1',
      description: 'Objective count required to complete.',
    },
    {
      containerTypeName: names.defType,
      key: 'reward_item_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Item reward (empty for currency-only quests).',
    },
    {
      containerTypeName: names.defType,
      key: 'reward_qty',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Item reward quantity.',
    },
    {
      containerTypeName: names.defType,
      key: 'reward_gold',
      valueType: 'int',
      defaultValueJson: '0',
      description: `Currency reward paid into the '${currencyProperty}' wallet property.`,
    },
    {
      containerTypeName: names.defType,
      key: 'repeatable',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'Whether a player may accept the quest again after claiming.',
    },
    {
      containerTypeName: names.defType,
      key: 'daily',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'Whether progress resets on the daily cron.',
    },
    ownerMirrorProperty(names.progressType, kind),
    {
      containerTypeName: names.progressType,
      key: 'quest_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'The quest this row tracks.',
    },
    {
      containerTypeName: names.progressType,
      key: 'count',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Objective progress, clamped to target.',
    },
    {
      containerTypeName: names.progressType,
      key: 'target',
      valueType: 'int',
      defaultValueJson: '1',
      description: 'Objective count copied from the def at accept time.',
    },
    {
      containerTypeName: names.progressType,
      key: 'completed',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'True once count reaches target.',
    },
    {
      containerTypeName: names.progressType,
      key: 'claimed',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'True once the reward was granted (single-claim guard).',
    },
    {
      containerTypeName: names.progressType,
      key: 'daily',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'Mirrors the def; selects rows for the daily reset automation.',
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.advanceFn,
      containerTypeName: names.progressType,
      returnType: 'int',
      parameters: [
        {
          name: 'amount',
          valueType: 'int',
          required: true,
          description: 'Progress to add (negative values are ignored; clamped to target).',
        },
      ],
      mutations: [
        {
          target: 'self',
          property: 'count',
          expression: 'min(self.target, self.count + max(0, $amount))',
        },
        {
          target: 'self',
          property: 'completed',
          expression: 'self.count >= self.target',
        },
      ],
      returnExpression: 'self.count',
      ...trustedAuthorityFields(advanceAuthority),
      // Event automations must be able to run it regardless of authority.
      ...(advanceOn.length ? { autonomousInvocable: true } : {}),
      description:
        'Trusted quest progress bump (clamped to the target); completion flips server-side in the same transaction.',
    },
    {
      name: names.claimFn,
      containerTypeName: names.progressType,
      returnType: 'int',
      parameters: [
        {
          name: 'def_id',
          valueType: 'container_ref',
          required: true,
          description: 'The QuestDef holding the reward spec (must match quest_id).',
        },
        {
          name: 'to_stack_id',
          valueType: 'container_ref',
          required: true,
          description:
            'A caller-owned stack receiving the item reward (item grant is 0 when the item id does not match, e.g. currency-only quests).',
        },
        {
          name: 'wallet_id',
          valueType: 'container_ref',
          required: true,
          description: "The caller's wallet receiving the currency reward.",
        },
      ],
      mutations: [
        { target: 'self', property: 'claimed', expression: 'true' },
        {
          target: 'ref($to_stack_id)',
          property: 'quantity',
          expression:
            'ref($to_stack_id).quantity + if(ref($to_stack_id).item_id == ref($def_id).reward_item_id, ref($def_id).reward_qty, 0)',
        },
        {
          target: 'ref($wallet_id)',
          property: currencyProperty,
          expression: `ref($wallet_id).${currencyProperty} + ref($def_id).reward_gold`,
        },
      ],
      returnExpression: `ref($wallet_id).${currencyProperty}`,
      invokePolicyJson: kitPolicyJson({
        type: 'condition',
        expression: [
          ownerEqualsCaller('self.owner_user_id', kind),
          'self.count >= self.target',
          'not(self.claimed)',
          'ref($def_id).quest_id == self.quest_id',
          ownerEqualsCaller('ref($wallet_id).owner_user_id', kind),
          ownerEqualsCaller('ref($to_stack_id).owner_user_id', kind),
        ].join(' && '),
      }),
      description:
        'Turn in a completed quest: the claimed flag, item grant, and currency grant commit atomically — no double-claims, no client-chosen rewards.',
    },
    {
      name: names.resetFn,
      containerTypeName: names.progressType,
      returnType: 'bool',
      mutations: [
        { target: 'self', property: 'count', expression: '0' },
        { target: 'self', property: 'completed', expression: 'false' },
        { target: 'self', property: 'claimed', expression: 'false' },
      ],
      returnExpression: 'self.completed',
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description: 'Server-driven daily quest reset (automation-only).',
    },
  ];

  const automations: KitAutomationSpec[] = [
    {
      name: names.dailyResetAutomation,
      functionName: names.resetFn,
      targetMode: 'type',
      targetTypeName: names.progressType,
      triggerType: 'schedule',
      scheduleKind: 'cron',
      cronExpr: dailyResetCron,
      maxTargets: 500,
      selectorJson: JSON.stringify({
        selfWhere: [{ key: 'daily', op: '==', value: true }],
      }),
      description: 'Resets daily quest progress on the cron schedule.',
    },
  ];
  const automationTriggers: KitAutomationTriggerSpec[] = [];
  for (const spec of advanceOn) {
    automations.push({
      name: spec.name,
      functionName: names.advanceFn,
      targetMode: 'type',
      targetTypeName: names.progressType,
      triggerType: 'event',
      maxTargets: spec.maxTargets ?? 8,
      selectorJson: JSON.stringify({
        selfWhere: [
          { key: 'quest_id', op: '==', value: spec.questId },
          { key: 'completed', op: '==', value: false },
        ],
      }),
      paramsJson: JSON.stringify({ amount: spec.amount ?? 1 }),
      description: `Advances '${spec.questId}' progress when the gameplay event fires.`,
    });
    automationTriggers.push({
      automationName: spec.name,
      onEvent: spec.onEvent,
      ...(spec.functionName !== undefined ? { functionName: spec.functionName } : {}),
      ...(spec.containerTypeName !== undefined
        ? { containerTypeName: spec.containerTypeName }
        : {}),
      ...(spec.propertyKey !== undefined ? { propertyKey: spec.propertyKey } : {}),
      ...(spec.debounceMs !== undefined ? { debounceMs: spec.debounceMs } : {}),
    });
  }

  return {
    name: names.progressType,
    containerTypes: [
      {
        typeName: names.defType,
        displayName: names.defType,
        instantiableBy: 'admin',
        description: 'Studio quest catalog row (objective, rewards, daily flag).',
      },
      {
        typeName: names.progressType,
        displayName: names.progressType,
        instantiableBy: 'member',
        description: "A player's progress toward one quest.",
      },
    ],
    propertyDefinitions,
    functions,
    automations,
    automationTriggers,
  };
}
