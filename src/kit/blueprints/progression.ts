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
  type KitBlueprint,
  type KitOwnerIdKind,
  type KitTrustedAuthority,
} from './core.js';

/** Options for {@link progressionBlueprint}. */
export interface ProgressionBlueprintOptions {
  /**
   * Prefix applied to the container type names (`'Pvp'` → `PvpProgress` /
   * `PvpSkillDef` / …) and, snake-cased, to the function names
   * (`pvp_grant_xp`, …). Defaults to none.
   */
  typePrefix?: string;
  /**
   * Who may grant XP. Trusted grants should be `'server'` (the default),
   * `'automation'` (e.g. an event automation on a `mob_died` function), or
   * `'host'` — never plain players.
   */
  xpAuthority?: KitTrustedAuthority;
  /**
   * Who may adjust the competitive rating (the match layer's
   * `applyMatchResult` calls this). Defaults to `'host'`.
   */
  ratingAuthority?: KitTrustedAuthority;
  /**
   * The XP curve: an expression over `$level` returning the TOTAL xp required
   * to reach that level. Evaluated via the read-only `fn:` helper-call
   * pattern (`fn:xp_for_level(self.level + 1)`), so the curve lives in ONE
   * `internal` function and every reader stays in sync. Defaults to
   * `'100 * $level * $level'`.
   */
  xpForLevelExpression?: string;
  /** Skill points granted per level-up. Defaults to 1. */
  skillPointsPerLevel?: number;
  /** Initial competitive rating for new players. Defaults to 1000. */
  initialRating?: number;
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link progressionBlueprint} for a given prefix. */
export interface ProgressionNames {
  progressType: string;
  skillDefType: string;
  skillRankType: string;
  achievementDefType: string;
  achievementUnlockType: string;
  xpForLevelFn: string;
  grantXpFn: string;
  buySkillFn: string;
  unlockAchievementFn: string;
  adjustRatingFn: string;
}

/** Compute the type/function names a progression blueprint (and its runtime helper) uses. */
export function progressionNames(typePrefix = ''): ProgressionNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    progressType: `${typePrefix}Progress`,
    skillDefType: `${typePrefix}SkillDef`,
    skillRankType: `${typePrefix}SkillRank`,
    achievementDefType: `${typePrefix}AchievementDef`,
    achievementUnlockType: `${typePrefix}AchievementUnlock`,
    xpForLevelFn: `${fnPrefix}xp_for_level`,
    grantXpFn: `${fnPrefix}grant_xp`,
    buySkillFn: `${fnPrefix}spend_skill_point`,
    unlockAchievementFn: `${fnPrefix}unlock_achievement`,
    adjustRatingFn: `${fnPrefix}adjust_rating`,
  };
}

/**
 * Blueprint for **character progression**: per-player `Progress` (xp / level /
 * skill points / rating), an admin `SkillDef` catalog with prerequisite
 * chains bought into per-player `SkillRank`s, threshold `AchievementDef`s
 * unlocked into `AchievementUnlock`s, and an ELO-style `adjust_rating` hook
 * for the match layer.
 *
 * Level-ups are computed server-side inside `grant_xp` using the `fn:`
 * helper pattern: the XP curve lives in ONE `internal` function
 * (`xp_for_level`, not directly invocable) that mutation expressions call as
 * `fn:xp_for_level(self.level + 1)`. Ordered mutations see earlier writes,
 * so xp is applied first, then the skill-point award, then the level bump —
 * one level per grant (call repeatedly for multi-level jumps).
 *
 * Runtime counterpart: `client.kit(appId).progression`.
 */
export function progressionBlueprint(
  options: ProgressionBlueprintOptions = {},
): KitBlueprint {
  const {
    typePrefix = '',
    xpAuthority = 'server',
    ratingAuthority = 'host',
    xpForLevelExpression = '100 * $level * $level',
    skillPointsPerLevel = 1,
    initialRating = 1000,
    ownerIdKind: kind = 'int',
  } = options;
  const names = progressionNames(typePrefix);

  const levelUpCondition = `self.xp >= fn:${names.xpForLevelFn}(self.level + 1)`;

  const propertyDefinitions: SeedPropertyDefInput[] = [
    ownerMirrorProperty(names.progressType, kind),
    {
      containerTypeName: names.progressType,
      key: 'xp',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Lifetime experience points.',
    },
    {
      containerTypeName: names.progressType,
      key: 'level',
      valueType: 'int',
      defaultValueJson: '1',
      description: 'Current level, advanced server-side by grant_xp.',
    },
    {
      containerTypeName: names.progressType,
      key: 'skill_points',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Unspent skill points (earned on level-up).',
    },
    {
      containerTypeName: names.progressType,
      key: 'rating',
      valueType: 'int',
      defaultValueJson: String(initialRating),
      description: 'Competitive rating (ELO-style), adjusted by the match layer.',
    },
    {
      containerTypeName: names.skillDefType,
      key: 'skill_id',
      valueType: 'string',
      description: 'Stable skill identifier.',
    },
    {
      containerTypeName: names.skillDefType,
      key: 'cost',
      valueType: 'int',
      defaultValueJson: '1',
      description: 'Skill points per rank.',
    },
    {
      containerTypeName: names.skillDefType,
      key: 'requires_skill_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Prerequisite skill_id (empty for none); rank ≥ 1 required.',
    },
    {
      containerTypeName: names.skillDefType,
      key: 'max_rank',
      valueType: 'int',
      defaultValueJson: '1',
      description: 'Maximum purchasable rank.',
    },
    ownerMirrorProperty(names.skillRankType, kind),
    {
      containerTypeName: names.skillRankType,
      key: 'skill_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'The skill this rank row tracks.',
    },
    {
      containerTypeName: names.skillRankType,
      key: 'rank',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Current rank (0 = not learned).',
    },
    {
      containerTypeName: names.achievementDefType,
      key: 'achievement_id',
      valueType: 'string',
      description: 'Stable achievement identifier.',
    },
    {
      containerTypeName: names.achievementDefType,
      key: 'threshold',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Total xp required to unlock.',
    },
    ownerMirrorProperty(names.achievementUnlockType, kind),
    {
      containerTypeName: names.achievementUnlockType,
      key: 'achievement_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'The achievement this unlock row tracks.',
    },
    {
      containerTypeName: names.achievementUnlockType,
      key: 'unlocked',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'True once the threshold check has passed (idempotent).',
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.xpForLevelFn,
      containerTypeName: names.progressType,
      returnType: 'int',
      invokeScope: 'internal',
      parameters: [
        {
          name: 'level',
          valueType: 'int',
          required: true,
          description: 'The level whose total-xp requirement to compute.',
        },
      ],
      mutations: [],
      returnExpression: xpForLevelExpression,
      description:
        'The XP curve: total xp required to reach $level. Internal-only; read via fn: calls from grant_xp (the fn: helper pattern).',
    },
    {
      name: names.grantXpFn,
      containerTypeName: names.progressType,
      returnType: 'int',
      parameters: [
        {
          name: 'amount',
          valueType: 'int',
          required: true,
          description: 'XP to add (negative values are ignored).',
        },
      ],
      mutations: [
        { target: 'self', property: 'xp', expression: 'self.xp + max(0, $amount)' },
        {
          target: 'self',
          property: 'skill_points',
          expression: `self.skill_points + if(${levelUpCondition}, ${skillPointsPerLevel}, 0)`,
        },
        {
          target: 'self',
          property: 'level',
          expression: `if(${levelUpCondition}, self.level + 1, self.level)`,
        },
      ],
      returnExpression: 'self.level',
      ...trustedAuthorityFields(xpAuthority),
      description:
        'Trusted XP grant: adds xp, then awards skill points and bumps the level when the fn:xp_for_level curve is crossed (one level per grant).',
    },
    {
      name: names.buySkillFn,
      containerTypeName: names.skillRankType,
      returnType: 'int',
      parameters: [
        {
          name: 'progress_id',
          valueType: 'container_ref',
          required: true,
          description: "The caller's Progress container (pays the skill points).",
        },
        {
          name: 'def_id',
          valueType: 'container_ref',
          required: true,
          description: 'The SkillDef being bought.',
        },
        {
          name: 'prereq_id',
          valueType: 'container_ref',
          required: true,
          description:
            "The caller's SkillRank for the prerequisite skill (pass this rank container itself when the skill has no prerequisite).",
        },
      ],
      mutations: [
        {
          target: 'ref($progress_id)',
          property: 'skill_points',
          expression: 'ref($progress_id).skill_points - ref($def_id).cost',
        },
        { target: 'self', property: 'rank', expression: 'self.rank + 1' },
      ],
      returnExpression: 'self.rank',
      invokePolicyJson: kitPolicyJson({
        type: 'condition',
        expression: [
          ownerEqualsCaller('self.owner_user_id', kind),
          ownerEqualsCaller('ref($progress_id).owner_user_id', kind),
          'self.skill_id == ref($def_id).skill_id',
          'ref($progress_id).skill_points >= ref($def_id).cost',
          'self.rank < ref($def_id).max_rank',
          `if(ref($def_id).requires_skill_id == "", true, ref($prereq_id).skill_id == ref($def_id).requires_skill_id && ref($prereq_id).rank >= 1 && ${ownerEqualsCaller('ref($prereq_id).owner_user_id', kind)})`,
        ].join(' && '),
      }),
      description:
        'Buy one rank of a skill: point cost, max rank, and the prerequisite chain are all checked server-side; the spend and the rank-up are one transaction.',
    },
    {
      name: names.unlockAchievementFn,
      containerTypeName: names.achievementUnlockType,
      returnType: 'bool',
      parameters: [
        {
          name: 'progress_id',
          valueType: 'container_ref',
          required: true,
          description: "The caller's Progress container (xp threshold source).",
        },
        {
          name: 'def_id',
          valueType: 'container_ref',
          required: true,
          description: 'The AchievementDef whose threshold to check.',
        },
      ],
      mutations: [{ target: 'self', property: 'unlocked', expression: 'true' }],
      returnExpression: 'self.unlocked',
      invokePolicyJson: kitPolicyJson({
        type: 'condition',
        expression: [
          ownerEqualsCaller('self.owner_user_id', kind),
          ownerEqualsCaller('ref($progress_id).owner_user_id', kind),
          'self.achievement_id == ref($def_id).achievement_id',
          'ref($progress_id).xp >= ref($def_id).threshold',
        ].join(' && '),
      }),
      description:
        'Unlock an achievement once its xp threshold is met (idempotent: re-invoking just re-writes true).',
    },
    {
      name: names.adjustRatingFn,
      containerTypeName: names.progressType,
      returnType: 'int',
      parameters: [
        {
          name: 'delta',
          valueType: 'int',
          required: true,
          description: 'Signed rating change (an ELO delta computed by the match layer).',
        },
      ],
      mutations: [
        {
          target: 'self',
          property: 'rating',
          expression: 'max(0, self.rating + $delta)',
        },
      ],
      returnExpression: 'self.rating',
      ...trustedAuthorityFields(ratingAuthority),
      description:
        'Trusted rating adjustment (host-gated by default) — wired from kit.matches match results.',
    },
  ];

  return {
    name: names.progressType,
    containerTypes: [
      {
        typeName: names.progressType,
        displayName: names.progressType,
        instantiableBy: 'member',
        description: 'Per-player progression: xp, level, skill points, rating.',
      },
      {
        typeName: names.skillDefType,
        displayName: names.skillDefType,
        instantiableBy: 'admin',
        description: 'Studio skill catalog row (cost, prerequisite, max rank).',
      },
      {
        typeName: names.skillRankType,
        displayName: names.skillRankType,
        instantiableBy: 'member',
        description: "A player's purchased rank of one skill.",
      },
      {
        typeName: names.achievementDefType,
        displayName: names.achievementDefType,
        instantiableBy: 'admin',
        description: 'Studio achievement catalog row (xp threshold).',
      },
      {
        typeName: names.achievementUnlockType,
        displayName: names.achievementUnlockType,
        instantiableBy: 'member',
        description: "A player's unlock state for one achievement.",
      },
    ],
    propertyDefinitions,
    functions,
  };
}
