import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import {
  questsNames,
  type KitOwnerIdKind,
  type QuestsNames,
} from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link QuestsKit}. Must match the deployed quests blueprint. */
export interface QuestsKitOptions {
  /** The `typePrefix` the quests blueprint was deployed with. */
  typePrefix?: string;
  /** Must match questsBlueprint.ownerIdKind. Defaults to `int`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** A parsed view of one quest catalog row. */
export interface KitQuestDef {
  containerId: string;
  displayName: string;
  questId: string;
  targetCount: number;
  rewardItemId: string;
  rewardQty: number;
  rewardGold: number;
  repeatable: boolean;
  daily: boolean;
}

/** A parsed view of one player's quest progress. */
export interface KitQuestProgress {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  questId: string;
  count: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  daily: boolean;
}

/**
 * Runtime helpers for the {@link questsBlueprint} conventions: browse the
 * quest catalog, accept quests into per-player progress rows, advance them
 * (trusted — app admins or event automations), and claim rewards atomically
 * into a stack + wallet. Denials resolve with `success: false`.
 *
 * Obtained via `client.kit(appId).quests`.
 */
export class QuestsKit {
  private readonly names: QuestsNames;
  private readonly ownerIdKind: KitOwnerIdKind;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: QuestsKitOptions = {},
  ) {
    this.names = questsNames(options.typePrefix ?? '');
    this.ownerIdKind = options.ownerIdKind ?? 'int';
  }

  /** List the quest catalog (admin-seeded QuestDef containers). */
  async catalog(): Promise<KitQuestDef[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.defType,
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
          questId: String(props.quest_id ?? ''),
          targetCount: Number(props.target_count ?? 1),
          rewardItemId: String(props.reward_item_id ?? ''),
          rewardQty: Number(props.reward_qty ?? 0),
          rewardGold: Number(props.reward_gold ?? 0),
          repeatable: props.repeatable === true,
          daily: props.daily === true,
        };
      }),
    );
  }

  /** Define a quest (admin — the catalog type is admin-instantiable). */
  async defineQuest(input: {
    questId: string;
    targetCount?: number;
    rewardItemId?: string;
    rewardQty?: number;
    rewardGold?: number;
    repeatable?: boolean;
    daily?: boolean;
    displayName?: string;
    properties?: SeedPropertyInput[];
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.defType,
      displayName: input.displayName ?? `Quest ${input.questId}`,
      properties: [
        { key: 'quest_id', valueType: 'string', valueJson: JSON.stringify(input.questId) },
        {
          key: 'target_count',
          valueType: 'int',
          valueJson: String(input.targetCount ?? 1),
        },
        {
          key: 'reward_item_id',
          valueType: 'string',
          valueJson: JSON.stringify(input.rewardItemId ?? ''),
        },
        { key: 'reward_qty', valueType: 'int', valueJson: String(input.rewardQty ?? 0) },
        {
          key: 'reward_gold',
          valueType: 'int',
          valueJson: String(input.rewardGold ?? 0),
        },
        {
          key: 'repeatable',
          valueType: 'bool',
          valueJson: String(input.repeatable ?? false),
        },
        { key: 'daily', valueType: 'bool', valueJson: String(input.daily ?? false) },
        ...(input.properties ?? []),
      ],
    });
  }

  /**
   * Accept a quest: creates the caller's progress row seeded from the def
   * (target and daily flag copied at accept time).
   */
  async accept(
    ownerUserId: Scalars['BigInt']['input'],
    questDefId: string,
    options: { displayName?: string; sessionId?: string } = {},
  ) {
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      questDefId,
    );
    const questId = String(props.quest_id ?? '');
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.progressType,
      displayName: options.displayName ?? `Quest ${questId} ${ownerUserId}`,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      properties: [
        {
          key: 'owner_user_id',
          valueType: this.ownerIdKind,
          valueJson:
            this.ownerIdKind === 'string'
              ? JSON.stringify(String(ownerUserId))
              : String(ownerUserId),
        },
        { key: 'quest_id', valueType: 'string', valueJson: JSON.stringify(questId) },
        {
          key: 'target',
          valueType: 'int',
          valueJson: String(Number(props.target_count ?? 1)),
        },
        {
          key: 'daily',
          valueType: 'bool',
          valueJson: String(props.daily === true),
        },
      ],
    });
  }

  /** List a player's quest progress rows. */
  async mine(ownerUserId: Scalars['BigInt']['input']): Promise<KitQuestProgress[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.progressType,
    });
    const mine = containers.filter(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    return Promise.all(mine.map((c) => this.state(c.containerId)));
  }

  // -- FTUE / tutorial step sequencing (Wave 2) -----------------------------

  /**
   * STUDIO (admin) — define an ordered tutorial chain as quest defs. Steps
   * are plain quests whose `questId` encodes the chain + index
   * (`"<chain>:<i>"`), so no new server surface is involved: the sequencing
   * is a read-side convention enforced by {@link tutorial} /
   * {@link acceptNextTutorialStep} (a step is `locked` until every earlier
   * step completes).
   */
  async defineTutorial(input: {
    /** Chain id (one app can ship several tutorials). Defaults to `'ftue'`. */
    chain?: string;
    steps: Array<{
      displayName: string;
      targetCount?: number;
      rewardItemId?: string;
      rewardQty?: number;
      rewardGold?: number;
    }>;
  }) {
    const chain = input.chain ?? 'ftue';
    const created = [];
    for (const [index, step] of input.steps.entries()) {
      created.push(
        await this.defineQuest({
          questId: `${chain}:${index}`,
          displayName: step.displayName,
          targetCount: step.targetCount ?? 1,
          rewardItemId: step.rewardItemId,
          rewardQty: step.rewardQty,
          rewardGold: step.rewardGold,
        }),
      );
    }
    return created;
  }

  /** One tutorial step joined with the player's progress. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- documented shape
  /**
   * A player's view of a tutorial chain: steps in order, each `locked`
   * (an earlier step is incomplete), `active` (the first incomplete step),
   * or `complete`. The client shows/drives only the `active` step; the
   * trusted advance authority is unchanged (players still cannot complete
   * their own quests).
   */
  async tutorial(
    ownerUserId: Scalars['BigInt']['input'],
    chain = 'ftue',
  ): Promise<
    Array<{
      stepIndex: number;
      def: KitQuestDef;
      progress: KitQuestProgress | null;
      status: 'locked' | 'active' | 'complete';
    }>
  > {
    const prefix = `${chain}:`;
    const defs = (await this.catalog())
      .filter((def) => def.questId.startsWith(prefix))
      .map((def) => ({ def, stepIndex: Number(def.questId.slice(prefix.length)) }))
      .filter(({ stepIndex }) => Number.isFinite(stepIndex))
      .sort((a, b) => a.stepIndex - b.stepIndex);
    const progressRows = await this.mine(ownerUserId);
    let blocked = false;
    return defs.map(({ def, stepIndex }) => {
      const progress = progressRows.find((p) => p.questId === def.questId) ?? null;
      const complete = progress?.completed === true;
      const status: 'locked' | 'active' | 'complete' = complete
        ? 'complete'
        : blocked
          ? 'locked'
          : 'active';
      if (!complete) blocked = true;
      return { stepIndex, def, progress, status };
    });
  }

  /**
   * Ensure the player's ACTIVE tutorial step has a progress row (accepting
   * it when missing) and return the step. Returns null when the chain is
   * complete. Calling this for a locked step is impossible by construction —
   * it always targets the first incomplete step.
   */
  async acceptNextTutorialStep(
    ownerUserId: Scalars['BigInt']['input'],
    chain = 'ftue',
    options: { sessionId?: string } = {},
  ) {
    const steps = await this.tutorial(ownerUserId, chain);
    const active = steps.find((step) => step.status === 'active');
    if (!active) return null;
    if (active.progress) return active;
    await this.accept(ownerUserId, active.def.containerId, options);
    const refreshed = await this.tutorial(ownerUserId, chain);
    return refreshed.find((step) => step.stepIndex === active.stepIndex) ?? null;
  }

  /** Read one progress row. */
  async state(progressId: string): Promise<KitQuestProgress> {
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
      questId: String(props.quest_id ?? ''),
      count: Number(props.count ?? 0),
      target: Number(props.target ?? 1),
      completed: props.completed === true,
      claimed: props.claimed === true,
      daily: props.daily === true,
    };
  }

  /**
   * Advance quest progress — a **trusted** call (default blueprint
   * authority: app admins; or wire `advanceOn` event automations). Resolves
   * with the new count.
   */
  async advance(progressId: string, amount = 1): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.advanceFn,
      selfContainerId: progressId,
      params: { amount },
    });
  }

  /**
   * Turn in a completed quest: marks it claimed AND grants the item +
   * currency rewards in one transaction. Resolves with the wallet's new
   * balance.
   */
  async claim(input: {
    progressId: string;
    questDefId: string;
    toStackId: string;
    walletId: string;
  }): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.claimFn,
      selfContainerId: input.progressId,
      params: {
        def_id: input.questDefId,
        to_stack_id: input.toStackId,
        wallet_id: input.walletId,
      },
    });
  }
}
