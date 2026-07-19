import type { SeedFunctionInput, SeedPropertyDefInput } from '../../generated/graphql.js';
import {
  kitPolicyJson,
  toSnakeCase,
  trustedAuthorityFields,
  type KitBlueprint,
  type KitTrustedAuthority,
} from './core.js';

/** Options for {@link liveopsBlueprint}. */
export interface LiveopsBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /**
   * Who may open/close windows and roll seasons: `'server'` (app admins /
   * studio backend; default) or `'automation'` (cron-driven flips).
   */
  adminAuthority?: KitTrustedAuthority;
}

/** Names derived by {@link liveopsBlueprint} for a given prefix. */
export interface LiveopsNames {
  windowType: string;
  seasonType: string;
  openWindowFn: string;
  closeWindowFn: string;
  activateSeasonFn: string;
}

/** Compute the type/function names a liveops blueprint (and its runtime helper) uses. */
export function liveopsNames(typePrefix = ''): LiveopsNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    windowType: `${typePrefix}EventWindow`,
    seasonType: `${typePrefix}SeasonDef`,
    openWindowFn: `${fnPrefix}open_window`,
    closeWindowFn: `${fnPrefix}close_window`,
    activateSeasonFn: `${fnPrefix}activate_season`,
  };
}

/**
 * Blueprint for **liveops** (matrix P4, P3): event windows, seasons, and
 * battle-pass composition — MODEL-FIRST (the coexistence policy):
 *
 * - `EventWindow` containers carry a `window_id`, an `active` flag, optional
 *   `opens_at_ms`/`closes_at_ms` timestamps, and an opaque `modifiers` JSON
 *   blob. Admin (or cron-automation) functions flip `active`; when both
 *   timestamps are set, the **liveops-scheduler compute engine** flips the
 *   flag itself and broadcasts the modifiers on the compute bus
 *   (`liveops_window_opened`/`closed`) for other engines to apply — spawn
 *   multipliers, weather locks, double gold.
 * - `SeasonDef` containers name a season (`season_id`, `active`,
 *   `starts_at_ms`/`ends_at_ms`) and its battle-pass composition: the
 *   `pass_track` is a progression-layer track name and `pass_features` a
 *   JSON array of feature gates unlocked per tier — a battle pass is a
 *   SEASON + PROGRESSION TRACK + FEATURE GATES, no new machinery.
 *
 * Runtime counterpart: `client.kit(appId).liveops`.
 */
export function liveopsBlueprint(options: LiveopsBlueprintOptions = {}): KitBlueprint {
  const { typePrefix = '', adminAuthority = 'server' } = options;
  const names = liveopsNames(typePrefix);
  const trusted = trustedAuthorityFields(adminAuthority);

  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: names.windowType,
      key: 'window_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Stable id other systems reference (unique per app by convention).',
    },
    {
      containerTypeName: names.windowType,
      key: 'active',
      valueType: 'bool',
      defaultValueJson: 'false',
      description:
        'Live flag. Flipped by the admin functions, cron automations, or the liveops-scheduler engine (timestamp windows).',
    },
    {
      containerTypeName: names.windowType,
      key: 'opens_at_ms',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Optional epoch-ms open time (with closes_at_ms, the scheduler owns the flag).',
    },
    {
      containerTypeName: names.windowType,
      key: 'closes_at_ms',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Optional epoch-ms close time.',
    },
    {
      containerTypeName: names.windowType,
      key: 'modifiers',
      valueType: 'string',
      defaultValueJson: '"{}"',
      description:
        'Opaque JSON broadcast on the compute bus when the window opens/closes (consumed by engines).',
    },
    {
      containerTypeName: names.seasonType,
      key: 'season_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Stable season id (e.g. "s3").',
    },
    {
      containerTypeName: names.seasonType,
      key: 'active',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'The one live season (activate_season deactivates the rest by convention).',
    },
    {
      containerTypeName: names.seasonType,
      key: 'starts_at_ms',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Season start (epoch ms; informational).',
    },
    {
      containerTypeName: names.seasonType,
      key: 'ends_at_ms',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Season end (epoch ms; informational).',
    },
    {
      containerTypeName: names.seasonType,
      key: 'pass_track',
      valueType: 'string',
      defaultValueJson: '""',
      description:
        "Battle-pass composition: the progression layer's track name whose tiers gate rewards.",
    },
    {
      containerTypeName: names.seasonType,
      key: 'pass_features',
      valueType: 'string',
      defaultValueJson: '"[]"',
      description:
        'Battle-pass composition: JSON array of feature-gate keys unlocked per pass tier.',
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.openWindowFn,
      containerTypeName: names.windowType,
      returnType: 'bool',
      mutations: [{ target: 'self', property: 'active', expression: 'true' }],
      returnExpression: 'self.active',
      invokePolicyJson: trusted.invokePolicyJson ?? kitPolicyJson({ type: 'is_automation' }),
      ...(trusted.autonomousInvocable !== undefined
        ? { autonomousInvocable: trusted.autonomousInvocable }
        : {}),
      description:
        'Open the window (admin/automation). The liveops-scheduler engine broadcasts the modifiers on the next tick.',
    },
    {
      name: names.closeWindowFn,
      containerTypeName: names.windowType,
      returnType: 'bool',
      mutations: [{ target: 'self', property: 'active', expression: 'false' }],
      returnExpression: 'self.active',
      invokePolicyJson: trusted.invokePolicyJson ?? kitPolicyJson({ type: 'is_automation' }),
      ...(trusted.autonomousInvocable !== undefined
        ? { autonomousInvocable: trusted.autonomousInvocable }
        : {}),
      description: 'Close the window (admin/automation).',
    },
    {
      name: names.activateSeasonFn,
      containerTypeName: names.seasonType,
      returnType: 'bool',
      mutations: [{ target: 'self', property: 'active', expression: 'true' }],
      returnExpression: 'self.active',
      invokePolicyJson: trusted.invokePolicyJson ?? kitPolicyJson({ type: 'is_automation' }),
      ...(trusted.autonomousInvocable !== undefined
        ? { autonomousInvocable: trusted.autonomousInvocable }
        : {}),
      description:
        'Activate this season (admin/automation). Deactivate the previous season separately (one live season by convention).',
    },
  ];

  return {
    name: 'liveops',
    containerTypes: [
      {
        typeName: names.windowType,
        displayName: 'Liveops event window',
        description:
          'A liveops window: active flag + optional timestamps + modifier JSON broadcast by the scheduler engine.',
      },
      {
        typeName: names.seasonType,
        displayName: 'Liveops season',
        description:
          'A season definition; battle passes compose a season with a progression track + feature gates.',
      },
    ],
    propertyDefinitions,
    functions,
  };
}
