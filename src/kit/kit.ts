import type { ChannelsAPI } from '../domains/channels.js';
import type { ExecAPI } from '../domains/exec.js';
import type { GameAppsAPI } from '../domains/gameApps.js';
import type { TeamsAPI } from '../domains/teams.js';
import type { UdpAPI } from '../domains/udp.js';
import type { Scalars } from '../generated/graphql.js';
import { MatchmakingKit, type MatchmakingKitOptions } from './modules/matchmaking.js';
import { NpcsKit, type NpcsKitOptions } from './modules/npcs.js';
import { EmotesKit, SpectateKit } from './modules/presence.js';
import { SessionsKit, type SessionsKitOptions } from './modules/sessions.js';
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
 * game {@link sessions}, areas of {@link npcs} with mobs and pets), the {@link topology} that
 * deploys them, the client-side conventions ({@link spectate}, {@link emotes},
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
