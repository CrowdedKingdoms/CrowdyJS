import type { GraphQLClient } from '../client.js';
import {
  AppAccessTiersDocument,
  MyAppAccessDocument,
  AppUserAccessByAppDocument,
  AppUserAccessConnectionDocument,
  RuntimePermissionsDocument,
  AppGrantMemberCandidatesDocument,
  ClaimFreeAppAccessDocument,
  GrantMyAppAccessDocument,
  CreateAccessTierDocument,
  UpdateAccessTierDocument,
  ArchiveAccessTierDocument,
  GrantAppAccessDocument,
  RevokeAppAccessDocument,
  type AppAccessTiersQuery,
  type MyAppAccessQuery,
  type AppUserAccessByAppQuery,
  type AppUserAccessConnectionQuery,
  type AppUserAccessConnectionQueryVariables,
  type RuntimePermissionsQuery,
  type AppGrantMemberCandidatesQuery,
  type ClaimFreeAppAccessMutation,
  type GrantMyAppAccessMutation,
  type CreateAccessTierMutation,
  type UpdateAccessTierMutation,
  type ArchiveAccessTierMutation,
  type GrantAppAccessMutation,
  type RevokeAppAccessMutation,
  type CreateAccessTierInput,
  type UpdateAccessTierInput,
  type GrantAppAccessInput,
} from '../generated/graphql.js';

/**
 * App access tiers + per-user access grants — exposed as `client.appAccess`
 * (and grouped under `client.admin`).
 *
 * Targets the **management-api**. Tiers define the runtime-permission bundles
 * (`access`, `teleport`, `update_voxel_data`, `use_voice_chat`, ...) a player
 * gets; grants attach a user to a tier. New apps auto-provision an open default
 * tier, so most players need no explicit grant.
 *
 * Reads of the tier catalog ({@link tiers}) are public; {@link myAccess} needs
 * a session; tier admin and grant/revoke require the `manage_access_tiers` app
 * permission. `BigInt` ids are decimal strings.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above.
 */
export class AppAccessAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * List the access tiers defined for an app. **Public.**
   *
   * @param appId - Numeric app id (`BigInt` as a decimal string).
   * @returns The app's tiers, ordered.
   */
  async tiers(appId: string): Promise<AppAccessTiersQuery['appAccessTiers']> {
    const data = await this.management.request(AppAccessTiersDocument, {
      appId,
    });
    return data.appAccessTiers;
  }

  /**
   * Return the authenticated caller's access record for an app (which tier they
   * hold and its status), or `null` if they have none.
   *
   * @param appId - Numeric app id.
   * @returns The caller's {@link AppUserAccess}, or `null`.
   */
  async myAccess(appId: string): Promise<MyAppAccessQuery['myAppAccess']> {
    const data = await this.management.request(MyAppAccessDocument, { appId });
    return data.myAppAccess;
  }

  /**
   * List the users who hold access to an app (paginated). Requires the
   * `manage_access_tiers` app permission.
   *
   * @param appId - Numeric app id.
   * @param opts - Optional `status` filter and `limit` / `offset` (default
   *   limit 50).
   * @returns The matching access records.
   */
  async usersByApp(
    appId: string,
    opts: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<AppUserAccessByAppQuery['appUserAccessByApp']> {
    const data = await this.management.request(AppUserAccessByAppDocument, {
      appId,
      status: opts.status,
      limit: opts.limit,
      offset: opts.offset,
    });
    return data.appUserAccessByApp;
  }

  /**
   * Relay-style cursor pagination over an app's access grants — the preferred
   * alternative to {@link usersByApp}. Page with `first` plus the previous
   * page's `pageInfo.endCursor` as `after`; optional `status` filter. Requires
   * the `manage_access_tiers` app permission. See
   * https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param args - `appId` plus optional `status`, `first`, and `after`.
   * @returns An {@link AppUserAccessConnection}.
   */
  async usersByAppConnection(
    args: AppUserAccessConnectionQueryVariables,
  ): Promise<AppUserAccessConnectionQuery['appUserAccessConnection']> {
    const data = await this.management.request(
      AppUserAccessConnectionDocument,
      args,
    );
    return data.appUserAccessConnection;
  }

  /**
   * List every valid runtime permission key (e.g. `access`, `teleport`,
   * `update_voxel_data`, `use_voice_chat`) that a tier or grid grant can
   * reference. **Public.**
   *
   * @returns The runtime permission keys.
   */
  async runtimePermissions(): Promise<
    RuntimePermissionsQuery['runtimePermissions']
  > {
    const data = await this.management.request(RuntimePermissionsDocument);
    return data.runtimePermissions;
  }

  /**
   * List org members eligible for a manual app-access grant (those without an
   * active grant yet). Requires the `manage_access_tiers` app permission. Pair
   * with {@link grant} to grant the chosen candidate.
   *
   * @param appId - Numeric app id.
   * @returns The candidate users (id + email/gamertag where known).
   */
  async grantMemberCandidates(
    appId: string,
  ): Promise<AppGrantMemberCandidatesQuery['appGrantMemberCandidates']> {
    const data = await this.management.request(
      AppGrantMemberCandidatesDocument,
      { appId },
    );
    return data.appGrantMemberCandidates;
  }

  /**
   * Self-service: claim the app's free/default tier for the authenticated
   * caller (no admin permission required). Use when an app exposes a free tier
   * a player can opt into themselves.
   *
   * @param appId - Numeric app id.
   * @returns The caller's new {@link AppUserAccess} record.
   */
  async claimFree(
    appId: string,
  ): Promise<ClaimFreeAppAccessMutation['claimFreeAppAccess']> {
    const data = await this.management.request(ClaimFreeAppAccessDocument, {
      appId,
    });
    return data.claimFreeAppAccess;
  }

  /**
   * Self-grant access to an app via its default tier for the authenticated
   * caller, when the caller is an org member of the app's owning org.
   *
   * @param appId - Numeric app id.
   * @returns The caller's new {@link AppUserAccess} record.
   */
  async grantMine(
    appId: string,
  ): Promise<GrantMyAppAccessMutation['grantMyAppAccess']> {
    const data = await this.management.request(GrantMyAppAccessDocument, {
      appId,
    });
    return data.grantMyAppAccess;
  }

  /**
   * Create a new access tier for an app. Requires the `manage_access_tiers` app
   * permission.
   *
   * @param input - {@link CreateAccessTierInput}: `appId`, `name`, runtime
   *   `permissions`, pricing/free flags.
   * @returns The created tier.
   */
  async createTier(
    input: CreateAccessTierInput,
  ): Promise<CreateAccessTierMutation['createAccessTier']> {
    const data = await this.management.request(CreateAccessTierDocument, {
      input,
    });
    return data.createAccessTier;
  }

  /**
   * Update an existing access tier. Requires the `manage_access_tiers` app
   * permission.
   *
   * @param tierId - Numeric tier id.
   * @param input - {@link UpdateAccessTierInput} fields to change.
   * @returns The updated tier.
   */
  async updateTier(
    tierId: string,
    input: UpdateAccessTierInput,
  ): Promise<UpdateAccessTierMutation['updateAccessTier']> {
    const data = await this.management.request(UpdateAccessTierDocument, {
      tierId,
      input,
    });
    return data.updateAccessTier;
  }

  /**
   * Archive (soft-delete) an access tier so it can no longer be granted.
   * Requires the `manage_access_tiers` app permission.
   *
   * @param tierId - Numeric tier id.
   * @returns The archived tier's new status.
   */
  async archiveTier(
    tierId: string,
  ): Promise<ArchiveAccessTierMutation['archiveAccessTier']> {
    const data = await this.management.request(ArchiveAccessTierDocument, {
      tierId,
    });
    return data.archiveAccessTier;
  }

  /**
   * Grant a user access to an app at a given tier. Requires the
   * `manage_access_tiers` app permission. Triggers replica-sync so the grant
   * (and its grid permissions) reaches the game DB / Buddy.
   *
   * @param input - {@link GrantAppAccessInput}: `appId`, `userId`, `tierId`.
   * @returns The created/updated access record.
   */
  async grant(
    input: GrantAppAccessInput,
  ): Promise<GrantAppAccessMutation['grantAppAccess']> {
    const data = await this.management.request(GrantAppAccessDocument, {
      input,
    });
    return data.grantAppAccess;
  }

  /**
   * Revoke a user's access to an app. Requires the `manage_access_tiers` app
   * permission.
   *
   * @param appId - Numeric app id.
   * @param userId - Numeric id of the user whose access is revoked.
   * @returns `true` on success.
   */
  async revoke(
    appId: string,
    userId: string,
  ): Promise<RevokeAppAccessMutation['revokeAppAccess']> {
    const data = await this.management.request(RevokeAppAccessDocument, {
      appId,
      userId,
    });
    return data.revokeAppAccess;
  }
}
