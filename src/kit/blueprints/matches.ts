import type {
  FunctionNotificationInput,
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerMirrorProperty,
  toSnakeCase,
  trustedAuthorityFields,
  type KitAutomationSpec,
  type KitBlueprint,
  type KitInvokePolicy,
  type KitOwnerIdKind,
  type KitTrustedAuthority,
} from './core.js';

/** Options for {@link matchesBlueprint}. */
export interface MatchesBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /**
   * Who may submit points to a `Score` row. Defaults to `'host'` (the
   * elected host referees); use `'server'` or `'automation'` for
   * server-refereed modes. Never plain players.
   */
  scoreAuthority?: KitTrustedAuthority;
  /**
   * When set, adds a `turn_tick` interval automation that increments each
   * active match's `tick_count` — the wall-clock-free timer primitive: store
   * the tick at turn start and treat `tick_count - turn_started_tick >= N`
   * as a timeout (there is no `now()` in expressions; counters replace
   * clocks).
   */
  turnTick?: { intervalMs: number };
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link matchesBlueprint} for a given prefix. */
export interface MatchesNames {
  metaType: string;
  scoreType: string;
  startFn: string;
  advanceRoundFn: string;
  scoreFn: string;
  endFn: string;
  turnTickFn: string;
  turnTickAutomation: string;
}

/** Compute the type/function names a matches blueprint (and its runtime helper) uses. */
export function matchesNames(typePrefix = ''): MatchesNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    metaType: `${typePrefix}MatchMeta`,
    scoreType: `${typePrefix}Score`,
    startFn: `${fnPrefix}start_match`,
    advanceRoundFn: `${fnPrefix}advance_round`,
    scoreFn: `${fnPrefix}score_points`,
    endFn: `${fnPrefix}end_match`,
    turnTickFn: `${fnPrefix}turn_tick`,
    turnTickAutomation: `${fnPrefix.replace(/_/g, '-')}match-turn-tick`,
  };
}

/** The channel ping every lifecycle function emits post-commit (notify-to-pull). */
function matchChangedNotification(): FunctionNotificationInput {
  return {
    kind: 'channel',
    args: [
      { name: 'channel_id', expression: 'self.channel_id' },
      { name: 'payload', expression: '"match_changed"' },
    ],
  };
}

/**
 * Blueprint for **matches** (lobbies, rounds, turns, scoring) — the
 * session-layer wrapper every session game needs. Sessions ARE the match
 * primitive (participants + current turn); this adds a session-scoped
 * `MatchMeta` (lobby state, round, winner, notification channel) and
 * per-player `Score` rows.
 *
 * Lifecycle functions (`start_match` / `advance_round` / `end_match`) are
 * creator-or-host gated and declare a **channel notification** — Buddy pings
 * every channel member post-commit with `"match_changed"`, and clients
 * re-pull the meta (the notify-to-pull pattern; `kit.matches.onMatchChanged`
 * wraps the subscription). Turn order itself uses the platform's
 * `gameModelSetSessionTurn` (the runtime helper calls it — turn authority is
 * enforced by the service, not an expression).
 *
 * End-of-match hooks: attach an event automation to `end_match`
 * (`function_invoked`) to submit leaderboard scores or adjust ratings.
 *
 * Runtime counterpart: `client.kit(appId).matches`.
 */
export function matchesBlueprint(options: MatchesBlueprintOptions = {}): KitBlueprint {
  const {
    typePrefix = '',
    scoreAuthority = 'host',
    turnTick,
    ownerIdKind: kind = 'int',
  } = options;
  const names = matchesNames(typePrefix);

  const creatorOrHost = (stateCondition: string): string => {
    const rules: KitInvokePolicy[] = [
      {
        type: 'or',
        rules: [
          { type: 'is_host' },
          { type: 'condition', expression: 'self.creator_user_id == $caller_user_id' },
        ],
      },
      { type: 'condition', expression: stateCondition },
    ];
    return kitPolicyJson({ type: 'and', rules });
  };

  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: names.metaType,
      key: 'creator_user_id',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'The user who created the match (may start/advance/end it).',
    },
    {
      containerTypeName: names.metaType,
      key: 'mode',
      valueType: 'string',
      defaultValueJson: '""',
      description: "App-defined mode label (e.g. 'ranked', 'ffa').",
    },
    {
      containerTypeName: names.metaType,
      key: 'state',
      valueType: 'string',
      defaultValueJson: '"lobby"',
      description: "Match lifecycle: 'lobby' | 'active' | 'finished'.",
    },
    {
      containerTypeName: names.metaType,
      key: 'round',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Current round (0 in the lobby).',
    },
    {
      containerTypeName: names.metaType,
      key: 'max_players',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Advertised player cap (0 = unlimited).',
    },
    {
      containerTypeName: names.metaType,
      key: 'winner_user_id',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Set by end_match (0 while unresolved).',
    },
    {
      containerTypeName: names.metaType,
      key: 'channel_id',
      valueType: 'int',
      defaultValueJson: '0',
      description:
        'The per-match channel lifecycle notifications ping (notify-to-pull).',
    },
    ...(turnTick
      ? [
          {
            containerTypeName: names.metaType,
            key: 'tick_count',
            valueType: 'int',
            defaultValueJson: '0',
            description:
              'Monotonic counter bumped by the turn-tick automation (the wall-clock-free timer).',
          },
        ]
      : []),
    ownerMirrorProperty(names.scoreType, kind),
    {
      containerTypeName: names.scoreType,
      key: 'points',
      valueType: 'int',
      defaultValueJson: '0',
      description: "One player's score in the match.",
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.startFn,
      containerTypeName: names.metaType,
      returnType: 'string',
      mutations: [
        { target: 'self', property: 'state', expression: '"active"' },
        { target: 'self', property: 'round', expression: '1' },
      ],
      returnExpression: 'self.state',
      invokePolicyJson: creatorOrHost('self.state == "lobby"'),
      notifications: [matchChangedNotification()],
      description:
        'Start the match (creator or host): lobby → active, round 1; pings the match channel post-commit.',
    },
    {
      name: names.advanceRoundFn,
      containerTypeName: names.metaType,
      returnType: 'int',
      mutations: [{ target: 'self', property: 'round', expression: 'self.round + 1' }],
      returnExpression: 'self.round',
      invokePolicyJson: creatorOrHost('self.state == "active"'),
      notifications: [matchChangedNotification()],
      description:
        'Advance to the next round (creator or host); pings the match channel post-commit.',
    },
    {
      name: names.endFn,
      containerTypeName: names.metaType,
      returnType: 'string',
      parameters: [
        {
          name: 'winner_user_id',
          valueType: 'int',
          required: true,
          description: 'The winning user (0 for a draw).',
        },
      ],
      mutations: [
        { target: 'self', property: 'state', expression: '"finished"' },
        { target: 'self', property: 'winner_user_id', expression: '$winner_user_id' },
      ],
      returnExpression: 'self.state',
      invokePolicyJson: creatorOrHost('self.state == "active"'),
      notifications: [matchChangedNotification()],
      description:
        'Finish the match and record the winner (creator or host); attach an event automation to this function for rating/leaderboard hooks.',
    },
    {
      name: names.scoreFn,
      containerTypeName: names.scoreType,
      returnType: 'int',
      parameters: [
        {
          name: 'points',
          valueType: 'int',
          required: true,
          description: 'Signed points to add.',
        },
      ],
      mutations: [
        { target: 'self', property: 'points', expression: 'self.points + $points' },
      ],
      returnExpression: 'self.points',
      ...trustedAuthorityFields(scoreAuthority),
      description:
        "Add points to a player's Score row — trusted (host-refereed by default).",
    },
  ];

  const automations: KitAutomationSpec[] = [];
  if (turnTick) {
    functions.push({
      name: names.turnTickFn,
      containerTypeName: names.metaType,
      returnType: 'int',
      mutations: [
        { target: 'self', property: 'tick_count', expression: 'self.tick_count + 1' },
      ],
      returnExpression: 'self.tick_count',
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description:
        'Server-driven timer tick for active matches (counters instead of wall clocks — expressions have no now()).',
    });
    automations.push({
      name: names.turnTickAutomation,
      functionName: names.turnTickFn,
      targetMode: 'type',
      targetTypeName: names.metaType,
      triggerType: 'schedule',
      scheduleKind: 'interval',
      intervalMs: turnTick.intervalMs,
      maxTargets: 64,
      selectorJson: JSON.stringify({
        selfWhere: [{ key: 'state', op: '==', value: 'active' }],
      }),
      description: 'Bumps tick_count on active matches (turn-timeout timer source).',
    });
  }

  return {
    name: names.metaType,
    containerTypes: [
      {
        typeName: names.metaType,
        displayName: names.metaType,
        instantiableBy: 'member',
        description:
          'Session-scoped match record: lobby state, round, winner, notification channel.',
      },
      {
        typeName: names.scoreType,
        displayName: names.scoreType,
        instantiableBy: 'member',
        description: "One player's session-scoped score row.",
      },
    ],
    propertyDefinitions,
    functions,
    ...(automations.length ? { automations } : {}),
  };
}
