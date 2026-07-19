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
import type { ComputeAPI } from '../domains/compute.js';
import { mergeBlueprints, type KitBlueprint } from './blueprints/index.js';
import { CombatKit, type CombatKitOptions } from './combat.js';
import { DirectorKit, type DirectorKitOptions } from './director.js';
import { DecksKit, type DecksKitOptions } from './decks.js';
import { EconomyKit, type EconomyKitOptions } from './economy.js';
import { EngineDetector } from './engine.js';
import { FeaturesKit } from './features.js';
import { InstancesKit, type InstancesKitOptions } from './instances.js';
import { InventoryKit, type InventoryKitOptions } from './inventory.js';
import { LeaderboardsKit, type LeaderboardsKitOptions } from './leaderboards.js';
import { LootKit, type LootKitOptions } from './loot.js';
import { MatchmakingKit, type MatchmakingKitOptions } from './matchmaking.js';
import { MinigamesKit, type MinigamesKitOptions } from './minigames.js';
import { MobsKit, type MobsKitOptions } from './mobs.js';
import { NpcsKit, type NpcsKitOptions } from './npcs.js';
import { ObjectsKit, type ObjectsKitOptions } from './objects.js';
import { PetsKit, type PetsKitOptions } from './pets.js';
import { PlotsKit, type PlotsKitOptions } from './plots.js';
import { MatchesKit, type MatchesKitOptions } from './matches.js';
import { ProgressionKit, type ProgressionKitOptions } from './progression.js';
import { QuestsKit, type QuestsKitOptions } from './quests.js';
import { SocialKit, type SocialKitOptions } from './social.js';
import { AbilitiesKit, type AbilitiesKitOptions } from './abilities.js';
import { LiveopsKit, type LiveopsKitOptions } from './liveops.js';
import { MovementKit, type MovementKitOptions } from './movement.js';
import { RacingKit, type RacingKitOptions } from './racing.js';
import { TerritoryKit, type TerritoryKitOptions } from './territory.js';
import { ModerationKit, type ModerationKitOptions } from './moderation.js';
import { TelemetryKit, type TelemetryKitOptions } from './telemetry.js';
import { WorldsimKit, type WorldsimKitOptions } from './worldsim.js';

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
  worldsim?: WorldsimKitOptions;
  liveops?: LiveopsKitOptions;
  moderation?: ModerationKitOptions;
  telemetry?: TelemetryKitOptions;
  abilities?: AbilitiesKitOptions;
  movement?: MovementKitOptions;
  territory?: TerritoryKitOptions;
  racing?: RacingKitOptions;
  social?: SocialKitOptions;
  leaderboards?: LeaderboardsKitOptions;
  mobs?: MobsKitOptions;
  pets?: PetsKitOptions;
  instances?: InstancesKitOptions;
  director?: DirectorKitOptions;
  matchmaking?: MatchmakingKitOptions;
  minigames?: MinigamesKitOptions;
}

/**
 * The extra (non-model) domains some kit helpers compose: channels + udp for
 * matches (notify-to-pull) and social chat, teams for parties/guilds, and
 * compute for the engine-backed helpers (mobs/pets, capability detection).
 * `client.kit(appId)` wires them automatically.
 */
export interface GameKitDomains {
  channels?: ChannelsAPI;
  teams?: TeamsAPI;
  udp?: UdpAPI;
  compute?: ComputeAPI;
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
  /** World simulation helpers (clock/weather, nodes, crops, wave counters). */
  readonly worldsim: WorldsimKit;
  /** Liveops helpers (event windows, seasons, battle-pass composition). */
  readonly liveops: LiveopsKit;
  /** Moderation helpers (reports, admin queue, personal mutes). */
  readonly moderation: ModerationKit;
  /** Telemetry helpers (track + sampled counters). */
  readonly telemetry: TelemetryKit;
  /** Realtime ability casts (abilities engine, type-94 events). */
  readonly abilities: AbilitiesKit;
  /** Movement-warden reads (observe/flag posture, type-95 events). */
  readonly movement: MovementKit;
  /** Control points + factions (territory engine, type-96 events). */
  readonly territory: TerritoryKit;
  /** Racing + possession (type-97 events, ghosts, the ball). */
  readonly racing: RacingKit;
  /** Social helpers (parties, guilds, chat over teams + channels). */
  readonly social: SocialKit;
  /** Leaderboard helpers (trusted submits, client-side ranking, seasons). */
  readonly leaderboards: LeaderboardsKit;
  /** Monetization helpers (feature keys, tier grants, featureGate policies). */
  readonly features: FeaturesKit;
  /** Mob-engine helpers (defs/slots, refereed attacks, contact events). */
  readonly mobs: MobsKit;
  /** Instance helpers (private world slices, seeded runs). */
  readonly instances: InstancesKit;
  /** Director helpers (encounter defs, run state, kill/boss reports). */
  readonly director: DirectorKit;
  /** Matchmaking helpers (queues, proposals, rating). */
  readonly matchmaking: MatchmakingKit;
  /** Minigame helpers (thin invoke wrapper for invoke-loop games). */
  readonly minigames: MinigamesKit;
  /** Pet helpers (adopt/summon/dismiss/rename over the npc engine). */
  readonly pets: PetsKit;
  /** Compute-engine capability detection shared by the engine-aware kits. */
  readonly engines: EngineDetector;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    gameApps: GameAppsAPI,
    options: GameKitOptions = {},
    domains: GameKitDomains = {},
  ) {
    this.engines = new EngineDetector(String(appId), domains.compute);
    this.inventory = new InventoryKit(appId, gameModel, options.inventory);
    this.objects = new ObjectsKit(appId, gameModel, options.objects);
    this.npcs = new NpcsKit(appId, gameModel, options.npcs, this.engines);
    this.plots = new PlotsKit(appId, gameModel, gameApps, options.plots);
    this.economy = new EconomyKit(appId, gameModel, options.economy, this.engines);
    this.progression = new ProgressionKit(appId, gameModel, options.progression);
    this.loot = new LootKit(appId, gameModel, options.loot);
    this.quests = new QuestsKit(appId, gameModel, options.quests);
    this.combat = new CombatKit(appId, gameModel, options.combat, this.engines);
    this.matches = new MatchesKit(
      appId,
      gameModel,
      domains.channels,
      domains.udp,
      options.matches,
      this.engines,
    );
    this.decks = new DecksKit(appId, gameModel, options.decks, this.engines);
    this.worldsim = new WorldsimKit(appId, gameModel, options.worldsim, this.engines);
    this.liveops = new LiveopsKit(appId, gameModel, options.liveops, this.engines);
    this.moderation = new ModerationKit(appId, gameModel, options.moderation);
    this.telemetry = new TelemetryKit(appId, gameModel, options.telemetry);
    this.abilities = new AbilitiesKit(appId, gameModel, this.engines, options.abilities);
    this.movement = new MovementKit(appId, gameModel, this.engines, options.movement);
    this.territory = new TerritoryKit(appId, gameModel, this.engines, options.territory);
    this.racing = new RacingKit(appId, gameModel, this.engines, options.racing);
    this.mobs = new MobsKit(appId, gameModel, this.engines, options.mobs);
    this.pets = new PetsKit(appId, gameModel, this.engines, options.pets);
    this.instances = new InstancesKit(appId, this.engines, options.instances);
    this.director = new DirectorKit(appId, gameModel, this.engines, options.director);
    this.matchmaking = new MatchmakingKit(appId, this.engines, options.matchmaking);
    this.minigames = new MinigamesKit(appId, this.engines, options.minigames);
    this.social = new SocialKit(
      appId,
      domains.teams,
      domains.channels,
      domains.udp,
      gameApps,
      options.social,
    );
    this.leaderboards = new LeaderboardsKit(appId, gameModel, options.leaderboards, this.engines);
    this.features = new FeaturesKit(appId, gameModel);
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
