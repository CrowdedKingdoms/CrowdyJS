import type {
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerEqualsCaller,
  ownerMirrorProperty,
  toSnakeCase,
  type KitAutomationSpec,
  type KitBlueprint,
  type KitOwnerIdKind,
} from './core.js';

/** Options for {@link worldsimBlueprint}. */
export interface WorldsimBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /**
   * Day/night + weather: an interval automation advances `time_of_day`
   * (wrapping at `hoursPerDay`, bumping `day`), optionally re-rolls the
   * weather, and emits a **spatial notification** at the world anchor chunk
   * so nearby clients update the sky without polling. Set `false` to omit.
   * Defaults to a 60s tick, 24-hour days, weather on.
   */
  time?:
    | {
        intervalMs?: number;
        hoursPerDay?: number;
        weather?: boolean;
        /** Replication radius of the time-changed ping (chunks, 0-8). Defaults to 8. */
        notifyDistance?: number;
      }
    | false;
  /**
   * Resource-node regeneration: an interval automation raises `amount`
   * toward `max_amount` on depleted nodes; players `gather_node` into a
   * matching stack. Set `false` to omit. Defaults to a 60s tick.
   */
  nodes?: { intervalMs?: number } | false;
  /**
   * Crop growth: an interval automation advances `stage` toward
   * `max_stage`; owners `harvest` grown crops into a matching stack. Set
   * `false` to omit. Defaults to a 60s tick.
   */
  crops?: { intervalMs?: number } | false;
  /**
   * Wave spawner counters: an interval automation bumps `wave` and grows
   * `next_wave_size` — the actual entity spawning stays host-side on the
   * replication plane (the BWF hybrid). Off by default.
   */
  waves?: { intervalMs?: number; growth?: number };
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link worldsimBlueprint} for a given prefix. */
export interface WorldsimNames {
  worldStateType: string;
  nodeType: string;
  cropType: string;
  spawnerType: string;
  advanceTimeFn: string;
  setWeatherFn: string;
  regenNodeFn: string;
  gatherNodeFn: string;
  growCropFn: string;
  harvestFn: string;
  spawnWaveFn: string;
  clockAutomation: string;
  regenAutomation: string;
  growthAutomation: string;
  waveAutomation: string;
}

/** Compute the type/function names a worldsim blueprint (and its runtime helper) uses. */
export function worldsimNames(typePrefix = ''): WorldsimNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  const autoPrefix = fnPrefix.replace(/_/g, '-');
  return {
    worldStateType: `${typePrefix}WorldState`,
    nodeType: `${typePrefix}ResourceNode`,
    cropType: `${typePrefix}Crop`,
    spawnerType: `${typePrefix}WaveSpawner`,
    advanceTimeFn: `${fnPrefix}advance_time`,
    setWeatherFn: `${fnPrefix}set_weather`,
    regenNodeFn: `${fnPrefix}regen_node`,
    gatherNodeFn: `${fnPrefix}gather_node`,
    growCropFn: `${fnPrefix}grow_crop`,
    harvestFn: `${fnPrefix}harvest`,
    spawnWaveFn: `${fnPrefix}spawn_wave`,
    clockAutomation: `${autoPrefix}world-clock`,
    regenAutomation: `${autoPrefix}node-regen`,
    growthAutomation: `${autoPrefix}crop-growth`,
    waveAutomation: `${autoPrefix}wave-spawner`,
  };
}

/**
 * Blueprint for **world simulation**: day/night + weather (`WorldState`
 * singleton), regenerating `ResourceNode`s, growing `Crop`s / production
 * jobs, and `WaveSpawner` counters — all driven by interval automations on the
 * automations simulation tier (seconds, never per-frame).
 *
 * **These automations run only while the app has a player in it.** Since
 * 2026-09-01 scheduled work for an empty app is skipped and rescheduled from the
 * moment a player returns; missed runs are never made up. Design the tick to be
 * IDEMPOTENT IN ELAPSED TIME rather than to assume a fixed cadence: read the
 * clock, advance the world by however long it has been, and write the result. A
 * crop that grows by one step per tick will stall while nobody is playing; one
 * that grows by `now - lastTick` will be correct whenever anybody looks at it.
 *
 * The world clock emits a **spatial notification** at the world anchor chunk
 * each tick, so nearby clients update the sky push-style instead of polling;
 * everything else is pull-on-demand (or wire your own notify-to-pull pings).
 * Wave spawners only advance counters — actual entity spawning belongs on
 * the replication plane under host authority (the BWF hybrid).
 *
 * Runtime counterpart: `client.kit(appId).worldsim`.
 */
export function worldsimBlueprint(
  options: WorldsimBlueprintOptions = {},
): KitBlueprint {
  const { typePrefix = '', ownerIdKind: kind = 'int' } = options;
  const names = worldsimNames(typePrefix);
  const automationOnly = kitPolicyJson({ type: 'is_automation' });

  const containerTypes: KitBlueprint['containerTypes'] = [];
  const propertyDefinitions: SeedPropertyDefInput[] = [];
  const functions: SeedFunctionInput[] = [];
  const automations: KitAutomationSpec[] = [];

  // --- Day/night + weather ---------------------------------------------------
  if (options.time !== false) {
    const time = options.time === undefined ? {} : options.time;
    const hoursPerDay = time.hoursPerDay ?? 24;
    const weather = time.weather ?? true;
    const lastHour = hoursPerDay - 1;

    containerTypes.push({
      typeName: names.worldStateType,
      displayName: names.worldStateType,
      instantiableBy: 'admin',
      description: 'Singleton world clock/weather state (create one via kit.worldsim.ensureWorld).',
    });
    propertyDefinitions.push(
      {
        containerTypeName: names.worldStateType,
        key: 'time_of_day',
        valueType: 'int',
        defaultValueJson: '0',
        description: `In-game hour, 0..${lastHour}, advanced by the world-clock automation.`,
      },
      {
        containerTypeName: names.worldStateType,
        key: 'day',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'In-game day counter (bumps when the clock wraps).',
      },
      {
        containerTypeName: names.worldStateType,
        key: 'weather',
        valueType: 'string',
        defaultValueJson: '"clear"',
        description: "Current weather: 'clear' | 'rain' | 'storm'.",
      },
      {
        containerTypeName: names.worldStateType,
        key: 'cx',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'Anchor chunk of the time-changed spatial notification.',
      },
      {
        containerTypeName: names.worldStateType,
        key: 'cy',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'Anchor chunk (y).',
      },
      {
        containerTypeName: names.worldStateType,
        key: 'cz',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'Anchor chunk (z).',
      },
    );
    functions.push({
      name: names.advanceTimeFn,
      containerTypeName: names.worldStateType,
      returnType: 'int',
      mutations: [
        {
          target: 'self',
          property: 'day',
          expression: `if(self.time_of_day >= ${lastHour}, self.day + 1, self.day)`,
        },
        {
          target: 'self',
          property: 'time_of_day',
          expression: `(self.time_of_day + 1) % ${hoursPerDay}`,
        },
        ...(weather
          ? [
              {
                target: 'self',
                property: 'weather',
                expression:
                  'if(rand() < 0.7, "clear", if(rand() < 0.5, "rain", "storm"))',
              },
            ]
          : []),
      ],
      returnExpression: 'self.time_of_day',
      invokePolicyJson: automationOnly,
      autonomousInvocable: true,
      notifications: [
        {
          kind: 'spatial',
          args: [
            { name: 'chunk_x', expression: 'self.cx' },
            { name: 'chunk_y', expression: 'self.cy' },
            { name: 'chunk_z', expression: 'self.cz' },
            { name: 'event_type', expression: '1' },
            { name: 'state', expression: 'to_string(self.time_of_day)' },
            { name: 'distance', expression: String(time.notifyDistance ?? 8) },
          ],
        },
      ],
      description:
        'World-clock tick (automation-only): advances the hour/day, re-rolls weather, and pushes a spatial time-changed ping so nearby clients skip polling.',
    });
    if (weather) {
      functions.push({
        name: names.setWeatherFn,
        containerTypeName: names.worldStateType,
        returnType: 'string',
        parameters: [
          {
            name: 'weather',
            valueType: 'string',
            required: true,
            description: "The weather to force (e.g. 'storm').",
          },
        ],
        mutations: [
          { target: 'self', property: 'weather', expression: '$weather' },
        ],
        returnExpression: 'self.weather',
        // not(allow) denies everyone — app admins bypass invoke policies,
        // making this an admin-only lever.
        invokePolicyJson: kitPolicyJson({ type: 'not', rule: { type: 'allow' } }),
        description: 'Force the weather (app admins only — everyone else is denied).',
      });
    }
    automations.push({
      name: names.clockAutomation,
      functionName: names.advanceTimeFn,
      targetMode: 'type',
      targetTypeName: names.worldStateType,
      triggerType: 'schedule',
      scheduleKind: 'interval',
      intervalMs: time.intervalMs ?? 60000,
      maxTargets: 1,
      description: 'Advances the world clock (and weather) every tick.',
    });
  }

  // --- Resource nodes ----------------------------------------------------------
  if (options.nodes !== false) {
    const nodes = options.nodes === undefined ? {} : options.nodes;
    containerTypes.push({
      typeName: names.nodeType,
      displayName: names.nodeType,
      instantiableBy: 'admin',
      description: 'A shared harvestable resource node that regenerates server-side.',
    });
    propertyDefinitions.push(
      {
        containerTypeName: names.nodeType,
        key: 'node_id',
        valueType: 'string',
        defaultValueJson: '""',
        description: 'Stable node identifier.',
      },
      {
        containerTypeName: names.nodeType,
        key: 'resource_item_id',
        valueType: 'string',
        defaultValueJson: '""',
        description: 'The item gathering yields (matched against the stack).',
      },
      {
        containerTypeName: names.nodeType,
        key: 'amount',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'Units currently available.',
      },
      {
        containerTypeName: names.nodeType,
        key: 'max_amount',
        valueType: 'int',
        defaultValueJson: '100',
        description: 'Regeneration ceiling.',
      },
      {
        containerTypeName: names.nodeType,
        key: 'regen_rate',
        valueType: 'int',
        defaultValueJson: '1',
        description: 'Units regenerated per tick.',
      },
      {
        containerTypeName: names.nodeType,
        key: 'x',
        valueType: 'float',
        defaultValueJson: '0',
        description: 'World position (informational).',
      },
      {
        containerTypeName: names.nodeType,
        key: 'y',
        valueType: 'float',
        defaultValueJson: '0',
        description: 'World position.',
      },
      {
        containerTypeName: names.nodeType,
        key: 'z',
        valueType: 'float',
        defaultValueJson: '0',
        description: 'World position.',
      },
    );
    functions.push(
      {
        name: names.regenNodeFn,
        containerTypeName: names.nodeType,
        returnType: 'int',
        mutations: [
          {
            target: 'self',
            property: 'amount',
            expression: 'min(self.max_amount, self.amount + self.regen_rate)',
          },
        ],
        returnExpression: 'self.amount',
        invokePolicyJson: automationOnly,
        autonomousInvocable: true,
        description: 'Server-driven node regeneration tick (automation-only).',
      },
      {
        name: names.gatherNodeFn,
        containerTypeName: names.nodeType,
        returnType: 'int',
        parameters: [
          {
            name: 'amount',
            valueType: 'int',
            required: true,
            description: 'Units to gather (must not exceed the node amount).',
          },
          {
            name: 'to_stack_id',
            valueType: 'container_ref',
            required: true,
            description: 'A caller-owned stack of the node resource that receives the units.',
          },
        ],
        mutations: [
          { target: 'self', property: 'amount', expression: 'self.amount - $amount' },
          {
            target: 'ref($to_stack_id)',
            property: 'quantity',
            expression: 'ref($to_stack_id).quantity + $amount',
          },
        ],
        returnExpression: 'self.amount',
        invokePolicyJson: kitPolicyJson({
          type: 'condition',
          expression: [
            '$amount > 0',
            'self.amount >= $amount',
            'ref($to_stack_id).item_id == self.resource_item_id',
            ownerEqualsCaller('ref($to_stack_id).owner_user_id', kind),
          ].join(' && '),
        }),
        description:
          'Gather from a shared node into your stack: the node decrement and the grant commit atomically (no over-gathering races).',
      },
    );
    automations.push({
      name: names.regenAutomation,
      functionName: names.regenNodeFn,
      targetMode: 'type',
      targetTypeName: names.nodeType,
      triggerType: 'schedule',
      scheduleKind: 'interval',
      intervalMs: nodes.intervalMs ?? 60000,
      maxTargets: 64,
      selectorJson: JSON.stringify({
        selfWhere: [{ key: 'amount', op: '<', value: 'self.max_amount' }],
      }),
      description: 'Regenerates depleted resource nodes.',
    });
  }

  // --- Crops / production jobs -------------------------------------------------
  if (options.crops !== false) {
    const crops = options.crops === undefined ? {} : options.crops;
    containerTypes.push({
      typeName: names.cropType,
      displayName: names.cropType,
      instantiableBy: 'member',
      description: 'A planted crop / production job that matures server-side.',
    });
    propertyDefinitions.push(
      ownerMirrorProperty(names.cropType, kind),
      {
        containerTypeName: names.cropType,
        key: 'stage',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'Growth stage, advanced by the crop-growth automation.',
      },
      {
        containerTypeName: names.cropType,
        key: 'max_stage',
        valueType: 'int',
        defaultValueJson: '3',
        description: 'Stage at which the crop is harvestable.',
      },
      {
        containerTypeName: names.cropType,
        key: 'output_item_id',
        valueType: 'string',
        defaultValueJson: '""',
        description: 'The item harvesting yields.',
      },
      {
        containerTypeName: names.cropType,
        key: 'output_qty',
        valueType: 'int',
        defaultValueJson: '1',
        description: 'Units yielded per harvest.',
      },
    );
    functions.push(
      {
        name: names.growCropFn,
        containerTypeName: names.cropType,
        returnType: 'int',
        mutations: [
          {
            target: 'self',
            property: 'stage',
            expression: 'min(self.stage + 1, self.max_stage)',
          },
        ],
        returnExpression: 'self.stage',
        invokePolicyJson: automationOnly,
        autonomousInvocable: true,
        description: 'Server-driven growth tick (automation-only).',
      },
      {
        name: names.harvestFn,
        containerTypeName: names.cropType,
        returnType: 'int',
        parameters: [
          {
            name: 'to_stack_id',
            valueType: 'container_ref',
            required: true,
            description: 'A caller-owned stack of the output item that receives the yield.',
          },
        ],
        mutations: [
          { target: 'self', property: 'stage', expression: '0' },
          {
            target: 'ref($to_stack_id)',
            property: 'quantity',
            expression: 'ref($to_stack_id).quantity + self.output_qty',
          },
        ],
        returnExpression: 'self.output_qty',
        invokePolicyJson: kitPolicyJson({
          type: 'and',
          rules: [
            { type: 'owner_of_self' },
            {
              type: 'condition',
              expression: [
                'self.stage >= self.max_stage',
                'ref($to_stack_id).item_id == self.output_item_id',
                ownerEqualsCaller('ref($to_stack_id).owner_user_id', kind),
              ].join(' && '),
            },
          ],
        }),
        description:
          'Harvest a grown crop: the stage reset and the yield grant commit atomically; regrows via the automation.',
      },
    );
    automations.push({
      name: names.growthAutomation,
      functionName: names.growCropFn,
      targetMode: 'type',
      targetTypeName: names.cropType,
      triggerType: 'schedule',
      scheduleKind: 'interval',
      intervalMs: crops.intervalMs ?? 60000,
      maxTargets: 128,
      selectorJson: JSON.stringify({
        selfWhere: [{ key: 'stage', op: '<', value: 'self.max_stage' }],
      }),
      description: 'Advances growing crops one stage per tick.',
    });
  }

  // --- Wave spawners -------------------------------------------------------------
  if (options.waves) {
    containerTypes.push({
      typeName: names.spawnerType,
      displayName: names.spawnerType,
      instantiableBy: 'admin',
      description:
        'A wave counter the server advances; entity spawning stays host-side on the replication plane.',
    });
    propertyDefinitions.push(
      {
        containerTypeName: names.spawnerType,
        key: 'wave',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'Current wave number.',
      },
      {
        containerTypeName: names.spawnerType,
        key: 'next_wave_size',
        valueType: 'int',
        defaultValueJson: '5',
        description: 'Entities the host should spawn for the next wave.',
      },
    );
    functions.push({
      name: names.spawnWaveFn,
      containerTypeName: names.spawnerType,
      returnType: 'int',
      mutations: [
        { target: 'self', property: 'wave', expression: 'self.wave + 1' },
        {
          target: 'self',
          property: 'next_wave_size',
          expression: `self.next_wave_size + ${options.waves.growth ?? 1}`,
        },
      ],
      returnExpression: 'self.wave',
      invokePolicyJson: automationOnly,
      autonomousInvocable: true,
      description:
        'Server-driven wave advance (automation-only): bumps the counters the host reads to spawn entities.',
    });
    automations.push({
      name: names.waveAutomation,
      functionName: names.spawnWaveFn,
      targetMode: 'type',
      targetTypeName: names.spawnerType,
      triggerType: 'schedule',
      scheduleKind: 'interval',
      intervalMs: options.waves.intervalMs ?? 60000,
      maxTargets: 16,
      description: 'Advances wave counters on schedule.',
    });
  }

  if (!containerTypes.length) {
    throw new Error('worldsimBlueprint has every feature disabled — nothing to build');
  }

  return {
    name: names.worldStateType,
    containerTypes,
    propertyDefinitions,
    functions,
    automations,
  };
}
