import type { GraphQLClient } from '../client.js';
import {
  MarketplaceListingsDocument,
  MarketplaceListingVersionsDocument,
  MarketplaceMyAcquisitionsDocument,
  MarketplaceMyInstallsDocument,
  MarketplaceGridClientModsDocument,
  MarketplaceClientArtifactDocument,
  MarketplacePublishListingDocument,
  MarketplacePublishVersionDocument,
  MarketplaceAcquireDocument,
  MarketplaceInstallDocument,
  MarketplaceUninstallDocument,
  MarketplaceConsentGridClientModDocument,
  MarketplaceGridClaimPolicyDocument,
  MarketplaceGridClaimRequestsDocument,
  MarketplaceClaimGridOwnershipDocument,
  MarketplaceDecideGridClaimDocument,
  MarketplaceIssueGridClaimInviteDocument,
  MarketplaceAdmissionQueueDocument,
  MarketplaceAppListingsDocument,
  MarketplaceAppAcquisitionsDocument,
  MarketplaceTransferListingDocument,
  MarketplaceSetListingStatusDocument,
  MarketplaceSetGridClaimPolicyDocument,
  type MarketplaceListingsQuery,
  type MarketplaceListingsQueryVariables,
  type MarketplaceListingVersionsQuery,
  type MarketplaceListingVersionsQueryVariables,
  type MarketplaceMyAcquisitionsQuery,
  type MarketplaceMyAcquisitionsQueryVariables,
  type MarketplaceMyInstallsQuery,
  type MarketplaceMyInstallsQueryVariables,
  type MarketplaceGridClientModsQuery,
  type MarketplaceGridClientModsQueryVariables,
  type MarketplaceClientArtifactQuery,
  type MarketplaceClientArtifactQueryVariables,
  type MarketplacePublishListingMutation,
  type MarketplacePublishListingMutationVariables,
  type MarketplacePublishVersionMutation,
  type MarketplacePublishVersionMutationVariables,
  type MarketplaceAcquireMutation,
  type MarketplaceAcquireMutationVariables,
  type MarketplaceInstallMutation,
  type MarketplaceInstallMutationVariables,
  type MarketplaceUninstallMutationVariables,
  type MarketplaceConsentGridClientModMutationVariables,
  type MarketplaceGridClaimPolicyQuery,
  type MarketplaceGridClaimPolicyQueryVariables,
  type MarketplaceGridClaimRequestsQuery,
  type MarketplaceGridClaimRequestsQueryVariables,
  type MarketplaceClaimGridOwnershipMutation,
  type MarketplaceClaimGridOwnershipMutationVariables,
  type MarketplaceDecideGridClaimMutation,
  type MarketplaceDecideGridClaimMutationVariables,
  type MarketplaceIssueGridClaimInviteMutationVariables,
  type MarketplaceAdmissionQueueQuery,
  type MarketplaceAdmissionQueueQueryVariables,
  type MarketplaceAppListingsQuery,
  type MarketplaceAppListingsQueryVariables,
  type MarketplaceAppAcquisitionsQuery,
  type MarketplaceAppAcquisitionsQueryVariables,
  type MarketplaceTransferListingMutation,
  type MarketplaceTransferListingMutationVariables,
  type MarketplaceSetListingStatusMutation,
  type MarketplaceSetListingStatusMutationVariables,
  type MarketplaceSetGridClaimPolicyMutation,
  type MarketplaceSetGridClaimPolicyMutationVariables,
} from '../generated/graphql.js';

/**
 * The P4a player-code marketplace (free mode) — exposed as
 * `client.marketplace`. Player-facing browse/publish/acquire/install/consent
 * and the D4 grid claim flows route to the Game API; studio moderation
 * (admission queue, catalog administration, ownership transfer, claim-policy
 * config) routes to the Management API.
 *
 * No money moves through any of these calls: every listing is free in P4a,
 * an acquisition is an entitlement write, and the paid modes ship with P4b.
 * Publishing snapshots artifact hashes and the DERIVED capability summary —
 * never source; installs consent to the summary's hash.
 */
export class MarketplaceAPI {
  constructor(
    private readonly game: GraphQLClient,
    private readonly management: GraphQLClient,
  ) {}

  // -- Store (Game API) ---------------------------------------------------------

  /** Browse the app's active listings with admission standing per listing. */
  async listings(
    variables: MarketplaceListingsQueryVariables,
  ): Promise<MarketplaceListingsQuery['playerCodeListings']> {
    const data = await this.game.request(
      MarketplaceListingsDocument,
      variables,
    );
    return data.playerCodeListings;
  }

  /** Published versions of one listing (capability summaries + consent hashes). */
  async versions(
    variables: MarketplaceListingVersionsQueryVariables,
  ): Promise<MarketplaceListingVersionsQuery['playerCodeListingVersions']> {
    const data = await this.game.request(
      MarketplaceListingVersionsDocument,
      variables,
    );
    return data.playerCodeListingVersions;
  }

  /** The caller's entitlements in this app. */
  async myAcquisitions(
    variables: MarketplaceMyAcquisitionsQueryVariables,
  ): Promise<MarketplaceMyAcquisitionsQuery['myPlayerCodeAcquisitions']> {
    const data = await this.game.request(
      MarketplaceMyAcquisitionsDocument,
      variables,
    );
    return data.myPlayerCodeAcquisitions;
  }

  /** The caller's active installs in this app. */
  async myInstalls(
    variables: MarketplaceMyInstallsQueryVariables,
  ): Promise<MarketplaceMyInstallsQuery['myPlayerCodeInstalls']> {
    const data = await this.game.request(
      MarketplaceMyInstallsDocument,
      variables,
    );
    return data.myPlayerCodeInstalls;
  }

  /** Create a listing (personal, or org-owned via input.ownerOrgId). */
  async publishListing(
    variables: MarketplacePublishListingMutationVariables,
  ): Promise<MarketplacePublishListingMutation['publishPlayerCode']> {
    const data = await this.game.request(
      MarketplacePublishListingDocument,
      variables,
    );
    return data.publishPlayerCode;
  }

  /** Publish an immutable version from compiled module versions (hashes only). */
  async publishVersion(
    variables: MarketplacePublishVersionMutationVariables,
  ): Promise<MarketplacePublishVersionMutation['publishPlayerCodeVersion']> {
    const data = await this.game.request(
      MarketplacePublishVersionDocument,
      variables,
    );
    return data.publishPlayerCodeVersion;
  }

  /** Free acquisition (entitlement write; idempotent per listing+caller). */
  async acquire(
    variables: MarketplaceAcquireMutationVariables,
  ): Promise<MarketplaceAcquireMutation['acquirePlayerCode']> {
    const data = await this.game.request(
      MarketplaceAcquireDocument,
      variables,
    );
    return data.acquirePlayerCode;
  }

  /**
   * Install an acquisition after consenting to the version's capability
   * hash. Server/bundled listings need an owned target gridId.
   */
  async install(
    variables: MarketplaceInstallMutationVariables,
  ): Promise<MarketplaceInstallMutation['installPlayerCode']> {
    const data = await this.game.request(
      MarketplaceInstallDocument,
      variables,
    );
    return data.installPlayerCode;
  }

  /** Remove instances/attachments/fetch rights; the acquisition is retained. */
  async uninstall(
    variables: MarketplaceUninstallMutationVariables,
  ): Promise<boolean> {
    const data = await this.game.request(
      MarketplaceUninstallDocument,
      variables,
    );
    return data.uninstallPlayerCode;
  }

  // -- Grid-attached client mods (D2) --------------------------------------------

  /** Client mods attached to a grid, with the caller's consent state. */
  async gridClientMods(
    variables: MarketplaceGridClientModsQueryVariables,
  ): Promise<MarketplaceGridClientModsQuery['gridClientMods']> {
    const data = await this.game.request(
      MarketplaceGridClientModsDocument,
      variables,
    );
    return data.gridClientMods;
  }

  /** Consent to one attachment's exact capability hash (per player). */
  async consentGridClientMod(
    variables: MarketplaceConsentGridClientModMutationVariables,
  ): Promise<boolean> {
    const data =
      await this.game.request(
        MarketplaceConsentGridClientModDocument,
        variables,
      );
    return data.consentGridClientMod;
  }

  /** Fetch an acquired/attached listing's client artifact (base64 + metadata). */
  async clientArtifact(
    variables: MarketplaceClientArtifactQueryVariables,
  ): Promise<MarketplaceClientArtifactQuery['playerCodeClientArtifact']> {
    const data = await this.game.request(
      MarketplaceClientArtifactDocument,
      variables,
    );
    return data.playerCodeClientArtifact;
  }

  /**
   * Fetch and decode a client artifact into broker inputs (bytes, content
   * hash, per-dispatch fuel budget) — the marketplace twin of
   * `playerCompute.artifactBytes` for acquired and grid-attached mods.
   */
  async clientArtifactBytes(
    variables: MarketplaceClientArtifactQueryVariables,
  ): Promise<{
    bytes: ArrayBuffer;
    artifactHash: string;
    fuelPerDispatch: bigint;
    contractJson: string | null;
    versionId: string;
  }> {
    const a = await this.clientArtifact(variables);
    const binary = atob(a.artifactBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return {
      bytes: bytes.buffer,
      artifactHash: a.artifactHash,
      fuelPerDispatch: BigInt(a.clientFuelPerDispatch),
      contractJson: a.contractJson ?? null,
      versionId: a.versionId,
    };
  }

  // -- D4 grid claim flows (Game API) ---------------------------------------------

  /** The app's claim policy (self_claim / approval / invite / marketplace_only). */
  async gridClaimPolicy(
    variables: MarketplaceGridClaimPolicyQueryVariables,
  ): Promise<MarketplaceGridClaimPolicyQuery['gridClaimPolicy']> {
    const data = await this.game.request(
      MarketplaceGridClaimPolicyDocument,
      variables,
    );
    return data.gridClaimPolicy;
  }

  /** Pending claim requests (approvers see the app queue; players their own). */
  async gridClaimRequests(
    variables: MarketplaceGridClaimRequestsQueryVariables,
  ): Promise<MarketplaceGridClaimRequestsQuery['gridClaimRequests']> {
    const data = await this.game.request(
      MarketplaceGridClaimRequestsDocument,
      variables,
    );
    return data.gridClaimRequests;
  }

  /** Claim grid ownership under the app policy (server-authorized, D4). */
  async claimGridOwnership(
    variables: MarketplaceClaimGridOwnershipMutationVariables,
  ): Promise<MarketplaceClaimGridOwnershipMutation['claimGridOwnership']> {
    const data = await this.game.request(
      MarketplaceClaimGridOwnershipDocument,
      variables,
    );
    return data.claimGridOwnership;
  }

  /** Approve or deny a pending claim request (approvers/staff). */
  async decideGridClaim(
    variables: MarketplaceDecideGridClaimMutationVariables,
  ): Promise<MarketplaceDecideGridClaimMutation['decideGridClaim']> {
    const data = await this.game.request(
      MarketplaceDecideGridClaimDocument,
      variables,
    );
    return data.decideGridClaim;
  }

  /** Issue a standing claim invite (approvers/staff; INVITE mode). */
  async issueGridClaimInvite(
    variables: MarketplaceIssueGridClaimInviteMutationVariables,
  ): Promise<boolean> {
    const data =
      await this.game.request(
        MarketplaceIssueGridClaimInviteDocument,
        variables,
      );
    return data.issueGridClaimInvite;
  }

  // -- Studio moderation (Management API) ------------------------------------------

  /** The admission queue: listings joined with allow-list standing. */
  async admissionQueue(
    variables: MarketplaceAdmissionQueueQueryVariables,
  ): Promise<MarketplaceAdmissionQueueQuery['appCodeAdmissionQueue']> {
    const data = await this.management.request(
      MarketplaceAdmissionQueueDocument,
      variables,
    );
    return data.appCodeAdmissionQueue;
  }

  /** Studio catalog administration view (includes delisted/killed on request). */
  async appListings(
    variables: MarketplaceAppListingsQueryVariables,
  ): Promise<MarketplaceAppListingsQuery['appPlayerCodeListings']> {
    const data = await this.management.request(
      MarketplaceAppListingsDocument,
      variables,
    );
    return data.appPlayerCodeListings;
  }

  /** All acquisitions in the app (studio audit view). */
  async appAcquisitions(
    variables: MarketplaceAppAcquisitionsQueryVariables,
  ): Promise<MarketplaceAppAcquisitionsQuery['appPlayerCodeAcquisitions']> {
    const data =
      await this.management.request(
        MarketplaceAppAcquisitionsDocument,
        variables,
      );
    return data.appPlayerCodeAcquisitions;
  }

  /** Audited personal<->org listing transfer (DN-9). */
  async transferListing(
    variables: MarketplaceTransferListingMutationVariables,
  ): Promise<MarketplaceTransferListingMutation['transferPlayerCodeListing']> {
    const data =
      await this.management.request(
        MarketplaceTransferListingDocument,
        variables,
      );
    return data.transferPlayerCodeListing;
  }

  /**
   * Catalog status: DELISTED/ACTIVE are owner actions; KILLED is the studio
   * catalog kill — pair with playerCompute.setSwitch({scope:'listing'}) to
   * also disable running installs fleet-wide.
   */
  async setListingStatus(
    variables: MarketplaceSetListingStatusMutationVariables,
  ): Promise<MarketplaceSetListingStatusMutation['setPlayerCodeListingStatus']> {
    const data =
      await this.management.request(
        MarketplaceSetListingStatusDocument,
        variables,
      );
    return data.setPlayerCodeListingStatus;
  }

  /** Configure the app's D4 grid claim policy (manage_apps). */
  async setGridClaimPolicy(
    variables: MarketplaceSetGridClaimPolicyMutationVariables,
  ): Promise<MarketplaceSetGridClaimPolicyMutation['setAppGridClaimPolicy']> {
    const data =
      await this.management.request(
        MarketplaceSetGridClaimPolicyDocument,
        variables,
      );
    return data.setAppGridClaimPolicy;
  }
}
