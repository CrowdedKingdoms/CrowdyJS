import type { ChannelsAPI } from '../domains/channels.js';
import type { GameAppsAPI } from '../domains/gameApps.js';
import type { TeamsAPI } from '../domains/teams.js';
import type { UdpAPI } from '../domains/udp.js';
import type { Scalars } from '../generated/graphql.js';
import { decodeBase64, encodeBase64, generateCrowdyUuid } from '../utils.js';

/** Options for {@link SocialKit}. */
export interface SocialKitOptions {
  /**
   * The 32-ASCII-char actor uuid used as the sender id on chat messages.
   * Defaults to a random uuid per kit instance — set it to YOUR actor uuid
   * so receivers can attribute messages.
   */
  actorUuid?: string;
  /** Name prefix for party teams/channels. Defaults to `'party:'`. */
  partyPrefix?: string;
  /** Name prefix for guild teams/channels. Defaults to `'guild:'`. */
  guildPrefix?: string;
}

/** A party or guild: the team plus its paired chat channel. */
export interface KitGroupWithChannel {
  /** The team's group id (membership/roles live here). */
  teamId: string;
  /** The paired chat channel's group id (may be '' if pairing failed). */
  channelId: string;
  name: string;
}

/** A decoded chat message from a kit chat room. */
export interface KitChatMessage {
  channelId: string;
  /** The sender's actor uuid (attribution is by app convention). */
  senderUuid: string;
  text: string;
  epochMillis: string;
}

/**
 * Runtime **social** helpers — parties, guilds, and chat rooms in familiar
 * words, wrapped over the platform's teams (membership + roles) and
 * channels (location-independent messaging) with realtime delivery via the
 * UDP notification subscription. No model schema needed; the only
 * deployable is the optional {@link guildBlueprint} composite (guild hall +
 * bank).
 *
 * Conventions: a party is a team named `party:<name>` paired with an
 * equally-named channel; a guild is `guild:<name>` likewise. Guild
 * territory = a grid group-grant (`claimTerritory`), enforced by the
 * replication layer.
 *
 * Obtained via `client.kit(appId).social`.
 */
export class SocialKit {
  private readonly actorUuid: string;
  private readonly partyPrefix: string;
  private readonly guildPrefix: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly teams: TeamsAPI | undefined,
    private readonly channels: ChannelsAPI | undefined,
    private readonly udp: UdpAPI | undefined,
    private readonly gameApps: GameAppsAPI,
    options: SocialKitOptions = {},
  ) {
    this.actorUuid = options.actorUuid ?? generateCrowdyUuid();
    this.partyPrefix = options.partyPrefix ?? 'party:';
    this.guildPrefix = options.guildPrefix ?? 'guild:';
  }

  private requireTeams(): TeamsAPI {
    if (!this.teams) {
      throw new Error(
        'kit.social needs the teams domain — construct the kit via client.kit(appId)',
      );
    }
    return this.teams;
  }

  private requireChannels(): ChannelsAPI {
    if (!this.channels) {
      throw new Error(
        'kit.social needs the channels domain — construct the kit via client.kit(appId)',
      );
    }
    return this.channels;
  }

  private requireUdp(): UdpAPI {
    if (!this.udp) {
      throw new Error(
        'kit.social needs the udp domain — construct the kit via client.kit(appId)',
      );
    }
    return this.udp;
  }

  /** Create a team + equally-named chat channel pair. */
  private async createPair(
    name: string,
    membershipPolicy: string | undefined,
    description: string,
  ): Promise<KitGroupWithChannel> {
    const team = await this.requireTeams().create({
      appId: this.appId,
      name,
      description,
      ...(membershipPolicy !== undefined ? { membershipPolicy } : {}),
    });
    const channel = await this.requireChannels().create({
      appId: this.appId,
      name,
      description: `Chat for ${name}`,
    });
    return {
      teamId: String(team.groupId),
      channelId: String(channel.groupId),
      name,
    };
  }

  /** Find a team + channel pair by its full name. */
  private async findPair(name: string): Promise<KitGroupWithChannel | undefined> {
    const [teams, channels] = await Promise.all([
      this.requireTeams().list(this.appId),
      this.requireChannels().list(this.appId),
    ]);
    const team = teams.find((t) => t.name === name);
    if (!team) return undefined;
    const channel = channels.find((c) => c.name === name);
    return {
      teamId: String(team.groupId),
      channelId: channel ? String(channel.groupId) : '',
      name,
    };
  }

  /** Parties: small invite-based groups with their own chat channel. */
  readonly party = {
    /** Create a party (invite-only by default). The creator becomes leader. */
    create: async (name: string): Promise<KitGroupWithChannel> => {
      return this.createPair(`${this.partyPrefix}${name}`, 'invite', 'Party');
    },

    /** Find a party by name. */
    find: async (name: string): Promise<KitGroupWithChannel | undefined> => {
      return this.findPair(`${this.partyPrefix}${name}`);
    },

    /**
     * Invite (add) a player to the party — requires the leader's
     * `manage_members`. Adds them to the chat channel membership too.
     */
    invite: async (party: KitGroupWithChannel, userId: Scalars['BigInt']['input']) => {
      const member = await this.requireTeams().addMember(party.teamId, userId);
      if (party.channelId) {
        await this.requireChannels().addMember(party.channelId, userId);
      }
      return member;
    },

    /** Join an open party (and its chat channel) as the caller. */
    join: async (party: KitGroupWithChannel) => {
      const member = await this.requireTeams().join(party.teamId);
      if (party.channelId) {
        await this.requireChannels().join(party.channelId);
      }
      return member;
    },

    /** Leave the party (and its chat channel). */
    leave: async (party: KitGroupWithChannel) => {
      if (party.channelId) {
        await this.requireChannels().leave(party.channelId);
      }
      return this.requireTeams().leave(party.teamId);
    },

    /** The party roster. */
    members: async (party: KitGroupWithChannel) => {
      return this.requireTeams().members(party.teamId);
    },
  };

  /** Guilds: persistent role-based organizations with chat + territory. */
  readonly guild = {
    /** Create a guild (request-to-join by default). The creator becomes leader. */
    create: async (
      name: string,
      options: { membershipPolicy?: string; description?: string } = {},
    ): Promise<KitGroupWithChannel> => {
      return this.createPair(
        `${this.guildPrefix}${name}`,
        options.membershipPolicy ?? 'request',
        options.description ?? 'Guild',
      );
    },

    /** Find a guild by name. */
    find: async (name: string): Promise<KitGroupWithChannel | undefined> => {
      return this.findPair(`${this.guildPrefix}${name}`);
    },

    /** The guild roster (members + pending join requests). */
    roster: async (guild: KitGroupWithChannel) => {
      return this.requireTeams().members(guild.teamId);
    },

    /** The guild's roles (including the system leader role). */
    roles: async (guild: KitGroupWithChannel) => {
      return this.requireTeams().roles(guild.teamId);
    },

    /** Create a custom guild role (requires `manage_roles`). */
    createRole: async (
      guild: KitGroupWithChannel,
      input: { roleName: string; permissions?: string[]; rank?: number },
    ) => {
      return this.requireTeams().createRole({
        groupId: guild.teamId,
        roleName: input.roleName,
        ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
        ...(input.rank !== undefined ? { rank: input.rank } : {}),
      });
    },

    /**
     * Promote/demote a member: REPLACES their role set (requires
     * `manage_roles`).
     */
    promote: async (
      guild: KitGroupWithChannel,
      userId: Scalars['BigInt']['input'],
      roleIds: string[],
    ) => {
      return this.requireTeams().setMemberRoles({
        groupId: guild.teamId,
        userId,
        roleIds,
      });
    },

    /**
     * Claim territory for the guild: grants runtime permission keys on a
     * grid to every guild member (optionally one role) — enforced by the
     * replication layer on movement/voxel writes. Requires grid admin
     * rights on the app.
     */
    claimTerritory: async (
      guild: KitGroupWithChannel,
      gridId: Scalars['BigInt']['input'],
      options: { permissionKeys?: string[]; groupRoleId?: string } = {},
    ) => {
      return this.gameApps.assignGroup({
        appId: this.appId,
        gridId,
        groupId: guild.teamId,
        permissionKeys: options.permissionKeys ?? ['access', 'update_voxel_data'],
        ...(options.groupRoleId !== undefined
          ? { groupRoleId: options.groupRoleId }
          : {}),
      });
    },
  };

  /** Chat rooms: named channels with realtime text delivery. */
  readonly chat = {
    /** Find-or-create a chat room (an open channel) by name. */
    room: async (name: string) => {
      const channels = this.requireChannels();
      const existing = (await channels.list(this.appId)).find((c) => c.name === name);
      if (existing) return existing;
      return channels.create({ appId: this.appId, name });
    },

    /** Join a chat room. */
    join: async (channelId: Scalars['BigInt']['input']) => {
      return this.requireChannels().join(channelId);
    },

    /**
     * Send a UTF-8 text message to a room (requires channel membership with
     * `send_messages`). Delivery is fan-out to every active member's
     * notification subscription, regardless of world location.
     */
    send: async (
      channelId: Scalars['BigInt']['input'],
      text: string,
    ): Promise<boolean> => {
      return this.requireUdp().sendChannelMessage({
        channelId,
        uuid: this.actorUuid,
        payload: encodeBase64(new TextEncoder().encode(text)),
      });
    },

    /**
     * Listen for messages in one room: decodes each ping's payload as UTF-8
     * text. Returns the unsubscribe function.
     */
    onMessage: (
      channelId: Scalars['BigInt']['input'],
      callback: (message: KitChatMessage) => void,
    ): (() => void) => {
      return this.requireUdp().subscribe(
        {
          channelMessage: (notification) => {
            if (String(notification.channelId) !== String(channelId)) return;
            let text = '';
            try {
              text = new TextDecoder().decode(decodeBase64(notification.payload));
            } catch {
              text = '';
            }
            callback({
              channelId: String(notification.channelId),
              senderUuid: notification.uuid,
              text,
              epochMillis: String(notification.epochMillis),
            });
          },
        },
        String(this.appId),
      );
    },
  };
}
