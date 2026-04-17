import type { GraphQLClient } from '../client.js';

import {
  GroupsDocument,
  type GroupsQuery,
  GroupDocument,
  type GroupQuery,
  type GroupQueryVariables,
  GroupMembershipsDocument,
  type GroupMembershipsQuery,
  type GroupMembershipsQueryVariables,
  UserGroupMembershipsDocument,
  type UserGroupMembershipsQuery,
  type UserGroupMembershipsQueryVariables,
  CreateGroupDocument,
  type CreateGroupMutation,
  type CreateGroupMutationVariables,
  UpdateGroupDocument,
  type UpdateGroupMutation,
  type UpdateGroupMutationVariables,
} from '../generated/graphql.js';

/**
 * Group queries and mutations.
 *
 * Exposed as `client.groups`.
 */
export class GroupsAPI {
  constructor(private gql: GraphQLClient) {}

  async list(): Promise<GroupsQuery['groups']> {
    const data = await this.gql.request(GroupsDocument, undefined);
    return data.groups;
  }

  async byId(id: GroupQueryVariables['id']): Promise<GroupQuery['group']> {
    const data = await this.gql.request(GroupDocument, { id });
    return data.group;
  }

  async memberships(
    groupId: GroupMembershipsQueryVariables['groupId']
  ): Promise<GroupMembershipsQuery['groupMemberships']> {
    const data = await this.gql.request(GroupMembershipsDocument, { groupId });
    return data.groupMemberships;
  }

  async userMemberships(
    userId: UserGroupMembershipsQueryVariables['userId']
  ): Promise<UserGroupMembershipsQuery['userGroupMemberships']> {
    const data = await this.gql.request(UserGroupMembershipsDocument, { userId });
    return data.userGroupMemberships;
  }

  async create(
    input: CreateGroupMutationVariables['input']
  ): Promise<CreateGroupMutation['createGroup']> {
    const data = await this.gql.request(CreateGroupDocument, { input });
    return data.createGroup;
  }

  async update(
    id: UpdateGroupMutationVariables['id'],
    input: UpdateGroupMutationVariables['input']
  ): Promise<UpdateGroupMutation['updateGroup']> {
    const data = await this.gql.request(UpdateGroupDocument, { id, input });
    return data.updateGroup;
  }
}
