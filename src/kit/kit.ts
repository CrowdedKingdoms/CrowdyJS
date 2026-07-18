import type { ChannelsAPI } from '../domains/channels.js';
import type { GameAppsAPI } from '../domains/gameApps.js';
import type { GameModelAPI } from '../domains/gameModel.js';
import type { TeamsAPI } from '../domains/teams.js';
import type { UdpAPI } from '../domains/udp.js';
import type {
  GameModelSeedMutation,
  GameModelUpsertAutomationMutation,
  GameModelUpsertAutomationTriggerMutation,
  Scalars,
} from '../generated/graphql.js';
import { mergeBlueprints, type KitBlueprint } from './blueprints/index.js';
import { CombatKit, type CombatKitOptions } from './combat.js';
import { DecksKit, type DecksKitOptions } from './decks.js';
import { EconomyKit, type EconomyKitOptions } from './economy.js';
import { InventoryKit, type InventoryKitOptions } from './inventory.js';
import { LootKit, type LootKitOptions } from './loot.js';
import { NpcsKit, type NpcsKitOptions } from './npcs.js';
import { ObjectsKit, type ObjectsKitOptions } from './objects.js';
import { PlotsKit, type PlotsKitOptions } from './plots.js';
import { MatchesKit, type MatchesKitOptions } from './matches.js';
import { ProgressionKit, type ProgressionKitOptions } from './progression.js';
import { QuestsKit, type QuestsKitOptions } from './quests.js';

/** Options for {@link GameKitClient}, configuring the runtime helpers to match your deployed blueprints. */
export interface GameKitOptions {
  inventory?: InventoryKitOptions;
  objects?: ObjectsKitOptions;
  npcs?: NpcsKitOptions;
  plots?: PlotsKitOptions;
  economy?: EconomyKitOptions;
  progression?: ProgressionKitOptions;
  loot?: LootKitOptions;
  quests?: QuestsKitOptions;
  combat?: CombatKitOptions;
  matches?: MatchesKitOptions;
  decks?: DecksKitOptions;
}

/**
 * The extra (non-model) domains some kit helpers compose: channels + udp for
 * matches (notify-to-pull) and social chat, teams for parties/guilds.
 * `client.kit(appId)` wires them automatically.
 */
export interface GameKitDomains {
  channels?: ChannelsAPI;
  teams?: TeamsAPI;
  udp?: UdpAPI;
}

/** The result of {@link GameKitClient.deploy}: the seed outcome plus each automation/trigger upserted. */
export interface KitDeployResult {
  seed: GameModelSeedMutation['gameModelSeed'];
  automations: GameModelUpsertAutomationMutation['gameModelUpsertAutomation'][];
  automationTriggers: GameModelUpsertAutomationTriggerMutation['gameModelUpsertAutomationTrigger'][];
  /** Non-fatal static-analysis warnings from the seed. */
  warnings: string[];
}

/**
 * App-scoped **Game Kit** facade returned by `client.kit(appId)` — high-level
 * building blocks that map traditional game concepts (inventory, lockable
 * objects with custom permissions, NPCs) onto the Game Model + Automations
 * API. Everything composes `client.gameModel`; no new server surface.
 *
 * Two phases, matching the platform's model:
 *
 * 1. **Studio (admin) loads the rules** — {@link deploy} takes declarative
 *    {@link KitBlueprint}s (built with `inventoryBlueprint`, `lockBlueprint`,
 *    `npcBlueprint`, or by hand) and seeds the container types, property
 *    schemas, policy-gated functions, and automations into the app in one
 *    idempotent pass. Requires the app-admin `manage_apps` permission — run
 *    it from a trusted admin context, never the shipped game client.
 * 2. **The game client plays** — {@link inventory}, {@link objects}, and
 *    {@link npcs} wrap the runtime calls (create/read containers, invoke the
 *    gated functions) assuming the blueprint conventions. Authorization is
 *    enforced server-side on every call.
 *
 * See the docs guides "Game API → Modeling game concepts" and
 * "CrowdyJS → Game Kit".
 *
 * @example
 * ```ts
 * // Studio setup (admin token):
 * const kit = admin.kit(appId);
 * await kit.deploy([
 *   inventoryBlueprint(),
 *   lockBlueprint({ objectTypeName: 'Door', authority: { kind: 'key' } }),
 * ]);
 *
 * // Game client (player token):
 * const kit = game.kit(appId);
 * const bag = await kit.inventory.ensure(me.userId);
 * const result = await kit.objects.open(doorId, { keyId });
 * if (!result.success) showLockedMessage(result.errorMessage);
 * ```
 */
export class GameKitClient {
  /** Inventory helpers (per-player bags and item stacks). */
  readonly inventory: InventoryKit;
  /** Lockable-object helpers (doors/chests/gates with custom permissions). */
  readonly objects: ObjectsKit;
  /** NPC helpers (spawn/read instances, manage the automations behind them). */
  readonly npcs: NpcsKit;
  /** Plot helpers (buy/rent land with transactional, enforced grid grants). */
  readonly plots: PlotsKit;
  /** Economy helpers (wallets, shops, escrow trades, player market). */
  readonly economy: EconomyKit;
  /** Progression helpers (xp/levels, skills, achievements, rating). */
  readonly progression: ProgressionKit;
  /** Loot helpers (server-rolled weighted tables, atomic claims). */
  readonly loot: LootKit;
  /** Quest helpers (catalog, progress, atomic reward turn-in, daily resets). */
  readonly quests: QuestsKit;
  /** Combat helpers (server-authoritative attacks, status effects, respawn). */
  readonly combat: CombatKit;
  /** Match helpers (lobbies, rounds, turns, scores, notify-to-pull channels). */
  readonly matches: MatchesKit;
  /** Deck helpers (hidden hands via owner visibility, server-dealt shuffles). */
  readonly decks: DecksKit;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    gameApps: GameAppsAPI,
    options: GameKitOptions = {},
    domains: GameKitDomains = {},
  ) {
    this.inventory = new InventoryKit(appId, gameModel, options.inventory);
    this.objects = new ObjectsKit(appId, gameModel, options.objects);
    this.npcs = new NpcsKit(appId, gameModel, options.npcs);
    this.plots = new PlotsKit(appId, gameModel, gameApps, options.plots);
    this.economy = new EconomyKit(appId, gameModel, options.economy);
    this.progression = new ProgressionKit(appId, gameModel, options.progression);
    this.loot = new LootKit(appId, gameModel, options.loot);
    this.quests = new QuestsKit(appId, gameModel, options.quests);
    this.combat = new CombatKit(appId, gameModel, options.combat);
    this.matches = new MatchesKit(
      appId,
      gameModel,
      domains.channels,
      domains.udp,
      options.matches,
    );
    this.decks = new DecksKit(appId, gameModel, options.decks);
  }

  /**
   * Helpers for an additional lockable object type deployed under a different
   * type name (e.g. both `Door` and `Chest` lock blueprints in one app).
   */
  objectsFor(objectTypeName: string, keyTypeName?: string): ObjectsKit {
    return new ObjectsKit(this.appId, this.gameModel, {
      objectTypeName,
      keyTypeName,
    });
  }

  /**
   * **Studio (admin)** — load blueprints into the app: one transactional
   * `gameModelSeed` for the definitions (and any seed containers/edges),
   * followed by an `upsertAutomation` per automation and an
   * `upsertAutomationTrigger` per event trigger. Idempotent: definitions
   * upsert on their names, automations key on the automation name.
   *
   * Requires the app-admin `manage_apps` permission.
   *
   * @param blueprints - The blueprints to deploy. Duplicate type/function/
   *   automation names across blueprints throw before anything is sent.
   * @param options - `sessionId` scopes any seed containers to a session.
   * @returns A {@link KitDeployResult} with the seed counts, the upserted
   *   automations/triggers, and any non-fatal seed `warnings`.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` (`requiredPermission ===
   *   'manage_apps'`) without app-admin, or `BAD_USER_INPUT` for definitions
   *   that fail to compile.
   */
  async deploy(
    blueprints: KitBlueprint | KitBlueprint[],
    options: { sessionId?: string } = {},
  ): Promise<KitDeployResult> {
    const list = Array.isArray(blueprints) ? blueprints : [blueprints];
    const merged = mergeBlueprints(this.appId, list, options);

    const seed = await this.gameModel.seed(merged.seedInput);

    const automations = [];
    for (const automation of merged.automations) {
      automations.push(await this.gameModel.upsertAutomation(automation));
    }
    const automationTriggers = [];
    for (const trigger of merged.automationTriggers) {
      automationTriggers.push(await this.gameModel.upsertAutomationTrigger(trigger));
    }

    return {
      seed,
      automations,
      automationTriggers,
      warnings: [...(seed.warnings ?? [])],
    };
  }
}
