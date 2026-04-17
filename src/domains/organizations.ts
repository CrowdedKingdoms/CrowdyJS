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
  CreateOrganizationDocument,
  type CreateOrganizationMutation,
  type CreateOrganizationMutationVariables,
  CreateOrgTokenDocument,
  type CreateOrgTokenMutation,
  type CreateOrgTokenMutationVariables,
  InviteOrgMemberDocument,
  type InviteOrgMemberMutation,
  type InviteOrgMemberMutationVariables,
} from '../generated/graphql.js';

/**
 * Organization (multi-tenant studio) operations: lookup, members, tokens.
 *
 * Exposed as `client.orgs`.
 */
export class OrganizationsAPI {
  constructor(private gql: GraphQLClient) {}

  async byId(id: OrganizationQueryVariables['id']): Promise<OrganizationQuery['organization']> {
    const data = await this.gql.request(OrganizationDocument, { id });
    return data.organization;
  }

  async bySlug(
    slug: OrganizationBySlugQueryVariables['slug']
  ): Promise<OrganizationBySlugQuery['organizationBySlug']> {
    const data = await this.gql.request(OrganizationBySlugDocument, { slug });
    return data.organizationBySlug;
  }

  async members(
    orgId: OrgMembersQueryVariables['orgId']
  ): Promise<OrgMembersQuery['orgMembers']> {
    const data = await this.gql.request(OrgMembersDocument, { orgId });
    return data.orgMembers;
  }

  async create(
    input: CreateOrganizationMutationVariables['input']
  ): Promise<CreateOrganizationMutation['createOrganization']> {
    const data = await this.gql.request(CreateOrganizationDocument, { input });
    return data.createOrganization;
  }

  async createOrgToken(
    input: CreateOrgTokenMutationVariables['input']
  ): Promise<CreateOrgTokenMutation['createOrgToken']> {
    const data = await this.gql.request(CreateOrgTokenDocument, { input });
    return data.createOrgToken;
  }

  async inviteMember(
    input: InviteOrgMemberMutationVariables['input']
  ): Promise<InviteOrgMemberMutation['inviteOrgMember']> {
    const data = await this.gql.request(InviteOrgMemberDocument, { input });
    return data.inviteOrgMember;
  }
}
