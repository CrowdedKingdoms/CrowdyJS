import type { ChannelsAPI } from '../domains/channels.js';
import type { ExecAPI } from '../domains/exec.js';
import type { GameAppsAPI } from '../domains/gameApps.js';
import type { TeamsAPI } from '../domains/teams.js';
import type { UdpAPI } from '../domains/udp.js';
import type { Scalars } from '../generated/graphql.js';
import { ArenasKit } from './modules/arenas.js';
import { EncountersKit } from './modules/encounters.js';
import { InstancesKit } from './modules/instances.js';
import { LeaderboardsKit } from './modules/leaderboards.js';
import { MarketCore, MarketsKit, ShopsKit, TradesKit } from './modules/market.js';
import { MatchmakingKit, type MatchmakingKitOptions } from './modules/matchmaking.js';
import { MinigamesKit } from './modules/minigames.js';
import {
  AchievementsKit,
  CraftingKit,
  InventoryKit,
  LootKit,
  PlayerKit,
  ProductionKit,
  ProgressionKit,
  QuestsKit,
  WalletKit,
} from './modules/player.js';
import { NpcsKit, type NpcsKitOptions } from './modules/npcs.js';
import { EmotesKit, SpectateKit } from './modules/presence.js';
import { RacingKit } from './modules/racing.js';
import { SessionsKit, type SessionsKitOptions } from './modules/sessions.js';
import { TablesKit } from './modules/tables.js';
import { TacticsKit } from './modules/tactics.js';
import { TerritoryKit } from './modules/territory.js';
import { WorldKit, type WorldKitOptions } from './modules/world.js';
import { shardKey, shardKeysAround } from './protocol.js';
import { KitRuntime, type KitRuntimeOptions } from './runtime.js';
import { SocialKit, type SocialKitOptions } from './social.js';
import { KitTopology } from './topology.js';

/**
 * The node types the kit's modules call, when a game deployed the starters under other names.
 * Each defaults to the starter pack's.
 */
export interface GameKitNodeTypes {
  /** The root world hub (`world`). */
  world?: string;
  /** Matchmaking queues (`matchmaker`). */
  matchmaker?: string;
  /** Game sessions (`session`). */
  session?: string;
  /** Areas of mobs, NPCs and pets (`npcs`). */
  npcs?: string;
  /** Leaderboards (`leaderboard`). */
  leaderboard?: string;
  /** Card tables (`deck`). */
  deck?: string;
  /** Grid battles (`tactics`). */
  tactics?: string;
  /** Waves and bosses (`director`). */
  director?: string;
  /** Duels (`minigame`). */
  minigame?: string;
  /** Private runs (`instance`). */
  instance?: string;
  /** Arenas (`arena`). */
  arena?: string;
  /** Races (`race`) and ball games (`ball`). */
  race?: string;
  ball?: string;
  /** Control points (`territory`) and shrinking circles (`zone`). */
  territory?: string;
  zone?: string;
  /** Each player's own hub (`player`): inventory, wallet, progression, crafting, loot. */
  player?: string;
  /** Markets (`market`): vendors, order books, trades. */
  market?: string;
}

/** Options for {@link GameKitClient}. */
export interface GameKitOptions extends KitRuntimeOptions {
  social?: SocialKitOptions;
  /** The node types the modules call. */
  nodes?: GameKitNodeTypes;
  /** The key of the root world hub. Default `''`. */
  worldKey?: string;
  /** An area's size in chunks, for `npcs.areaAt`. Default 8. */
  areaSize?: number;
}

/**
 * The domains the kit composes: exec for the hubs, teams for parties and guilds, channels and
 * udp for chat and the realtime conventions. `client.kit(appId)` wires them.
 */
export interface GameKitDomains {
  channels?: ChannelsAPI;
  teams?: TeamsAPI;
  udp?: UdpAPI;
  exec?: ExecAPI;
  /** The player's id, for `changed` messages: `client.users.me`. */
  whoAmI?: () => Promise<string | null>;
}

/** Shard keys: the hub for where a player stands, computed the way the hubs compute it. */
export class ShardKit {
  /** The key of the `size`-chunk shard holding chunk `(x, z)`. */
  key(x: number, z: number, size: number): string {
    return shardKey(x, z, size);
  }

  /** The keys of the shards within `radius` of the one holding `(x, z)`, its own first. */
  around(x: number, z: number, size: number, radius = 1): string[] {
    return shardKeysAround(x, z, size, radius);
  }
}

/**
 * The app-scoped **Game Kit** that `client.kit(appId)` returns: typed clients for the ck-exec
 * starter hubs (the root {@link world} with liveops, {@link matchmaking} queues with parties,
 * game {@link sessions}, areas of {@link npcs} with mobs and pets, {@link leaderboards}, card
 * {@link tables}, {@link tactics} battles, {@link encounters}, {@link minigames}, private
 * {@link instances}, {@link arenas}, {@link racing}, {@link territory}; the economy:
 * {@link player}, {@link inventory}, {@link wallet}, {@link progression}, {@link achievements},
 * {@link quests}, {@link crafting}, {@link loot}, {@link production}, {@link market},
 * {@link shops}, {@link trades}), the {@link topology}
 * that deploys them, the client-side conventions ({@link spectate}, {@link emotes},
 * {@link shards}), and {@link social} (parties, guilds, chat over teams and channels).
 *
 * The hub modules share one connection ({@link runtime}), opened when first needed, which
 * paces calls under the gateway's limit, resends safely (a change carries an action id the
 * hub answers once), and mirrors topics with resync on gaps and reconnects. The realtime
 * codecs (`kitActorCodec`, `kitEventCodecs`, the `wire.ts` parsers) and `runOptimisticAction`
 * are standalone exports.
 */
export class GameKitClient {
  /** Social helpers (parties, guilds, chat over teams + channels). */
  readonly social: SocialKit;
  /** The shared connection to the app's hubs. */
  readonly runtime: KitRuntime;
  private worldKit: WorldKit | null = null;
  private matchmakingKit: MatchmakingKit | null = null;
  private sessionsKit: SessionsKit | null = null;
  private npcsKit: NpcsKit | null = null;
  private topologyKit: KitTopology | null = null;
  private spectateKit: SpectateKit | null = null;
  private emotesKit: EmotesKit | null = null;
  private shardKit: ShardKit | null = null;
  private leaderboardsKit: LeaderboardsKit | null = null;
  private tablesKit: TablesKit | null = null;
  private tacticsKit: TacticsKit | null = null;
  private encountersKit: EncountersKit | null = null;
  private minigamesKit: MinigamesKit | null = null;
  private instancesKit: InstancesKit | null = null;
  private arenasKit: ArenasKit | null = null;
  private racingKit: RacingKit | null = null;
  private territoryKit: TerritoryKit | null = null;
  private playerKit: PlayerKit | null = null;
  private readonly economy = new Map<string, unknown>();
  private readonly markets = new Map<string, MarketCore>();

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    gameApps: GameAppsAPI,
    private readonly options: GameKitOptions = {},
    private readonly domains: GameKitDomains = {},
  ) {
    this.social = new SocialKit(appId, domains.teams, domains.channels, domains.udp, gameApps, options.social);
    this.runtime = new KitRuntime(String(appId), domains.exec, options, domains.whoAmI);
  }

  /** The root world hub: conditions, resource nodes, liveops. */
  get world(): WorldKit {
    const opts: WorldKitOptions = { nodeType: this.options.nodes?.world, key: this.options.worldKey };
    return (this.worldKit ??= new WorldKit(this.runtime, opts));
  }

  /** Matchmaking queues, with parties matched whole. */
  get matchmaking(): MatchmakingKit {
    const opts: MatchmakingKitOptions = { nodeType: this.options.nodes?.matchmaker };
    return (this.matchmakingKit ??= new MatchmakingKit(this.runtime, opts));
  }

  /** Game sessions: lobby, ready checks, turns, scores. */
  get sessions(): SessionsKit {
    const opts: SessionsKitOptions = { nodeType: this.options.nodes?.session };
    return (this.sessionsKit ??= new SessionsKit(this.runtime, opts));
  }

  /** Areas of mobs, NPCs and players' pets. */
  get npcs(): NpcsKit {
    const opts: NpcsKitOptions = { nodeType: this.options.nodes?.npcs, areaSize: this.options.areaSize };
    return (this.npcsKit ??= new NpcsKit(this.runtime, opts));
  }

  /** Leaderboards the hubs rank (a client never submits its own score). */
  get leaderboards(): LeaderboardsKit {
    return (this.leaderboardsKit ??= new LeaderboardsKit(this.runtime, this.options.nodes?.leaderboard));
  }

  /** Card tables with hidden hands the hub holds. */
  get tables(): TablesKit {
    return (this.tablesKit ??= new TablesKit(this.runtime, this.options.nodes?.deck));
  }

  /** Grid battles in turns, against the hub's units. */
  get tactics(): TacticsKit {
    return (this.tacticsKit ??= new TacticsKit(this.runtime, this.options.nodes?.tactics));
  }

  /** Encounters: waves down a lane, towers, a boss with phases. */
  get encounters(): EncountersKit {
    return (this.encountersKit ??= new EncountersKit(this.runtime, this.options.nodes?.director));
  }

  /** Duels of hidden throws, revealed together. */
  get minigames(): MinigamesKit {
    return (this.minigamesKit ??= new MinigamesKit(this.runtime, this.options.nodes?.minigame));
  }

  /** Private runs for one party: seeded floors, permadeath, expiry. */
  get instances(): InstancesKit {
    return (this.instancesKit ??= new InstancesKit(this.runtime, this.options.nodes?.instance));
  }

  /** Real-time arenas: classes, abilities, the hub's referee. */
  get arenas(): ArenasKit {
    return (this.arenasKit ??= new ArenasKit(this.runtime, this.options.nodes?.arena));
  }

  /** Races and ball games, on positions the hub's warden keeps. */
  get racing(): RacingKit {
    return (this.racingKit ??= new RacingKit(this.runtime, this.options.nodes?.race, this.options.nodes?.ball));
  }

  /** Control points factions capture, and shrinking circles. */
  get territory(): TerritoryKit {
    return (this.territoryKit ??= new TerritoryKit(this.runtime, this.options.nodes?.territory, this.options.nodes?.zone));
  }

  /**
   * The caller's own `player` hub: what they own and what they did. The economy lives in hub
   * state and is not a ledger. The modules below are views of it.
   */
  get player(): PlayerKit {
    return (this.playerKit ??= new PlayerKit(this.runtime, this.options.nodes?.player));
  }

  private view<T>(name: string, make: (player: PlayerKit) => T): T {
    if (!this.economy.has(name)) this.economy.set(name, make(this.player));
    return this.economy.get(name) as T;
  }

  /** The player's items: stacks in slots, and mail for what did not fit. */
  get inventory(): InventoryKit {
    return this.view('inventory', (p) => new InventoryKit(p));
  }

  /** The player's soft currencies. */
  get wallet(): WalletKit {
    return this.view('wallet', (p) => new WalletKit(p));
  }

  /** Experience, levels and public profiles. */
  get progression(): ProgressionKit {
    return this.view('progression', (p) => new ProgressionKit(p));
  }

  get achievements(): AchievementsKit {
    return this.view('achievements', (p) => new AchievementsKit(p));
  }

  /** Quests, first-session tutorials among them. */
  get quests(): QuestsKit {
    return this.view('quests', (p) => new QuestsKit(p));
  }

  get crafting(): CraftingKit {
    return this.view('crafting', (p) => new CraftingKit(p));
  }

  /** Loot tables with pity. */
  get loot(): LootKit {
    return this.view('loot', (p) => new LootKit(p));
  }

  /** Idle production that catches up on the time away. */
  get production(): ProductionKit {
    return this.view('production', (p) => new ProductionKit(p));
  }

  private marketCore = (key: string): MarketCore => {
    let core = this.markets.get(key);
    if (!core) {
      core = new MarketCore(this.runtime, this.options.nodes?.market ?? 'market', key);
      this.markets.set(key, core);
    }
    return core;
  };

  /** Markets' order books. */
  get market(): MarketsKit {
    return this.view('market', () => new MarketsKit(this.marketCore));
  }

  /** Markets' vendors. */
  get shops(): ShopsKit {
    return this.view('shops', () => new ShopsKit(this.marketCore));
  }

  /** Trades between two players at a market. */
  get trades(): TradesKit {
    return this.view('trades', () => new TradesKit(this.marketCore));
  }

  /** Composing and deploying the app's tree of starter hubs (developers). */
  get topology(): KitTopology {
    return (this.topologyKit ??= new KitTopology(String(this.appId), this.domains.exec));
  }

  /** Keeping a viewer with no avatar where the world's messages reach it. */
  get spectate(): SpectateKit {
    return (this.spectateKit ??= new SpectateKit(String(this.appId), this.domains.udp));
  }

  /** Emotes between players, a client event every kit client reads. */
  get emotes(): EmotesKit {
    return (this.emotesKit ??= new EmotesKit(String(this.appId), this.domains.udp));
  }

  /** Shard keys, as the hubs compute them. */
  get shards(): ShardKit {
    return (this.shardKit ??= new ShardKit());
  }

  /** Closes the kit's connection (one it was given stays open). */
  close(): void {
    this.runtime.close();
  }
}
