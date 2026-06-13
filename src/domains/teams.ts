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
 * Teams: app-scoped player groups with roles and delegated management, built
 * on the same generic groups subsystem as Channels (group_type='team'). Team
 * CRUD, membership, and roles run over the game-api GraphQL endpoint. Unlike
 * channels, teams have no realtime messaging path.
 *
 * Exposed as `client.teams`.
 */
export class TeamsAPI {
  constructor(private gql: GraphQLClient) {}

  // -- Queries --------------------------------------------------------------

  async mine(
    appId: MyTeamsQueryVariables['appId'],
  ): Promise<MyTeamsQuery['myTeams']> {
    const data = await this.gql.request(MyTeamsDocument, { appId });
    return data.myTeams;
  }

  async list(
    appId: TeamsQueryVariables['appId'],
  ): Promise<TeamsQuery['teams']> {
    const data = await this.gql.request(TeamsDocument, { appId });
    return data.teams;
  }

  async get(groupId: TeamQueryVariables['groupId']): Promise<TeamQuery['team']> {
    const data = await this.gql.request(TeamDocument, { groupId });
    return data.team;
  }

  async members(
    groupId: TeamMembersQueryVariables['groupId'],
  ): Promise<TeamMembersQuery['teamMembers']> {
    const data = await this.gql.request(TeamMembersDocument, { groupId });
    return data.teamMembers;
  }

  async roles(
    groupId: TeamRolesQueryVariables['groupId'],
  ): Promise<TeamRolesQuery['teamRoles']> {
    const data = await this.gql.request(TeamRolesDocument, { groupId });
    return data.teamRoles;
  }

  async policy(
    appId: TeamPolicyQueryVariables['appId'],
  ): Promise<TeamPolicyQuery['teamPolicy']> {
    const data = await this.gql.request(TeamPolicyDocument, { appId });
    return data.teamPolicy;
  }

  // -- Team mutations -------------------------------------------------------

  async create(
    input: CreateTeamMutationVariables['input'],
  ): Promise<CreateTeamMutation['createTeam']> {
    const data = await this.gql.request(CreateTeamDocument, { input });
    return data.createTeam;
  }

  async update(
    input: UpdateTeamMutationVariables['input'],
  ): Promise<UpdateTeamMutation['updateTeam']> {
    const data = await this.gql.request(UpdateTeamDocument, { input });
    return data.updateTeam;
  }

  async remove(
    groupId: DeleteTeamMutationVariables['groupId'],
    idempotencyKey?: DeleteTeamMutationVariables['idempotencyKey'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteTeamDocument, { groupId, idempotencyKey });
    return data.deleteTeam;
  }

  async setPolicy(
    input: SetTeamPolicyMutationVariables['input'],
  ): Promise<SetTeamPolicyMutation['setTeamPolicy']> {
    const data = await this.gql.request(SetTeamPolicyDocument, { input });
    return data.setTeamPolicy;
  }

  // -- Membership mutations -------------------------------------------------

  async join(
    groupId: JoinTeamMutationVariables['groupId'],
  ): Promise<JoinTeamMutation['joinTeam']> {
    const data = await this.gql.request(JoinTeamDocument, { groupId });
    return data.joinTeam;
  }

  async requestToJoin(
    groupId: RequestToJoinTeamMutationVariables['groupId'],
  ): Promise<RequestToJoinTeamMutation['requestToJoinTeam']> {
    const data = await this.gql.request(RequestToJoinTeamDocument, { groupId });
    return data.requestToJoinTeam;
  }

  async leave(
    groupId: LeaveTeamMutationVariables['groupId'],
    idempotencyKey?: LeaveTeamMutationVariables['idempotencyKey'],
  ): Promise<boolean> {
    const data = await this.gql.request(LeaveTeamDocument, { groupId, idempotencyKey });
    return data.leaveTeam;
  }

  async addMember(
    groupId: AddTeamMemberMutationVariables['groupId'],
    userId: AddTeamMemberMutationVariables['userId'],
  ): Promise<AddTeamMemberMutation['addTeamMember']> {
    const data = await this.gql.request(AddTeamMemberDocument, { groupId, userId });
    return data.addTeamMember;
  }

  async removeMember(
    groupId: RemoveTeamMemberMutationVariables['groupId'],
    userId: RemoveTeamMemberMutationVariables['userId'],
  ): Promise<boolean> {
    const data = await this.gql.request(RemoveTeamMemberDocument, { groupId, userId });
    return data.removeTeamMember;
  }

  async setMemberRoles(
    input: SetTeamMemberRolesMutationVariables['input'],
  ): Promise<SetTeamMemberRolesMutation['setTeamMemberRoles']> {
    const data = await this.gql.request(SetTeamMemberRolesDocument, { input });
    return data.setTeamMemberRoles;
  }

  // -- Role mutations -------------------------------------------------------

  async createRole(
    input: CreateTeamRoleMutationVariables['input'],
  ): Promise<CreateTeamRoleMutation['createTeamRole']> {
    const data = await this.gql.request(CreateTeamRoleDocument, { input });
    return data.createTeamRole;
  }

  async updateRole(
    input: UpdateTeamRoleMutationVariables['input'],
  ): Promise<UpdateTeamRoleMutation['updateTeamRole']> {
    const data = await this.gql.request(UpdateTeamRoleDocument, { input });
    return data.updateTeamRole;
  }

  async deleteRole(
    groupRoleId: DeleteTeamRoleMutationVariables['groupRoleId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteTeamRoleDocument, { groupRoleId });
    return data.deleteTeamRole;
  }
}
