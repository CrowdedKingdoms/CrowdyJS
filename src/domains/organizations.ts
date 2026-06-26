import type { GraphQLClient } from '../client.js';
import {
  OrganizationDocument,
  OrganizationBySlugDocument,
  MyOrganizationsDocument,
  OrgMembersDocument,
  OrgRolesDocument,
  MemberRolesDocument,
  OrgPermissionsDocument,
  OrgTokensDocument,
  CreateOrganizationDocument,
  SetOrgStatusDocument,
  CreateOrgTokenDocument,
  UpdateOrgTokenDocument,
  RevokeOrgTokenDocument,
  InviteOrgMemberDocument,
  RemoveOrgMemberDocument,
  UpdateOrgMemberRolesDocument,
  CreateOrgRoleDocument,
  UpdateOrgRoleDocument,
  DeleteOrgRoleDocument,
  type OrganizationQuery,
  type OrganizationBySlugQuery,
  type MyOrganizationsQuery,
  type OrgMembersQuery,
  type OrgRolesQuery,
  type MemberRolesQuery,
  type OrgPermissionsQuery,
  type OrgTokensQuery,
  type CreateOrganizationMutation,
  type SetOrgStatusMutation,
  type CreateOrgTokenMutation,
  type UpdateOrgTokenMutation,
  type RevokeOrgTokenMutation,
  type InviteOrgMemberMutation,
  type RemoveOrgMemberMutation,
  type UpdateOrgMemberRolesMutation,
  type CreateOrgRoleMutation,
  type UpdateOrgRoleMutation,
  type DeleteOrgRoleMutation,
  type CreateOrganizationInput,
  type CreateOrgTokenInput,
  type UpdateOrgTokenInput,
  type InviteOrgMemberInput,
  type CreateOrgRoleInput,
  type UpdateOrgRoleInput,
} from '../generated/graphql.js';

/**
 * Organizations, members, roles (RBAC), and org API tokens — exposed as
 * `client.organizations` (and grouped under `client.admin`).
 *
 * Targets the **management-api**. This is the studio-admin surface: an
 * organization owns apps, billing, quotas, and environments, and its RBAC
 * grants (`manage_members`, `manage_tokens`, ...) gate the rest of the admin
 * APIs. Most operations require an authenticated caller who is an active member
 * of the org with the relevant permission; reads such as {@link permissions}
 * and {@link bySlug} are public.
 *
 * `BigInt` ids (`orgId`, `userId`, `orgRoleId`, `orgTokenId`) are decimal
 * strings.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a session, `FORBIDDEN`
 *   / `SCOPE_MISSING` when the caller lacks the required org permission.
 */
export class OrganizationsAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * Fetch a single organization by numeric id. Requires authentication.
   *
   * @param orgId - Numeric org id (`BigInt` as a decimal string).
   * @returns The {@link Organization}, or `null` if it does not exist.
   */
  async get(orgId: string): Promise<OrganizationQuery['organization']> {
    const data = await this.management.request(OrganizationDocument, {
      id: orgId,
    });
    return data.organization;
  }

  /**
   * Resolve an organization by its URL slug. **Public** — no session required.
   *
   * @param slug - The org's URL slug (e.g. `"acme"`).
   * @returns The {@link Organization}, or `null` if no match.
   */
  async bySlug(
    slug: string,
  ): Promise<OrganizationBySlugQuery['organizationBySlug']> {
    const data = await this.management.request(OrganizationBySlugDocument, {
      slug,
    });
    return data.organizationBySlug;
  }

  /**
   * List the organizations the authenticated caller is an active member of,
   * with their per-org permissions and roles.
   *
   * @returns An array of {@link OrgMembership} (empty if the caller belongs to
   *   no orgs).
   */
  async mine(): Promise<MyOrganizationsQuery['myOrganizations']> {
    const data = await this.management.request(MyOrganizationsDocument, {});
    return data.myOrganizations;
  }

  /**
   * List members of an organization. Requires the `manage_members` org
   * permission.
   *
   * @param orgId - Numeric org id.
   * @returns The org's members with their roles.
   */
  async members(orgId: string): Promise<OrgMembersQuery['orgMembers']> {
    const data = await this.management.request(OrgMembersDocument, { orgId });
    return data.orgMembers;
  }

  /**
   * List the custom + system roles defined for an organization. Requires the
   * `manage_members` org permission.
   *
   * @param orgId - Numeric org id.
   * @returns The org's roles.
   */
  async roles(orgId: string): Promise<OrgRolesQuery['orgRoles']> {
    const data = await this.management.request(OrgRolesDocument, { orgId });
    return data.orgRoles;
  }

  /**
   * List the roles currently assigned to one organization member. Requires the
   * `manage_members` org permission.
   *
   * @param orgMemberId - Numeric org-member id (`BigInt` as a decimal string).
   * @returns The member's roles.
   */
  async memberRoles(
    orgMemberId: string,
  ): Promise<MemberRolesQuery['memberRoles']> {
    const data = await this.management.request(MemberRolesDocument, {
      orgMemberId,
    });
    return data.memberRoles;
  }

  /**
   * List every assignable org permission key with its description. **Public** —
   * useful for building a role editor UI.
   *
   * @returns The catalog of org permissions.
   */
  async permissions(): Promise<OrgPermissionsQuery['orgPermissions']> {
    const data = await this.management.request(OrgPermissionsDocument, {});
    return data.orgPermissions;
  }

  /**
   * List the API tokens issued for an organization (metadata only; the secret
   * is shown once at creation). Requires the `manage_tokens` org permission.
   *
   * @param orgId - Numeric org id.
   * @returns The org's API tokens.
   */
  async tokens(orgId: string): Promise<OrgTokensQuery['orgTokens']> {
    const data = await this.management.request(OrgTokensDocument, { orgId });
    return data.orgTokens;
  }

  /**
   * Create a new organization owned by the authenticated caller. The caller
   * becomes the owner with full permissions.
   *
   * @param input - {@link CreateOrganizationInput}: `name` and a unique `slug`.
   * @returns The created {@link Organization}.
   */
  async create(
    input: CreateOrganizationInput,
  ): Promise<CreateOrganizationMutation['createOrganization']> {
    const data = await this.management.request(CreateOrganizationDocument, {
      input,
    });
    return data.createOrganization;
  }

  /**
   * Set an organization's lifecycle status. **Super-admin only.**
   *
   * @param orgId - Numeric org id.
   * @param status - The new status (e.g. `"active"`, `"suspended"`).
   * @returns The updated {@link Organization}.
   */
  async setStatus(
    orgId: string,
    status: string,
  ): Promise<SetOrgStatusMutation['setOrgStatus']> {
    const data = await this.management.request(SetOrgStatusDocument, {
      orgId,
      status,
    });
    return data.setOrgStatus;
  }

  /**
   * Mint a new org API token (for server-side studio backends). Requires the
   * `manage_tokens` org permission. The plaintext secret is returned **once**.
   *
   * @param input - {@link CreateOrgTokenInput}: `orgId`, `name`, optional
   *   `permissions` and `expiresAt`.
   * @returns The created token including its one-time plaintext secret.
   */
  async createToken(
    input: CreateOrgTokenInput,
  ): Promise<CreateOrgTokenMutation['createOrgToken']> {
    const data = await this.management.request(CreateOrgTokenDocument, {
      input,
    });
    return data.createOrgToken;
  }

  /**
   * Update an org token's metadata (name / permissions / expiry). Requires the
   * `manage_tokens` org permission.
   *
   * @param orgTokenId - Numeric token id.
   * @param input - {@link UpdateOrgTokenInput} fields to change.
   * @returns The updated token metadata.
   */
  async updateToken(
    orgTokenId: string,
    input: UpdateOrgTokenInput,
  ): Promise<UpdateOrgTokenMutation['updateOrgToken']> {
    const data = await this.management.request(UpdateOrgTokenDocument, {
      orgTokenId,
      input,
    });
    return data.updateOrgToken;
  }

  /**
   * Revoke (disable) an org token. Requires the `manage_tokens` org permission.
   *
   * @param orgTokenId - Numeric token id.
   * @returns `true` on success.
   */
  async revokeToken(
    orgTokenId: string,
  ): Promise<RevokeOrgTokenMutation['revokeOrgToken']> {
    const data = await this.management.request(RevokeOrgTokenDocument, {
      orgTokenId,
    });
    return data.revokeOrgToken;
  }

  /**
   * Invite a user to an organization (by email or user id), optionally with
   * initial roles. Requires the `manage_members` org permission.
   *
   * @param input - {@link InviteOrgMemberInput}.
   * @returns The created membership.
   */
  async inviteMember(
    input: InviteOrgMemberInput,
  ): Promise<InviteOrgMemberMutation['inviteOrgMember']> {
    const data = await this.management.request(InviteOrgMemberDocument, {
      input,
    });
    return data.inviteOrgMember;
  }

  /**
   * Remove a member from an organization. Requires the `manage_members` org
   * permission.
   *
   * @param orgId - Numeric org id.
   * @param userId - Numeric id of the member to remove.
   * @returns `true` on success.
   */
  async removeMember(
    orgId: string,
    userId: string,
  ): Promise<RemoveOrgMemberMutation['removeOrgMember']> {
    const data = await this.management.request(RemoveOrgMemberDocument, {
      orgId,
      userId,
    });
    return data.removeOrgMember;
  }

  /**
   * Replace a member's role assignments. Requires the `manage_members` org
   * permission.
   *
   * @param orgId - Numeric org id.
   * @param userId - Numeric id of the member.
   * @param roleIds - The full set of role ids the member should hold.
   * @returns The updated membership.
   */
  async setMemberRoles(
    orgId: string,
    userId: string,
    roleIds: string[],
  ): Promise<UpdateOrgMemberRolesMutation['updateOrgMemberRoles']> {
    const data = await this.management.request(UpdateOrgMemberRolesDocument, {
      orgId,
      userId,
      roleIds,
    });
    return data.updateOrgMemberRoles;
  }

  /**
   * Create a custom org role with a set of permissions. Requires the
   * `manage_members` org permission.
   *
   * @param input - {@link CreateOrgRoleInput}: `orgId`, `roleName`,
   *   `permissions`.
   * @returns The created {@link OrgRole}.
   */
  async createRole(
    input: CreateOrgRoleInput,
  ): Promise<CreateOrgRoleMutation['createOrgRole']> {
    const data = await this.management.request(CreateOrgRoleDocument, {
      input,
    });
    return data.createOrgRole;
  }

  /**
   * Update a custom org role's name/permissions. Requires the `manage_members`
   * org permission. System roles cannot be edited.
   *
   * @param orgRoleId - Numeric role id.
   * @param input - {@link UpdateOrgRoleInput} fields to change.
   * @returns The updated {@link OrgRole}.
   */
  async updateRole(
    orgRoleId: string,
    input: UpdateOrgRoleInput,
  ): Promise<UpdateOrgRoleMutation['updateOrgRole']> {
    const data = await this.management.request(UpdateOrgRoleDocument, {
      orgRoleId,
      input,
    });
    return data.updateOrgRole;
  }

  /**
   * Delete a custom org role. Requires the `manage_members` org permission.
   * System roles cannot be deleted.
   *
   * @param orgRoleId - Numeric role id.
   * @returns `true` on success.
   */
  async deleteRole(
    orgRoleId: string,
  ): Promise<DeleteOrgRoleMutation['deleteOrgRole']> {
    const data = await this.management.request(DeleteOrgRoleDocument, {
      orgRoleId,
    });
    return data.deleteOrgRole;
  }
}
