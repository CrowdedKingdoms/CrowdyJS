import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import {
  progressionNames,
  type ProgressionNames,
} from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link ProgressionKit}. Must match the deployed blueprint. */
export interface ProgressionKitOptions {
  /** The `typePrefix` the progression blueprint was deployed with. */
  typePrefix?: string;
}

/** A parsed view of one player's progression. */
export interface KitProgress {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  xp: number;
  level: number;
  skillPoints: number;
  rating: number;
}

/** A parsed view of one skill catalog row. */
export interface KitSkillDef {
  containerId: string;
  displayName: string;
  skillId: string;
  cost: number;
  requiresSkillId: string;
  maxRank: number;
}

/** A parsed view of one player skill rank. */
export interface KitSkillRank {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  skillId: string;
  rank: number;
}

/** A parsed view of one achievement definition. */
export interface KitAchievementDef {
  containerId: string;
  displayName: string;
  achievementId: string;
  threshold: number;
}

/** A parsed view of one player achievement unlock. */
export interface KitAchievementUnlock {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  achievementId: string;
  unlocked: boolean;
}

/**
 * Runtime helpers for the {@link progressionBlueprint} conventions: ensure a
 * player's `Progress`, grant XP (trusted — app admins by default), buy
 * skills against the catalog's costs and prerequisites, unlock threshold
 * achievements, and apply match rating results. Everything is
 * authority-checked server-side; denials resolve with `success: false`.
 *
 * Obtained via `client.kit(appId).progression`.
 */
export class ProgressionKit {
  private readonly names: ProgressionNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: ProgressionKitOptions = {},
  ) {
    this.names = progressionNames(options.typePrefix ?? '');
  }

  /**
   * Find the player's Progress container, creating it when absent (with the
   * `owner_user_id` mirror the guards read).
   */
  async ensure(
    ownerUserId: Scalars['BigInt']['input'],
    options: { displayName?: string; sessionId?: string } = {},
  ) {
    const existing = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.progressType,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
    const mine = existing.find(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    if (mine) return mine;
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.progressType,
      displayName: options.displayName ?? `Progress ${ownerUserId}`,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      properties: [
        { key: 'owner_user_id', valueType: 'int', valueJson: String(ownerUserId) },
      ],
    });
  }

  /** Read one player's progression state. */
  async state(progressId: string): Promise<KitProgress> {
    const container = await this.gameModel.container({
      appId: this.appId,
      containerId: progressId,
    });
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      progressId,
    );
    return {
      containerId: container.containerId,
      displayName: container.displayName,
      ownerUserId: container.ownerUserId != null ? String(container.ownerUserId) : null,
      xp: Number(props.xp ?? 0),
      level: Number(props.level ?? 1),
      skillPoints: Number(props.skill_points ?? 0),
      rating: Number(props.rating ?? 0),
    };
  }

  /**
   * Grant XP — a **trusted** call (default blueprint authority: app admins
   * via server scope; or drive it from an event automation). Awards skill
   * points and levels up when the curve is crossed. Resolves with the new
   * level.
   */
  async grantXp(progressId: string, amount: number): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.grantXpFn,
      selfContainerId: progressId,
      params: { amount },
    });
  }

  /** List the skill catalog (admin-seeded SkillDef containers). */
  async skillCatalog(): Promise<KitSkillDef[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.skillDefType,
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
          skillId: String(props.skill_id ?? ''),
          cost: Number(props.cost ?? 1),
          requiresSkillId: String(props.requires_skill_id ?? ''),
          maxRank: Number(props.max_rank ?? 1),
        };
      }),
    );
  }

  /** Define a skill (admin — the catalog type is admin-instantiable). */
  async defineSkill(input: {
    skillId: string;
    cost?: number;
    requiresSkillId?: string;
    maxRank?: number;
    displayName?: string;
    properties?: SeedPropertyInput[];
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.skillDefType,
      displayName: input.displayName ?? `Skill ${input.skillId}`,
      properties: [
        { key: 'skill_id', valueType: 'string', valueJson: JSON.stringify(input.skillId) },
        { key: 'cost', valueType: 'int', valueJson: String(input.cost ?? 1) },
        {
          key: 'requires_skill_id',
          valueType: 'string',
          valueJson: JSON.stringify(input.requiresSkillId ?? ''),
        },
        { key: 'max_rank', valueType: 'int', valueJson: String(input.maxRank ?? 1) },
        ...(input.properties ?? []),
      ],
    });
  }

  /**
   * Find-or-create the caller's SkillRank row for a skill (rank 0 until
   * bought).
   */
  async ensureSkillRank(
    ownerUserId: Scalars['BigInt']['input'],
    skillId: string,
    options: { displayName?: string } = {},
  ) {
    const mine = await this.skills(ownerUserId);
    const existing = mine.find((s) => s.skillId === skillId);
    if (existing) {
      return this.gameModel.container({
        appId: this.appId,
        containerId: existing.containerId,
      });
    }
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.skillRankType,
      displayName: options.displayName ?? `Skill ${skillId} ${ownerUserId}`,
      properties: [
        { key: 'owner_user_id', valueType: 'int', valueJson: String(ownerUserId) },
        { key: 'skill_id', valueType: 'string', valueJson: JSON.stringify(skillId) },
      ],
    });
  }

  /**
   * Buy one rank of a skill. `prereqRankId` is the caller's SkillRank for
   * the prerequisite skill; omit it for skills without one (the rank row
   * itself is passed to satisfy the required param — the condition ignores
   * it when the def declares no prerequisite).
   */
  async buySkill(input: {
    skillRankId: string;
    progressId: string;
    skillDefId: string;
    prereqRankId?: string;
  }): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.buySkillFn,
      selfContainerId: input.skillRankId,
      params: {
        progress_id: input.progressId,
        def_id: input.skillDefId,
        prereq_id: input.prereqRankId ?? input.skillRankId,
      },
    });
  }

  /** List a player's skill ranks. */
  async skills(ownerUserId: Scalars['BigInt']['input']): Promise<KitSkillRank[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.skillRankType,
    });
    const mine = containers.filter(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    return Promise.all(
      mine.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          skillId: String(props.skill_id ?? ''),
          rank: Number(props.rank ?? 0),
        };
      }),
    );
  }

  /** List the achievement catalog (admin-seeded AchievementDef containers). */
  async achievementCatalog(): Promise<KitAchievementDef[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.achievementDefType,
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
          achievementId: String(props.achievement_id ?? ''),
          threshold: Number(props.threshold ?? 0),
        };
      }),
    );
  }

  /** Define an achievement (admin). */
  async defineAchievement(input: {
    achievementId: string;
    threshold: number;
    displayName?: string;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.achievementDefType,
      displayName: input.displayName ?? `Achievement ${input.achievementId}`,
      properties: [
        {
          key: 'achievement_id',
          valueType: 'string',
          valueJson: JSON.stringify(input.achievementId),
        },
        { key: 'threshold', valueType: 'int', valueJson: String(input.threshold) },
      ],
    });
  }

  /** List a player's achievement unlocks. */
  async achievements(
    ownerUserId: Scalars['BigInt']['input'],
  ): Promise<KitAchievementUnlock[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.achievementUnlockType,
    });
    const mine = containers.filter(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    return Promise.all(
      mine.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          achievementId: String(props.achievement_id ?? ''),
          unlocked: props.unlocked === true,
        };
      }),
    );
  }

  /**
   * Unlock an achievement once its xp threshold is met. Creates the caller's
   * unlock row when absent, then invokes the gated function (idempotent).
   */
  async unlockAchievement(input: {
    ownerUserId: Scalars['BigInt']['input'];
    progressId: string;
    achievementDefId: string;
    achievementId: string;
  }): Promise<KitInvokeResult<boolean>> {
    const mine = await this.achievements(input.ownerUserId);
    let unlockId = mine.find((a) => a.achievementId === input.achievementId)?.containerId;
    if (!unlockId) {
      const created = await this.gameModel.createContainer({
        appId: this.appId,
        typeName: this.names.achievementUnlockType,
        displayName: `Achievement ${input.achievementId} ${input.ownerUserId}`,
        properties: [
          {
            key: 'owner_user_id',
            valueType: 'int',
            valueJson: String(input.ownerUserId),
          },
          {
            key: 'achievement_id',
            valueType: 'string',
            valueJson: JSON.stringify(input.achievementId),
          },
        ],
      });
      unlockId = created.containerId;
    }
    return kitInvoke<boolean>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.unlockAchievementFn,
      selfContainerId: unlockId,
      params: { progress_id: input.progressId, def_id: input.achievementDefId },
    });
  }

  /**
   * Apply a match result as a rating delta (trusted — host-gated by
   * default; `kit.matches` computes the delta). Resolves with the new
   * rating.
   */
  async applyMatchResult(
    progressId: string,
    delta: number,
  ): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.adjustRatingFn,
      selfContainerId: progressId,
      params: { delta },
    });
  }
}
