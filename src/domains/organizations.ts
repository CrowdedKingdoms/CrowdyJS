import type { GraphQLClient } from '../client.js';

import {
  OrganizationDocument,
  type OrganizationQuery,
  type OrganizationQueryVariables,
  OrganizationBySlugDocument,
  type OrganizationBySlugQuery,
  type OrganizationBySlugQueryVariables,
  OrgMembersDocument,
  type OrgMembersQuery,
  type OrgMembersQueryVariables,
  MyOrganizationsDocument,
  type MyOrganizationsQuery,
  OrgPermissionsDocument,
  type OrgPermissionsQuery,
  OrgRolesDocument,
  type OrgRolesQuery,
  type OrgRolesQueryVariables,
  OrgTokensDocument,
  type OrgTokensQuery,
  type OrgTokensQueryVariables,
  CreateOrganizationDocument,
  type CreateOrganizationMutation,
  type CreateOrganizationMutationVariables,
  CreateOrgTokenDocument,
  type CreateOrgTokenMutation,
  type CreateOrgTokenMutationVariables,
  UpdateOrgTokenDocument,
  type UpdateOrgTokenMutation,
  type UpdateOrgTokenMutationVariables,
  RevokeOrgTokenDocument,
  type RevokeOrgTokenMutationVariables,
  InviteOrgMemberDocument,
  type InviteOrgMemberMutation,
  type InviteOrgMemberMutationVariables,
  RemoveOrgMemberDocument,
  type RemoveOrgMemberMutationVariables,
  UpdateOrgMemberRolesDocument,
  type UpdateOrgMemberRolesMutation,
  type UpdateOrgMemberRolesMutationVariables,
  CreateOrgRoleDocument,
  type CreateOrgRoleMutation,
  type CreateOrgRoleMutationVariables,
  UpdateOrgRoleDocument,
  type UpdateOrgRoleMutation,
  type UpdateOrgRoleMutationVariables,
  DeleteOrgRoleDocument,
  type DeleteOrgRoleMutationVariables,
  SetOrgStatusDocument,
  type SetOrgStatusMutation,
  type SetOrgStatusMutationVariables,
} from '../generated/graphql.js';

/**
 * Organization (multi-tenant studio) operations: lookup, members, roles,
 * tokens. Exposed as `client.orgs`.
 */
export class OrganizationsAPI {
  constructor(private gql: GraphQLClient) {}

  // -- Discovery ---------------------------------------------------------

  async byId(
    id: OrganizationQueryVariables['id'],
  ): Promise<OrganizationQuery['organization']> {
    const data = await this.gql.request(OrganizationDocument, { id });
    return data.organization;
  }

  async bySlug(
    slug: OrganizationBySlugQueryVariables['slug'],
  ): Promise<OrganizationBySlugQuery['organizationBySlug']> {
    const data = await this.gql.request(OrganizationBySlugDocument, { slug });
    return data.organizationBySlug;
  }

  async myOrganizations(): Promise<MyOrganizationsQuery['myOrganizations']> {
    const data = await this.gql.request(MyOrganizationsDocument, undefined);
    return data.myOrganizations;
  }

  async permissionsCatalog(): Promise<OrgPermissionsQuery['orgPermissions']> {
    const data = await this.gql.request(OrgPermissionsDocument, undefined);
    return data.orgPermissions;
  }

  // -- Members + Roles --------------------------------------------------

  async members(
    orgId: OrgMembersQueryVariables['orgId'],
  ): Promise<OrgMembersQuery['orgMembers']> {
    const data = await this.gql.request(OrgMembersDocument, { orgId });
    return data.orgMembers;
  }

  async roles(
    orgId: OrgRolesQueryVariables['orgId'],
  ): Promise<OrgRolesQuery['orgRoles']> {
    const data = await this.gql.request(OrgRolesDocument, { orgId });
    return data.orgRoles;
  }

  async createRole(
    input: CreateOrgRoleMutationVariables['input'],
  ): Promise<CreateOrgRoleMutation['createOrgRole']> {
    const data = await this.gql.request(CreateOrgRoleDocument, { input });
    return data.createOrgRole;
  }

  async updateRole(
    args: UpdateOrgRoleMutationVariables,
  ): Promise<UpdateOrgRoleMutation['updateOrgRole']> {
    const data = await this.gql.request(UpdateOrgRoleDocument, args);
    return data.updateOrgRole;
  }

  async deleteRole(
    orgRoleId: DeleteOrgRoleMutationVariables['orgRoleId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteOrgRoleDocument, { orgRoleId });
    return data.deleteOrgRole;
  }

  async inviteMember(
    input: InviteOrgMemberMutationVariables['input'],
  ): Promise<InviteOrgMemberMutation['inviteOrgMember']> {
    const data = await this.gql.request(InviteOrgMemberDocument, { input });
    return data.inviteOrgMember;
  }

  async removeMember(
    args: RemoveOrgMemberMutationVariables,
  ): Promise<boolean> {
    const data = await this.gql.request(RemoveOrgMemberDocument, args);
    return data.removeOrgMember;
  }

  async setMemberRoles(
    args: UpdateOrgMemberRolesMutationVariables,
  ): Promise<UpdateOrgMemberRolesMutation['updateOrgMemberRoles']> {
    const data = await this.gql.request(UpdateOrgMemberRolesDocument, args);
    return data.updateOrgMemberRoles;
  }

  // -- Tokens -----------------------------------------------------------

  async tokens(
    orgId: OrgTokensQueryVariables['orgId'],
  ): Promise<OrgTokensQuery['orgTokens']> {
    const data = await this.gql.request(OrgTokensDocument, { orgId });
    return data.orgTokens;
  }

  /**
   * Returns the plaintext token exactly once (on creation). Save it now;
   * subsequent listings show metadata only via the `tokens()` query.
   */
  async createToken(
    input: CreateOrgTokenMutationVariables['input'],
  ): Promise<CreateOrgTokenMutation['createOrgToken']> {
    const data = await this.gql.request(CreateOrgTokenDocument, { input });
    return data.createOrgToken;
  }

  async updateToken(
    args: UpdateOrgTokenMutationVariables,
  ): Promise<UpdateOrgTokenMutation['updateOrgToken']> {
    const data = await this.gql.request(UpdateOrgTokenDocument, args);
    return data.updateOrgToken;
  }

  async revokeToken(
    orgTokenId: RevokeOrgTokenMutationVariables['orgTokenId'],
  ): Promise<boolean> {
    const data = await this.gql.request(RevokeOrgTokenDocument, { orgTokenId });
    return data.revokeOrgToken;
  }

  // -- Lifecycle --------------------------------------------------------

  async create(
    input: CreateOrganizationMutationVariables['input'],
  ): Promise<CreateOrganizationMutation['createOrganization']> {
    const data = await this.gql.request(CreateOrganizationDocument, { input });
    return data.createOrganization;
  }

  async setStatus(
    args: SetOrgStatusMutationVariables,
  ): Promise<SetOrgStatusMutation['setOrgStatus']> {
    const data = await this.gql.request(SetOrgStatusDocument, args);
    return data.setOrgStatus;
  }
}
