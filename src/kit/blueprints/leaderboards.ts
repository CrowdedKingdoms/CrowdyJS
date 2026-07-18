import type {
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
  type KitOwnerIdKind,
  type KitTrustedAuthority,
} from './core.js';

/** Options for {@link leaderboardsBlueprint}. */
export interface LeaderboardsBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /**
   * Who may submit scores: `'host'` (the elected host referees; default),
   * `'server'` (app admins / studio backend), or `'automation'` (e.g. an
   * event automation on the match layer's `end_match`).
   */
  submitAuthority?: KitTrustedAuthority;
  /**
   * When true (default), submitting keeps the best score
   * (`max(self.score, $points)`); when false, submissions overwrite.
   */
  keepBest?: boolean;
  /**
   * When set, adds a cron automation that rolls the season: bumps `season`
   * and resets `score`/`rank` on EVERY entry (e.g. `'0 0 1 * *'` for
   * monthly seasons).
   */
  seasonCron?: string;
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link leaderboardsBlueprint} for a given prefix. */
export interface LeaderboardsNames {
  entryType: string;
  submitFn: string;
  rollSeasonFn: string;
  seasonAutomation: string;
}

/** Compute the type/function names a leaderboards blueprint (and its runtime helper) uses. */
export function leaderboardsNames(typePrefix = ''): LeaderboardsNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    entryType: `${typePrefix}LeaderboardEntry`,
    submitFn: `${fnPrefix}submit_score`,
    rollSeasonFn: `${fnPrefix}roll_season`,
    seasonAutomation: `${fnPrefix.replace(/_/g, '-')}season-roll`,
  };
}

/**
 * Blueprint for **leaderboards**: per-player `LeaderboardEntry` rows keyed
 * by a `board_id`, written only through the trusted `submit_score`
 * (host-refereed by default — configure `submitAuthority`), with optional
 * cron **season rolls**.
 *
 * Ranking is honest about the platform: container lists have no server-side
 * ORDER BY, so `kit.leaderboards.top()` fetches a board's entries and sorts
 * client-side — fine for the few hundred entries a per-app board holds.
 * Automation selectors' `pick: highest` covers server-side top-1 needs.
 *
 * Runtime counterpart: `client.kit(appId).leaderboards`.
 */
export function leaderboardsBlueprint(
  options: LeaderboardsBlueprintOptions = {},
): KitBlueprint {
  const {
    typePrefix = '',
    submitAuthority = 'host',
    keepBest = true,
    seasonCron,
    ownerIdKind: kind = 'int',
  } = options;
  const names = leaderboardsNames(typePrefix);

  const propertyDefinitions: SeedPropertyDefInput[] = [
    ownerMirrorProperty(names.entryType, kind),
    {
      containerTypeName: names.entryType,
      key: 'board_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: "Which leaderboard this entry belongs to (e.g. 'weekly_kills').",
    },
    {
      containerTypeName: names.entryType,
      key: 'score',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'The ranked score, written only through submit_score.',
    },
    {
      containerTypeName: names.entryType,
      key: 'season',
      valueType: 'int',
      defaultValueJson: '1',
      description: 'Season counter, bumped by the season-roll automation.',
    },
    {
      containerTypeName: names.entryType,
      key: 'rank',
      valueType: 'int',
      defaultValueJson: '0',
      description:
        'Optional stamped rank (0 = unstamped; ranking is client-side by default).',
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.submitFn,
      containerTypeName: names.entryType,
      returnType: 'int',
      parameters: [
        {
          name: 'points',
          valueType: 'int',
          required: true,
          description: 'The score to submit.',
        },
      ],
      mutations: [
        {
          target: 'self',
          property: 'score',
          expression: keepBest ? 'max(self.score, $points)' : '$points',
        },
      ],
      returnExpression: 'self.score',
      ...trustedAuthorityFields(submitAuthority),
      description: `Trusted score submission (${keepBest ? 'keeps the best score' : 'overwrites'}); never a plain player call.`,
    },
  ];

  const automations: KitAutomationSpec[] = [];
  if (seasonCron !== undefined) {
    functions.push({
      name: names.rollSeasonFn,
      containerTypeName: names.entryType,
      returnType: 'int',
      mutations: [
        { target: 'self', property: 'season', expression: 'self.season + 1' },
        { target: 'self', property: 'score', expression: '0' },
        { target: 'self', property: 'rank', expression: '0' },
      ],
      returnExpression: 'self.season',
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description: 'Season roll (automation-only): bumps the season and resets scores.',
    });
    automations.push({
      name: names.seasonAutomation,
      functionName: names.rollSeasonFn,
      targetMode: 'type',
      targetTypeName: names.entryType,
      triggerType: 'schedule',
      scheduleKind: 'cron',
      cronExpr: seasonCron,
      maxTargets: 500,
      description: 'Rolls every leaderboard entry into the next season on the cron.',
    });
  }

  return {
    name: names.entryType,
    containerTypes: [
      {
        typeName: names.entryType,
        displayName: names.entryType,
        instantiableBy: 'member',
        description:
          "One player's entry on one leaderboard (score writable only via submit_score).",
      },
    ],
    propertyDefinitions,
    functions,
    ...(automations.length ? { automations } : {}),
  };
}
