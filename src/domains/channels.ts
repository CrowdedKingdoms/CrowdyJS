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
 * Channels: app-scoped player groups with role-gated messaging, built on the
 * same generic groups subsystem as Teams (group_type='channel'). Channel
 * CRUD/membership runs over the game-api GraphQL endpoint; publishing and
 * receiving channel messages happens over the realtime UDP path (`client.udp`).
 *
 * Exposed as `client.channels`.
 */
export class ChannelsAPI {
  constructor(private gql: GraphQLClient) {}

  // -- Queries --------------------------------------------------------------

  async mine(
    appId: MyChannelsQueryVariables['appId'],
  ): Promise<MyChannelsQuery['myChannels']> {
    const data = await this.gql.request(MyChannelsDocument, { appId });
    return data.myChannels;
  }

  async list(
    appId: ChannelsQueryVariables['appId'],
  ): Promise<ChannelsQuery['channels']> {
    const data = await this.gql.request(ChannelsDocument, { appId });
    return data.channels;
  }

  async get(
    groupId: ChannelQueryVariables['groupId'],
  ): Promise<ChannelQuery['channel']> {
    const data = await this.gql.request(ChannelDocument, { groupId });
    return data.channel;
  }

  async members(
    groupId: ChannelMembersQueryVariables['groupId'],
  ): Promise<ChannelMembersQuery['channelMembers']> {
    const data = await this.gql.request(ChannelMembersDocument, { groupId });
    return data.channelMembers;
  }

  async roles(
    groupId: ChannelRolesQueryVariables['groupId'],
  ): Promise<ChannelRolesQuery['channelRoles']> {
    const data = await this.gql.request(ChannelRolesDocument, { groupId });
    return data.channelRoles;
  }

  async policy(
    appId: ChannelPolicyQueryVariables['appId'],
  ): Promise<ChannelPolicyQuery['channelPolicy']> {
    const data = await this.gql.request(ChannelPolicyDocument, { appId });
    return data.channelPolicy;
  }

  // -- Channel mutations ----------------------------------------------------

  async create(
    input: CreateChannelMutationVariables['input'],
  ): Promise<CreateChannelMutation['createChannel']> {
    const data = await this.gql.request(CreateChannelDocument, { input });
    return data.createChannel;
  }

  async update(
    input: UpdateChannelMutationVariables['input'],
  ): Promise<UpdateChannelMutation['updateChannel']> {
    const data = await this.gql.request(UpdateChannelDocument, { input });
    return data.updateChannel;
  }

  async remove(
    groupId: DeleteChannelMutationVariables['groupId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteChannelDocument, { groupId });
    return data.deleteChannel;
  }

  async setPolicy(
    input: SetChannelPolicyMutationVariables['input'],
  ): Promise<SetChannelPolicyMutation['setChannelPolicy']> {
    const data = await this.gql.request(SetChannelPolicyDocument, { input });
    return data.setChannelPolicy;
  }

  // -- Membership mutations -------------------------------------------------

  async join(
    groupId: JoinChannelMutationVariables['groupId'],
  ): Promise<JoinChannelMutation['joinChannel']> {
    const data = await this.gql.request(JoinChannelDocument, { groupId });
    return data.joinChannel;
  }

  async requestToJoin(
    groupId: RequestToJoinChannelMutationVariables['groupId'],
  ): Promise<RequestToJoinChannelMutation['requestToJoinChannel']> {
    const data = await this.gql.request(RequestToJoinChannelDocument, { groupId });
    return data.requestToJoinChannel;
  }

  async leave(
    groupId: LeaveChannelMutationVariables['groupId'],
  ): Promise<boolean> {
    const data = await this.gql.request(LeaveChannelDocument, { groupId });
    return data.leaveChannel;
  }

  async addMember(
    groupId: AddChannelMemberMutationVariables['groupId'],
    userId: AddChannelMemberMutationVariables['userId'],
  ): Promise<AddChannelMemberMutation['addChannelMember']> {
    const data = await this.gql.request(AddChannelMemberDocument, { groupId, userId });
    return data.addChannelMember;
  }

  async removeMember(
    groupId: RemoveChannelMemberMutationVariables['groupId'],
    userId: RemoveChannelMemberMutationVariables['userId'],
  ): Promise<boolean> {
    const data = await this.gql.request(RemoveChannelMemberDocument, { groupId, userId });
    return data.removeChannelMember;
  }

  async setMemberRoles(
    input: SetChannelMemberRolesMutationVariables['input'],
  ): Promise<SetChannelMemberRolesMutation['setChannelMemberRoles']> {
    const data = await this.gql.request(SetChannelMemberRolesDocument, { input });
    return data.setChannelMemberRoles;
  }

  // -- Role mutations -------------------------------------------------------

  async createRole(
    input: CreateChannelRoleMutationVariables['input'],
  ): Promise<CreateChannelRoleMutation['createChannelRole']> {
    const data = await this.gql.request(CreateChannelRoleDocument, { input });
    return data.createChannelRole;
  }

  async updateRole(
    input: UpdateChannelRoleMutationVariables['input'],
  ): Promise<UpdateChannelRoleMutation['updateChannelRole']> {
    const data = await this.gql.request(UpdateChannelRoleDocument, { input });
    return data.updateChannelRole;
  }

  async deleteRole(
    groupRoleId: DeleteChannelRoleMutationVariables['groupRoleId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteChannelRoleDocument, { groupRoleId });
    return data.deleteChannelRole;
  }
}
