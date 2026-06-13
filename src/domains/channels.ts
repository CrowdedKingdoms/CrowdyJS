import type { GraphQLClient } from '../client.js';

import {
  MyChannelsDocument,
  type MyChannelsQuery,
  type MyChannelsQueryVariables,
  ChannelsDocument,
  type ChannelsQuery,
  type ChannelsQueryVariables,
  ChannelDocument,
  type ChannelQuery,
  type ChannelQueryVariables,
  ChannelMembersDocument,
  type ChannelMembersQuery,
  type ChannelMembersQueryVariables,
  ChannelRolesDocument,
  type ChannelRolesQuery,
  type ChannelRolesQueryVariables,
  ChannelPolicyDocument,
  type ChannelPolicyQuery,
  type ChannelPolicyQueryVariables,
  SetChannelPolicyDocument,
  type SetChannelPolicyMutation,
  type SetChannelPolicyMutationVariables,
  CreateChannelDocument,
  type CreateChannelMutation,
  type CreateChannelMutationVariables,
  UpdateChannelDocument,
  type UpdateChannelMutation,
  type UpdateChannelMutationVariables,
  DeleteChannelDocument,
  type DeleteChannelMutationVariables,
  JoinChannelDocument,
  type JoinChannelMutation,
  type JoinChannelMutationVariables,
  RequestToJoinChannelDocument,
  type RequestToJoinChannelMutation,
  type RequestToJoinChannelMutationVariables,
  LeaveChannelDocument,
  type LeaveChannelMutationVariables,
  AddChannelMemberDocument,
  type AddChannelMemberMutation,
  type AddChannelMemberMutationVariables,
  RemoveChannelMemberDocument,
  type RemoveChannelMemberMutationVariables,
  SetChannelMemberRolesDocument,
  type SetChannelMemberRolesMutation,
  type SetChannelMemberRolesMutationVariables,
  CreateChannelRoleDocument,
  type CreateChannelRoleMutation,
  type CreateChannelRoleMutationVariables,
  UpdateChannelRoleDocument,
  type UpdateChannelRoleMutation,
  type UpdateChannelRoleMutationVariables,
  DeleteChannelRoleDocument,
  type DeleteChannelRoleMutationVariables,
} from '../generated/graphql.js';

/**
 * Channels: app-scoped, location-independent pub/sub messaging groups on the
 * **game-api**. Exposed as `client.channels`.
 *
 * A channel is a named subscriber set with role-gated messaging, built on the
 * same generic groups subsystem as Teams (`group_type='channel'`). The methods
 * here manage a channel's lifecycle and configuration — creating channels,
 * listing/fetching them, managing membership (join/leave/add/remove), roles,
 * and the per-app channel policy — all over the game-api GraphQL endpoint.
 *
 * Realtime message delivery is a **separate** path: publish to a channel with
 * `client.udp.sendChannelMessage(...)` over UDP. That call requires the
 * channel's `send_messages` permission and fans the payload out to every
 * active member (as a `ChannelMessageNotification` on `client.udp`
 * notifications) rather than chunk-routing it. The methods on this class never
 * carry message payloads — they only manage who belongs to a channel and what
 * each member may do.
 *
 * `BigInt` ids (`appId`, `groupId`, `userId`, `groupRoleId`) are sent and
 * received as decimal strings.
 *
 * Every method requires an authenticated session (a Bearer token set via
 * `client.auth.login()` or `client.setToken()`) and the caller must be
 * entitled to the target app; membership/role/policy mutations additionally
 * require a specific channel permission (e.g. `manage_group`, `manage_members`,
 * `manage_roles`) or app-admin (`manage_apps`). Failures throw
 * {@link CrowdyGraphQLError} carrying a stable `extensions.code` such as
 * `UNAUTHENTICATED`, `SCOPE_MISSING`, or `FORBIDDEN`.
 */
export class ChannelsAPI {
  constructor(private gql: GraphQLClient) {}

  // -- Queries --------------------------------------------------------------

  /**
   * List the caller's own channels in an app, each with the caller's roles and
   * effective channel permissions (e.g. whether they hold `send_messages`). Use
   * this to discover which channels the current user can read and post in.
   *
   * @param appId - The app (tenant) to list the caller's channels within, as a
   *   decimal `BigInt` string.
   * @returns One {@link GroupMembership} per channel the caller belongs to
   *   (the channel {@link Group}, the caller's {@link GroupRole}s, their
   *   effective permission keys, and the join time).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if there is no valid token,
   *   or `SCOPE_MISSING` / `FORBIDDEN` if the caller isn't entitled to the app.
   */
  async mine(
    appId: MyChannelsQueryVariables['appId'],
  ): Promise<MyChannelsQuery['myChannels']> {
    const data = await this.gql.request(MyChannelsDocument, { appId });
    return data.myChannels;
  }

  /**
   * List all active channels in an app — not just the caller's. Use
   * {@link mine} instead when you only want the channels the caller belongs to.
   *
   * @param appId - The app (tenant) whose channels to list, as a decimal
   *   `BigInt` string.
   * @returns Every active channel in the app as {@link Group} records.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED`, or `SCOPE_MISSING` /
   *   `FORBIDDEN` if the caller isn't entitled to the app.
   */
  async list(
    appId: ChannelsQueryVariables['appId'],
  ): Promise<ChannelsQuery['channels']> {
    const data = await this.gql.request(ChannelsDocument, { appId });
    return data.channels;
  }

  /**
   * Fetch a single channel by its group id.
   *
   * @param groupId - The channel's group id, as a decimal `BigInt` string.
   * @returns The channel as a {@link Group}.
   * @throws {CrowdyGraphQLError} if the id does not resolve to a channel (e.g.
   *   it is a team, or does not exist), or `UNAUTHENTICATED` / `FORBIDDEN` if
   *   the caller isn't entitled to the app.
   */
  async get(
    groupId: ChannelQueryVariables['groupId'],
  ): Promise<ChannelQuery['channel']> {
    const data = await this.gql.request(ChannelDocument, { groupId });
    return data.channel;
  }

  /**
   * List a channel's members — its subscriber set, including pending join
   * requests — each with their membership status and roles.
   *
   * @param groupId - The channel whose members to list, as a decimal `BigInt`
   *   string.
   * @returns The channel's members as {@link GroupMember} records.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` if the caller
   *   isn't entitled to the channel's app.
   */
  async members(
    groupId: ChannelMembersQueryVariables['groupId'],
  ): Promise<ChannelMembersQuery['channelMembers']> {
    const data = await this.gql.request(ChannelMembersDocument, { groupId });
    return data.channelMembers;
  }

  /**
   * List a channel's roles, including the system `leader` role and any default
   * `member` role (which typically grants `send_messages`).
   *
   * @param groupId - The channel whose roles to list, as a decimal `BigInt`
   *   string.
   * @returns The channel's roles as {@link GroupRole} records, each with its
   *   granted permission keys.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` if the caller
   *   isn't entitled to the channel's app.
   */
  async roles(
    groupId: ChannelRolesQueryVariables['groupId'],
  ): Promise<ChannelRolesQuery['channelRoles']> {
    const data = await this.gql.request(ChannelRolesDocument, { groupId });
    return data.channelRoles;
  }

  /**
   * Read an app's current channel policy: who may create channels and the
   * default membership policy applied to new channels. Falls back to app
   * defaults when unset.
   *
   * @param appId - The app (tenant) whose channel policy to read, as a decimal
   *   `BigInt` string.
   * @returns The effective {@link AppGroupPolicy} for channels in the app
   *   (creation policy, default membership policy, and any member/group caps).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` if the caller
   *   isn't entitled to the app.
   */
  async policy(
    appId: ChannelPolicyQueryVariables['appId'],
  ): Promise<ChannelPolicyQuery['channelPolicy']> {
    const data = await this.gql.request(ChannelPolicyDocument, { appId });
    return data.channelPolicy;
  }

  // -- Channel mutations ----------------------------------------------------

  /**
   * Create a channel in an app. Whether the caller may create one is governed
   * by the per-app channel creation policy (`admin` | `member` | `anyone`).
   * The caller becomes the owner with a system `leader` role. When
   * `input.membersCanSend` is true (the default) a default `member` role
   * granting `send_messages` is created and auto-assigned to joiners (an open
   * chat channel); when false, only roles you explicitly grant may post (an
   * announce / read-only channel).
   *
   * @param input - {@link CreateChannelInput}: the owning `appId`, the channel
   *   `name` (max 128 chars, unique per app + type), and optional
   *   `description`, `membershipPolicy` (`open` | `request` | `invite` |
   *   `admin`; defaults to the app policy), and `membersCanSend` flag.
   * @returns The newly created channel as a {@link Group}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` (e.g. name too long or a
   *   duplicate name), `FORBIDDEN` if the channel policy disallows creation, or
   *   `UNAUTHENTICATED`.
   */
  async create(
    input: CreateChannelMutationVariables['input'],
  ): Promise<CreateChannelMutation['createChannel']> {
    const data = await this.gql.request(CreateChannelDocument, { input });
    return data.createChannel;
  }

  /**
   * Update a channel's name, description, and/or membership policy. Only the
   * fields present on `input` change; omitted fields are left as-is. Requires
   * the `manage_group` channel permission (app admins bypass).
   *
   * @param input - {@link UpdateChannelInput}: the `groupId` plus the fields to
   *   change — `name` (max 128 chars), `description`, and/or `membershipPolicy`
   *   (`open` | `request` | `invite` | `admin`).
   * @returns The updated channel as a {@link Group}.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_group`, `BAD_USER_INPUT` on a validation failure, or
   *   `UNAUTHENTICATED`.
   */
  async update(
    input: UpdateChannelMutationVariables['input'],
  ): Promise<UpdateChannelMutation['updateChannel']> {
    const data = await this.gql.request(UpdateChannelDocument, { input });
    return data.updateChannel;
  }

  /**
   * Delete a channel. Requires the `manage_group` channel permission (app
   * admins bypass). **Destructive**: cascades to the channel's members and
   * roles and notifies Buddy servers to tear down message routing for the
   * channel.
   *
   * @param groupId - The channel to delete, as a decimal `BigInt` string.
   * @returns `true` on success.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_group`, or `UNAUTHENTICATED`.
   */
  async remove(
    groupId: DeleteChannelMutationVariables['groupId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteChannelDocument, { groupId });
    return data.deleteChannel;
  }

  /**
   * Set who may create channels in an app and the default membership policy
   * for new channels. Requires app-admin (`manage_apps`). Affects future
   * channel creation only — existing channels are unchanged.
   *
   * @param input - {@link SetChannelPolicyInput}: the `appId`, the
   *   `creationPolicy` (`admin` | `member` | `anyone`), the
   *   `defaultMembershipPolicy` (`open` | `request` | `invite` | `admin`), and
   *   optional `maxMembers` / `maxGroupsPerUser` caps (`null` = unlimited).
   * @returns The updated {@link AppGroupPolicy}.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   isn't app-admin, `BAD_USER_INPUT` on an invalid policy value, or
   *   `UNAUTHENTICATED`.
   */
  async setPolicy(
    input: SetChannelPolicyMutationVariables['input'],
  ): Promise<SetChannelPolicyMutation['setChannelPolicy']> {
    const data = await this.gql.request(SetChannelPolicyDocument, { input });
    return data.setChannelPolicy;
  }

  // -- Membership mutations -------------------------------------------------

  /**
   * Join a channel as the caller (subscribe to it). Honors the channel's
   * membership policy: `open` → active immediately; `request` → pending until
   * a manager approves; `invite` / `admin` → rejected. On becoming active,
   * Buddy is notified with the caller's effective send permission so message
   * routing starts.
   *
   * @param groupId - The channel to join, as a decimal `BigInt` string.
   * @returns The caller's {@link GroupMember} record; its `status` reflects
   *   `active` vs. `pending`.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` if the membership policy rejects
   *   the join, or `UNAUTHENTICATED`.
   */
  async join(
    groupId: JoinChannelMutationVariables['groupId'],
  ): Promise<JoinChannelMutation['joinChannel']> {
    const data = await this.gql.request(JoinChannelDocument, { groupId });
    return data.joinChannel;
  }

  /**
   * Request to join a request-only channel, creating a pending membership a
   * manager can later approve via {@link addMember}. Behaves identically to
   * {@link join}; it exists as a clearer name for request-policy UIs.
   *
   * @param groupId - The request-only channel to request to join, as a decimal
   *   `BigInt` string.
   * @returns The caller's pending {@link GroupMember} record.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` if the membership policy rejects
   *   the request, or `UNAUTHENTICATED`.
   */
  async requestToJoin(
    groupId: RequestToJoinChannelMutationVariables['groupId'],
  ): Promise<RequestToJoinChannelMutation['requestToJoinChannel']> {
    const data = await this.gql.request(RequestToJoinChannelDocument, { groupId });
    return data.requestToJoinChannel;
  }

  /**
   * Leave a channel (unsubscribe the caller). Notifies Buddy to stop routing
   * messages to the caller.
   *
   * @param groupId - The channel to leave, as a decimal `BigInt` string.
   * @returns `true` if a membership was removed (`false` if the caller wasn't
   *   a member).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED`.
   */
  async leave(
    groupId: LeaveChannelMutationVariables['groupId'],
  ): Promise<boolean> {
    const data = await this.gql.request(LeaveChannelDocument, { groupId });
    return data.leaveChannel;
  }

  /**
   * Add a user to a channel, or approve their pending join request (upserts
   * the membership to `active`). Requires the `manage_members` channel
   * permission (app admins bypass). Auto-assigns the channel's default role if
   * configured and notifies Buddy with the member's effective send permission.
   *
   * @param groupId - The channel to add the user to, as a decimal `BigInt`
   *   string.
   * @param userId - The user to add or approve, as a decimal `BigInt` string.
   * @returns The added/approved {@link GroupMember} record.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_members`, or `UNAUTHENTICATED`.
   */
  async addMember(
    groupId: AddChannelMemberMutationVariables['groupId'],
    userId: AddChannelMemberMutationVariables['userId'],
  ): Promise<AddChannelMemberMutation['addChannelMember']> {
    const data = await this.gql.request(AddChannelMemberDocument, { groupId, userId });
    return data.addChannelMember;
  }

  /**
   * Remove a member from a channel. Requires the `manage_members` channel
   * permission, except that any member may remove themselves (pass their own
   * `userId`). Notifies Buddy to stop routing messages to the removed member.
   *
   * @param groupId - The channel to remove the user from, as a decimal
   *   `BigInt` string.
   * @param userId - The user to remove; may be the caller's own id to
   *   self-remove. Decimal `BigInt` string.
   * @returns `true` if a membership was removed.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` when removing
   *   another member without `manage_members`, or `UNAUTHENTICATED`.
   */
  async removeMember(
    groupId: RemoveChannelMemberMutationVariables['groupId'],
    userId: RemoveChannelMemberMutationVariables['userId'],
  ): Promise<boolean> {
    const data = await this.gql.request(RemoveChannelMemberDocument, { groupId, userId });
    return data.removeChannelMember;
  }

  /**
   * Replace a member's channel roles with the given set. This is **not
   * additive** — roles not listed are removed. Requires the `manage_roles`
   * channel permission (app admins bypass). Re-pushes the member's effective
   * send permission to Buddy so their ability to post updates immediately.
   *
   * @param input - {@link SetMemberRolesInput}: the `groupId`, the target
   *   `userId`, and `roleIds` — the complete set of channel role ids the member
   *   should have (ids that are unknown or belong to another group are
   *   ignored).
   * @returns The updated {@link GroupMember} record with its new roles.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_roles`, or `UNAUTHENTICATED`.
   */
  async setMemberRoles(
    input: SetChannelMemberRolesMutationVariables['input'],
  ): Promise<SetChannelMemberRolesMutation['setChannelMemberRoles']> {
    const data = await this.gql.request(SetChannelMemberRolesDocument, { input });
    return data.setChannelMemberRoles;
  }

  // -- Role mutations -------------------------------------------------------

  /**
   * Create a custom (non-system) channel role granting the given channel
   * permission keys (e.g. `send_messages` for posting rights). Requires the
   * `manage_roles` channel permission (app admins bypass).
   *
   * @param input - {@link CreateGroupRoleInput}: the `groupId`, the `roleName`
   *   (max 128 chars, unique within the channel), the `permissions` keys to
   *   grant (e.g. `send_messages`, `manage_members`; each max 64 chars,
   *   defaults to none), and an optional `rank` (higher = more senior;
   *   defaults to 0).
   * @returns The created {@link GroupRole}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` on an invalid/duplicate name
   *   or unknown permission key, `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_roles`, or `UNAUTHENTICATED`.
   */
  async createRole(
    input: CreateChannelRoleMutationVariables['input'],
  ): Promise<CreateChannelRoleMutation['createChannelRole']> {
    const data = await this.gql.request(CreateChannelRoleDocument, { input });
    return data.createChannelRole;
  }

  /**
   * Update a channel role's name, rank, and/or permission keys (system roles
   * cannot be renamed or re-ranked). When `input.permissions` is supplied it
   * **replaces** the role's existing keys. Requires the `manage_roles` channel
   * permission (app admins bypass).
   *
   * Note: changing `send_messages` here does not re-push to Buddy until each
   * affected member's roles are re-applied via {@link setMemberRoles}.
   *
   * @param input - {@link UpdateGroupRoleInput}: the `groupRoleId` plus the
   *   fields to change (`roleName`, `permissions`, `rank`); omitted fields are
   *   left unchanged.
   * @returns The updated {@link GroupRole}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` on a validation failure,
   *   `FORBIDDEN` / `SCOPE_MISSING` if the caller lacks `manage_roles`, or
   *   `UNAUTHENTICATED`.
   */
  async updateRole(
    input: UpdateChannelRoleMutationVariables['input'],
  ): Promise<UpdateChannelRoleMutation['updateChannelRole']> {
    const data = await this.gql.request(UpdateChannelRoleDocument, { input });
    return data.updateChannelRole;
  }

  /**
   * Delete a non-system channel role. Requires the `manage_roles` channel
   * permission (app admins bypass). The system `leader` role cannot be
   * deleted. **Destructive**: removes the role from any members that held it.
   *
   * @param groupRoleId - The channel role to delete (must be a non-system
   *   role), as a decimal `BigInt` string.
   * @returns `true` if a role was deleted.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_roles`, `BAD_USER_INPUT` if targeting a system role, or
   *   `UNAUTHENTICATED`.
   */
  async deleteRole(
    groupRoleId: DeleteChannelRoleMutationVariables['groupRoleId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteChannelRoleDocument, { groupRoleId });
    return data.deleteChannelRole;
  }
}
