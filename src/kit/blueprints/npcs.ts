import type {
  FunctionMutationInput,
  FunctionParamInput,
  Scalars,
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  toSnakeCase,
  type KitAutomationSpec,
  type KitAutomationTriggerSpec,
  type KitBlueprint,
  type KitSelectorSpec,
} from './core.js';

/** A trigger for an NPC behavior: a schedule (interval or cron) or a model event. */
export type NpcBehaviorTrigger =
  | { intervalMs: number }
  | { cronExpr: string }
  | {
      onEvent: 'function_invoked' | 'property_changed' | 'container_created';
      functionName?: string;
      containerTypeName?: string;
      propertyKey?: string;
      debounceMs?: number;
    };

/** One server-driven NPC behavior: a model function plus the automation that drives it. */
export interface NpcBehaviorSpec {
  /**
   * Automation name (unique per app), e.g. `'npc-wander'`. Also derives the
   * default function name (`npc_wander`).
   */
  name: string;
  /** Entry-point function name. Defaults to the snake-cased behavior name. */
  functionName?: string;
  /** The property writes the behavior performs each tick. */
  mutations: FunctionMutationInput[];
  /** Typed parameters (bind them from a selector or static `paramsJson`). */
  parameters?: FunctionParamInput[];
  /** What makes the behavior run. */
  trigger: NpcBehaviorTrigger;
  /**
   * Selector choosing/filtering targets and binding params (see the Game API
   * "Autonomous Processes → Selectors" guide), including grid-permission
   * predicates ({@link KitSelectorSpec}). JSON-encoded at deploy.
   */
  selector?: KitSelectorSpec;
  /**
   * Convenience: only NPCs whose `role` property equals this act (adds a
   * `selfWhere` filter when no explicit `selector` is given).
   */
  role?: string;
  /** Fan-out cap per run. Defaults to 8. */
  maxTargets?: number;
  /** Static params merged into every call. */
  params?: Record<string, unknown>;
  /** Identity the automation acts as; omit for a trusted server caller. */
  runAsUserId?: Scalars['BigInt']['input'];
}

/** Options for {@link npcBlueprint}. */
export interface NpcBlueprintOptions {
  /** NPC container type name. Defaults to `'Npc'`. */
  typeName?: string;
  /**
   * Extra property definitions beyond the defaults (`role`, `x`, `y`, `z`,
   * `behavior_state`, `health`). `containerTypeName` is filled in.
   */
  extraProperties?: Omit<SeedPropertyDefInput, 'containerTypeName'>[];
  /** The server-driven behaviors this NPC archetype has. */
  behaviors: NpcBehaviorSpec[];
}

/** Compute the function/automation names an NPC behavior deploys under. */
export function npcBehaviorFunctionName(behavior: NpcBehaviorSpec): string {
  return behavior.functionName ?? toSnakeCase(behavior.name);
}

/**
 * Blueprint for an **NPC archetype**: an admin-instantiable container type
 * holding the NPC's durable state, one `autonomousInvocable` model function
 * per behavior (gated `is_automation` so players cannot puppet them), and the
 * automations + event triggers that drive those behaviors on the server.
 *
 * Runtime counterpart: `client.kit(appId).npcs`.
 */
export function npcBlueprint(options: NpcBlueprintOptions): KitBlueprint {
  const typeName = options.typeName ?? 'Npc';
  if (options.behaviors.length === 0) {
    throw new Error('npcBlueprint requires at least one behavior');
  }

  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: typeName,
      key: 'role',
      valueType: 'string',
      defaultValueJson: '""',
    },
    { containerTypeName: typeName, key: 'x', valueType: 'float', defaultValueJson: '0' },
    { containerTypeName: typeName, key: 'y', valueType: 'float', defaultValueJson: '0' },
    { containerTypeName: typeName, key: 'z', valueType: 'float', defaultValueJson: '0' },
    {
      containerTypeName: typeName,
      key: 'behavior_state',
      valueType: 'string',
      defaultValueJson: '"idle"',
    },
    {
      containerTypeName: typeName,
      key: 'health',
      valueType: 'int',
      defaultValueJson: '100',
    },
    ...(options.extraProperties ?? []).map((p) => ({
      ...p,
      containerTypeName: typeName,
    })),
  ];

  const functions: SeedFunctionInput[] = [];
  const automations: KitAutomationSpec[] = [];
  const automationTriggers: KitAutomationTriggerSpec[] = [];

  for (const behavior of options.behaviors) {
    const functionName = npcBehaviorFunctionName(behavior);
    functions.push({
      name: functionName,
      containerTypeName: typeName,
      parameters: behavior.parameters,
      mutations: behavior.mutations,
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description: `Server-driven NPC behavior for the '${behavior.name}' automation.`,
    });

    const selector =
      behavior.selector ??
      (behavior.role !== undefined
        ? { selfWhere: [{ key: 'role', op: '==', value: behavior.role }] }
        : undefined);

    const automation: KitAutomationSpec = {
      name: behavior.name,
      functionName,
      targetMode: 'type',
      targetTypeName: typeName,
      maxTargets: behavior.maxTargets ?? 8,
      ...(selector ? { selectorJson: JSON.stringify(selector) } : {}),
      ...(behavior.params ? { paramsJson: JSON.stringify(behavior.params) } : {}),
      ...(behavior.runAsUserId !== undefined
        ? { runAsUserId: behavior.runAsUserId }
        : {}),
    };

    if ('intervalMs' in behavior.trigger) {
      automation.triggerType = 'schedule';
      automation.scheduleKind = 'interval';
      automation.intervalMs = behavior.trigger.intervalMs;
    } else if ('cronExpr' in behavior.trigger) {
      automation.triggerType = 'schedule';
      automation.scheduleKind = 'cron';
      automation.cronExpr = behavior.trigger.cronExpr;
    } else {
      automation.triggerType = 'event';
      automationTriggers.push({
        automationName: behavior.name,
        onEvent: behavior.trigger.onEvent,
        ...(behavior.trigger.functionName !== undefined
          ? { functionName: behavior.trigger.functionName }
          : {}),
        ...(behavior.trigger.containerTypeName !== undefined
          ? { containerTypeName: behavior.trigger.containerTypeName }
          : {}),
        ...(behavior.trigger.propertyKey !== undefined
          ? { propertyKey: behavior.trigger.propertyKey }
          : {}),
        ...(behavior.trigger.debounceMs !== undefined
          ? { debounceMs: behavior.trigger.debounceMs }
          : {}),
      });
    }

    automations.push(automation);
  }

  return {
    name: typeName,
    containerTypes: [
      {
        typeName,
        displayName: typeName,
        instantiableBy: 'admin',
        description: 'A server-driven non-player character.',
      },
    ],
    propertyDefinitions,
    functions,
    automations,
    automationTriggers,
  };
}
