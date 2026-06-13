import type { GraphQLClient } from '../client.js';

import {
  MyTeamsDocument,
  type MyTeamsQuery,
  type MyTeamsQueryVariables,
  TeamsDocument,
  type TeamsQuery,
  type TeamsQueryVariables,
  TeamDocument,
  type TeamQuery,
  type TeamQueryVariables,
  TeamMembersDocument,
  type TeamMembersQuery,
  type TeamMembersQueryVariables,
  TeamRolesDocument,
  type TeamRolesQuery,
  type TeamRolesQueryVariables,
  TeamPolicyDocument,
  type TeamPolicyQuery,
  type TeamPolicyQueryVariables,
  SetTeamPolicyDocument,
  type SetTeamPolicyMutation,
  type SetTeamPolicyMutationVariables,
  CreateTeamDocument,
  type CreateTeamMutation,
  type CreateTeamMutationVariables,
  UpdateTeamDocument,
  type UpdateTeamMutation,
  type UpdateTeamMutationVariables,
  DeleteTeamDocument,
  type DeleteTeamMutationVariables,
  JoinTeamDocument,
  type JoinTeamMutation,
  type JoinTeamMutationVariables,
  RequestToJoinTeamDocument,
  type RequestToJoinTeamMutation,
  type RequestToJoinTeamMutationVariables,
  LeaveTeamDocument,
  type LeaveTeamMutationVariables,
  AddTeamMemberDocument,
  type AddTeamMemberMutation,
  type AddTeamMemberMutationVariables,
  RemoveTeamMemberDocument,
  type RemoveTeamMemberMutationVariables,
  SetTeamMemberRolesDocument,
  type SetTeamMemberRolesMutation,
  type SetTeamMemberRolesMutationVariables,
  CreateTeamRoleDocument,
  type CreateTeamRoleMutation,
  type CreateTeamRoleMutationVariables,
  UpdateTeamRoleDocument,
  type UpdateTeamRoleMutation,
  type UpdateTeamRoleMutationVariables,
  DeleteTeamRoleDocument,
  type DeleteTeamRoleMutationVariables,
} from '../generated/graphql.js';

/**
 * Teams: app-scoped player groups with roles and delegated management on the
 * **game-api**. Exposed as `client.teams`.
 *
 * A team is a named, app-scoped set of players with a role/permission model,
 * built on the same generic groups subsystem as Channels (`group_type='team'`).
 * The methods here cover a team's full lifecycle — creating teams, listing and
 * fetching them, managing membership (join / request-to-join / leave / add /
 * remove), roles, and the per-app team policy — all over the game-api GraphQL
 * endpoint. Unlike channels, teams have no realtime messaging path.
 *
 * `BigInt` ids (`appId`, `groupId`, `userId`, `groupRoleId`) are sent and
 * received as decimal strings.
 *
 * Every method requires an authenticated session (a Bearer token set via
 * `client.auth.login()` or `client.setToken()`) and the caller must be
 * entitled to the target app; membership/role/policy mutations additionally
 * require a specific team permission (e.g. `manage_group`, `manage_members`,
 * `manage_roles`) or app-admin (`manage_apps`). Failures throw
 * {@link CrowdyGraphQLError} carrying a stable `extensions.code` such as
 * `UNAUTHENTICATED`, `SCOPE_MISSING`, or `FORBIDDEN`.
 */
export class TeamsAPI {
  constructor(private gql: GraphQLClient) {}

  // -- Queries --------------------------------------------------------------

  /**
   * List the caller's own teams in an app, each with the caller's roles and
   * effective team permissions. Use this to discover which teams the current
   * user belongs to and what they may do in each.
   *
   * @param appId - The app (tenant) to list the caller's teams within, as a
   *   decimal `BigInt` string.
   * @returns One {@link GroupMembership} per team the caller belongs to (the
   *   team {@link Group}, the caller's {@link GroupRole}s, their effective
   *   permission keys, and the join time).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if there is no valid token,
   *   or `SCOPE_MISSING` / `FORBIDDEN` if the caller isn't entitled to the app.
   */
  async mine(
    appId: MyTeamsQueryVariables['appId'],
  ): Promise<MyTeamsQuery['myTeams']> {
    const data = await this.gql.request(MyTeamsDocument, { appId });
    return data.myTeams;
  }

  /**
   * List all active teams in an app — not just the caller's. Use {@link mine}
   * instead when you only want the teams the caller belongs to.
   *
   * @param appId - The app (tenant) whose teams to list, as a decimal `BigInt`
   *   string.
   * @returns Every active team in the app as {@link Group} records.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED`, or `SCOPE_MISSING` /
   *   `FORBIDDEN` if the caller isn't entitled to the app.
   */
  async list(
    appId: TeamsQueryVariables['appId'],
  ): Promise<TeamsQuery['teams']> {
    const data = await this.gql.request(TeamsDocument, { appId });
    return data.teams;
  }

  /**
   * Fetch a single team by its group id.
   *
   * @param groupId - The team's group id, as a decimal `BigInt` string.
   * @returns The team as a {@link Group}.
   * @throws {CrowdyGraphQLError} if the id does not resolve to a team (e.g. it
   *   is a channel, or does not exist), or `UNAUTHENTICATED` / `FORBIDDEN` if
   *   the caller isn't entitled to the app.
   */
  async get(groupId: TeamQueryVariables['groupId']): Promise<TeamQuery['team']> {
    const data = await this.gql.request(TeamDocument, { groupId });
    return data.team;
  }

  /**
   * List a team's members, including pending join requests, each with their
   * membership status and roles.
   *
   * @param groupId - The team whose members to list, as a decimal `BigInt`
   *   string.
   * @returns The team's members as {@link GroupMember} records.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` if the caller
   *   isn't entitled to the team's app.
   */
  async members(
    groupId: TeamMembersQueryVariables['groupId'],
  ): Promise<TeamMembersQuery['teamMembers']> {
    const data = await this.gql.request(TeamMembersDocument, { groupId });
    return data.teamMembers;
  }

  /**
   * List a team's roles, including the system `leader` role, each with the
   * group-management permission keys it grants.
   *
   * @param groupId - The team whose roles to list, as a decimal `BigInt`
   *   string.
   * @returns The team's roles as {@link GroupRole} records.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` if the caller
   *   isn't entitled to the team's app.
   */
  async roles(
    groupId: TeamRolesQueryVariables['groupId'],
  ): Promise<TeamRolesQuery['teamRoles']> {
    const data = await this.gql.request(TeamRolesDocument, { groupId });
    return data.teamRoles;
  }

  /**
   * Read an app's current team policy: who may create teams and the default
   * membership policy applied to new teams. Falls back to app defaults when
   * unset.
   *
   * @param appId - The app (tenant) whose team policy to read, as a decimal
   *   `BigInt` string.
   * @returns The effective {@link AppGroupPolicy} for teams in the app
   *   (creation policy, default membership policy, and any member/group caps).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` if the caller
   *   isn't entitled to the app.
   */
  async policy(
    appId: TeamPolicyQueryVariables['appId'],
  ): Promise<TeamPolicyQuery['teamPolicy']> {
    const data = await this.gql.request(TeamPolicyDocument, { appId });
    return data.teamPolicy;
  }

  // -- Team mutations -------------------------------------------------------

  /**
   * Create a team in an app. Whether the caller may create one is governed by
   * the per-app team creation policy (`admin` | `member` | `anyone`). The
   * caller becomes the owner and is granted a system `leader` role holding
   * every team permission. New teams default to the app's default membership
   * policy unless `input.membershipPolicy` overrides it.
   *
   * @param input - {@link CreateTeamInput}: the owning `appId`, the team `name`
   *   (max 128 chars, unique per app + type), and optional `description` and
   *   `membershipPolicy` (`open` | `request` | `invite` | `admin`).
   * @returns The newly created team as a {@link Group}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` (e.g. name too long or a
   *   duplicate name), `FORBIDDEN` if the team policy disallows creation, or
   *   `UNAUTHENTICATED`.
   */
  async create(
    input: CreateTeamMutationVariables['input'],
  ): Promise<CreateTeamMutation['createTeam']> {
    const data = await this.gql.request(CreateTeamDocument, { input });
    return data.createTeam;
  }

  /**
   * Update a team's name, description, and/or membership policy. Only the
   * fields present on `input` change; omitted fields are left as-is. Requires
   * the `manage_group` team permission (app admins bypass).
   *
   * @param input - {@link UpdateTeamInput}: the `groupId` plus the fields to
   *   change — `name` (max 128 chars), `description`, and/or `membershipPolicy`
   *   (`open` | `request` | `invite` | `admin`).
   * @returns The updated team as a {@link Group}.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_group`, `BAD_USER_INPUT` on a validation failure, or
   *   `UNAUTHENTICATED`.
   */
  async update(
    input: UpdateTeamMutationVariables['input'],
  ): Promise<UpdateTeamMutation['updateTeam']> {
    const data = await this.gql.request(UpdateTeamDocument, { input });
    return data.updateTeam;
  }

  /**
   * Delete a team. Requires the `manage_group` team permission (app admins
   * bypass). **Destructive**: cascades to the team's members and roles, drops
   * any grid grants the team conferred, and recomputes the effective grid ACL
   * for affected grids.
   *
   * Pass an `idempotencyKey` to make retries safe: replaying with the same key
   * and identical arguments returns the first result instead of re-applying,
   * while the same key with a **different** `groupId` throws
   * {@link CrowdyGraphQLError} with `code === 'IDEMPOTENCY_CONFLICT'`. Keys
   * expire server-side after 24h. Requires game-api ≥ v0.10.3.
   *
   * @param groupId - The team to delete, as a decimal `BigInt` string.
   * @param idempotencyKey - Optional client-supplied key for safe retries.
   * @returns `true` on success.
   * @throws {CrowdyGraphQLError} `IDEMPOTENCY_CONFLICT` (key reused with
   *   different arguments), `FORBIDDEN` / `SCOPE_MISSING` if the caller lacks
   *   `manage_group`, or `UNAUTHENTICATED`.
   */
  async remove(
    groupId: DeleteTeamMutationVariables['groupId'],
    idempotencyKey?: DeleteTeamMutationVariables['idempotencyKey'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteTeamDocument, { groupId, idempotencyKey });
    return data.deleteTeam;
  }

  /**
   * Set who may create teams in an app and the default membership policy for
   * new teams. Requires app-admin (`manage_apps`). Affects future team
   * creation only — existing teams are unchanged.
   *
   * @param input - {@link SetTeamPolicyInput}: the `appId`, the `creationPolicy`
   *   (`admin` | `member` | `anyone`), the `defaultMembershipPolicy` (`open` |
   *   `request` | `invite` | `admin`), and optional `maxMembers` /
   *   `maxGroupsPerUser` caps (`null` = unlimited).
   * @returns The updated {@link AppGroupPolicy}.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   isn't app-admin, `BAD_USER_INPUT` on an invalid policy value, or
   *   `UNAUTHENTICATED`.
   */
  async setPolicy(
    input: SetTeamPolicyMutationVariables['input'],
  ): Promise<SetTeamPolicyMutation['setTeamPolicy']> {
    const data = await this.gql.request(SetTeamPolicyDocument, { input });
    return data.setTeamPolicy;
  }

  // -- Membership mutations -------------------------------------------------

  /**
   * Join a team as the caller. Honors the team's membership policy: `open` →
   * active immediately; `request` → pending until a manager approves; `invite`
   * / `admin` → rejected. Banned users are rejected. No special permission is
   * required.
   *
   * @param groupId - The team to join, as a decimal `BigInt` string.
   * @returns The caller's {@link GroupMember} record; its `status` reflects
   *   `active` vs. `pending`.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` if the membership policy or a ban
   *   rejects the join, or `UNAUTHENTICATED`.
   */
  async join(
    groupId: JoinTeamMutationVariables['groupId'],
  ): Promise<JoinTeamMutation['joinTeam']> {
    const data = await this.gql.request(JoinTeamDocument, { groupId });
    return data.joinTeam;
  }

  /**
   * Request to join a request-only team, creating a pending membership a
   * manager can later approve via {@link addMember}. Behaves identically to
   * {@link join}; it exists as a clearer name for request-policy UIs.
   *
   * @param groupId - The request-only team to request to join, as a decimal
   *   `BigInt` string.
   * @returns The caller's pending {@link GroupMember} record.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` if the membership policy rejects
   *   the request, or `UNAUTHENTICATED`.
   */
  async requestToJoin(
    groupId: RequestToJoinTeamMutationVariables['groupId'],
  ): Promise<RequestToJoinTeamMutation['requestToJoinTeam']> {
    const data = await this.gql.request(RequestToJoinTeamDocument, { groupId });
    return data.requestToJoinTeam;
  }

  /**
   * Leave a team (removes the caller's own membership).
   *
   * Pass an `idempotencyKey` to make retries safe: replaying with the same key
   * and identical arguments returns the first result instead of re-applying,
   * while the same key with a **different** `groupId` throws
   * {@link CrowdyGraphQLError} with `code === 'IDEMPOTENCY_CONFLICT'`. Keys
   * expire server-side after 24h. Requires game-api ≥ v0.10.3.
   *
   * @param groupId - The team to leave, as a decimal `BigInt` string.
   * @param idempotencyKey - Optional client-supplied key for safe retries.
   * @returns `true` if a membership was removed (`false` if the caller wasn't
   *   a member).
   * @throws {CrowdyGraphQLError} `IDEMPOTENCY_CONFLICT` (key reused with
   *   different arguments), or `UNAUTHENTICATED`.
   */
  async leave(
    groupId: LeaveTeamMutationVariables['groupId'],
    idempotencyKey?: LeaveTeamMutationVariables['idempotencyKey'],
  ): Promise<boolean> {
    const data = await this.gql.request(LeaveTeamDocument, { groupId, idempotencyKey });
    return data.leaveTeam;
  }

  /**
   * Add a user to a team, or approve their pending join request (upserts the
   * membership to `active`). Requires the `manage_members` team permission (app
   * admins bypass). Auto-assigns the team's default role if configured.
   *
   * @param groupId - The team to add the user to, as a decimal `BigInt`
   *   string.
   * @param userId - The user to add or approve, as a decimal `BigInt` string.
   * @returns The added/approved {@link GroupMember} record.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_members`, or `UNAUTHENTICATED`.
   */
  async addMember(
    groupId: AddTeamMemberMutationVariables['groupId'],
    userId: AddTeamMemberMutationVariables['userId'],
  ): Promise<AddTeamMemberMutation['addTeamMember']> {
    const data = await this.gql.request(AddTeamMemberDocument, { groupId, userId });
    return data.addTeamMember;
  }

  /**
   * Remove a member from a team. Requires the `manage_members` team permission,
   * except that any member may remove themselves (pass their own `userId`).
   * **Destructive**: drops the membership and its roles.
   *
   * @param groupId - The team to remove the user from, as a decimal `BigInt`
   *   string.
   * @param userId - The user to remove; may be the caller's own id to
   *   self-remove. Decimal `BigInt` string.
   * @returns `true` if a membership was removed.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` when removing
   *   another member without `manage_members`, or `UNAUTHENTICATED`.
   */
  async removeMember(
    groupId: RemoveTeamMemberMutationVariables['groupId'],
    userId: RemoveTeamMemberMutationVariables['userId'],
  ): Promise<boolean> {
    const data = await this.gql.request(RemoveTeamMemberDocument, { groupId, userId });
    return data.removeTeamMember;
  }

  /**
   * Replace a member's team roles with the given set. This is **not additive**
   * — roles not listed are removed. Requires the `manage_roles` team permission
   * (app admins bypass).
   *
   * @param input - {@link SetMemberRolesInput}: the `groupId`, the target
   *   `userId`, and `roleIds` — the complete set of team role ids the member
   *   should have (ids that are unknown or belong to another group are
   *   ignored).
   * @returns The updated {@link GroupMember} record with its new roles.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_roles`, or `UNAUTHENTICATED`.
   */
  async setMemberRoles(
    input: SetTeamMemberRolesMutationVariables['input'],
  ): Promise<SetTeamMemberRolesMutation['setTeamMemberRoles']> {
    const data = await this.gql.request(SetTeamMemberRolesDocument, { input });
    return data.setTeamMemberRoles;
  }

  // -- Role mutations -------------------------------------------------------

  /**
   * Create a custom (non-system) team role granting the given team permission
   * keys. Requires the `manage_roles` team permission (app admins bypass). Keys
   * must be valid team permission keys (`group_permission_defs`).
   *
   * @param input - {@link CreateGroupRoleInput}: the `groupId`, the `roleName`
   *   (max 128 chars, unique within the team), the `permissions` keys to grant
   *   (e.g. `manage_members`, `manage_roles`, `manage_group`; each max 64
   *   chars, defaults to none), and an optional `rank` (higher = more senior;
   *   defaults to 0).
   * @returns The created {@link GroupRole}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` on an invalid/duplicate name
   *   or unknown permission key, `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_roles`, or `UNAUTHENTICATED`.
   */
  async createRole(
    input: CreateTeamRoleMutationVariables['input'],
  ): Promise<CreateTeamRoleMutation['createTeamRole']> {
    const data = await this.gql.request(CreateTeamRoleDocument, { input });
    return data.createTeamRole;
  }

  /**
   * Update a team role's name, rank, and/or permission keys (system roles
   * cannot be renamed or re-ranked). When `input.permissions` is supplied it
   * **replaces** the role's existing keys. Requires the `manage_roles` team
   * permission (app admins bypass).
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
    input: UpdateTeamRoleMutationVariables['input'],
  ): Promise<UpdateTeamRoleMutation['updateTeamRole']> {
    const data = await this.gql.request(UpdateTeamRoleDocument, { input });
    return data.updateTeamRole;
  }

  /**
   * Delete a non-system team role. Requires the `manage_roles` team permission
   * (app admins bypass). The system `leader` role cannot be deleted.
   * **Destructive**: removes the role from any members that held it and
   * recomputes any grid ACLs the role granted on.
   *
   * @param groupRoleId - The team role to delete (must be a non-system role),
   *   as a decimal `BigInt` string.
   * @returns `true` if a role was deleted.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` / `SCOPE_MISSING` if the caller
   *   lacks `manage_roles`, `BAD_USER_INPUT` if targeting a system role, or
   *   `UNAUTHENTICATED`.
   */
  async deleteRole(
    groupRoleId: DeleteTeamRoleMutationVariables['groupRoleId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteTeamRoleDocument, { groupRoleId });
    return data.deleteTeamRole;
  }
}
