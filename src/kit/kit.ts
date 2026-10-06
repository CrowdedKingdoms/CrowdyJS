import type { ChannelsAPI } from '../domains/channels.js';
import type { GameAppsAPI } from '../domains/gameApps.js';
import type { TeamsAPI } from '../domains/teams.js';
import type { UdpAPI } from '../domains/udp.js';
import type { Scalars } from '../generated/graphql.js';
import { SocialKit, type SocialKitOptions } from './social.js';

/** Options for {@link GameKitClient}. */
export interface GameKitOptions {
  social?: SocialKitOptions;
}

/**
 * The domains the kit composes: teams for parties and guilds, channels and udp for chat.
 * `client.kit(appId)` wires them automatically.
 */
export interface GameKitDomains {
  channels?: ChannelsAPI;
  teams?: TeamsAPI;
  udp?: UdpAPI;
}

/**
 * App-scoped **Game Kit** returned by `client.kit(appId)`: parties, guilds and chat rooms
 * over teams and channels ({@link social}). Game rules and state live in ck-exec hubs
 * (`client.exec`); the kit's wire codecs (`encodeEnginePose`, `parseEngineEvent`, ...) and
 * `runOptimisticAction` are standalone exports.
 */
export class GameKitClient {
  /** Social helpers (parties, guilds, chat over teams + channels). */
  readonly social: SocialKit;

  constructor(
    appId: Scalars['BigInt']['input'],
    gameApps: GameAppsAPI,
    options: GameKitOptions = {},
    domains: GameKitDomains = {},
  ) {
    this.social = new SocialKit(
      appId,
      domains.teams,
      domains.channels,
      domains.udp,
      gameApps,
      options.social,
    );
  }
}
