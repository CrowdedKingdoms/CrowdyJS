import type { GraphQLClient } from '../client.js';
import {
  MarketplaceGridClaimPolicyDocument,
  MarketplaceGridClaimRequestsDocument,
  MarketplaceClaimGridOwnershipDocument,
  MarketplaceClaimGridChunkDocument,
  MarketplaceReleaseClaimedGridDocument,
  MarketplaceDecideGridClaimDocument,
  MarketplaceIssueGridClaimInviteDocument,
  MarketplaceAdmissionQueueDocument,
  MarketplaceAppListingsDocument,
  MarketplaceAppAcquisitionsDocument,
  MarketplaceTransferListingDocument,
  MarketplaceSetListingStatusDocument,
  MarketplaceSetGridClaimPolicyDocument,
  type MarketplaceGridClaimPolicyQuery,
  type MarketplaceGridClaimPolicyQueryVariables,
  type MarketplaceGridClaimRequestsQuery,
  type MarketplaceGridClaimRequestsQueryVariables,
  type MarketplaceClaimGridOwnershipMutation,
  type MarketplaceClaimGridOwnershipMutationVariables,
  type MarketplaceClaimGridChunkMutation,
  type MarketplaceClaimGridChunkMutationVariables,
  type MarketplaceReleaseClaimedGridMutation,
  type MarketplaceReleaseClaimedGridMutationVariables,
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
 * Grid claims and the app's player-code administration — exposed as
 * `client.marketplace`: the D4 grid claim flows (policy, requests, chunk and
 * ownership claims, invites) and studio moderation (admission queue, catalog
 * administration, ownership transfer, claim-policy config). The player-facing
 * listings (publish, acquire, install) and grid-attached client mods went with
 * legacy player compute; ck-exec mods publish and install with
 * `client.exec.modPublish` / `modInstall`.
 */
export class MarketplaceAPI {
  constructor(private readonly game: GraphQLClient) {}

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

  /**
   * Atomically create and claim one chunk under the app's SELF_CLAIM policy.
   * Uses the authenticated player, rejects protected/overlapping chunks, and
   * returns authoritative bounds plus effective build/mod permissions.
   */
  async claimGridChunk(
    variables: MarketplaceClaimGridChunkMutationVariables,
  ): Promise<MarketplaceClaimGridChunkMutation['claimGridChunk']> {
    const data = await this.game.request(
      MarketplaceClaimGridChunkDocument,
      variables,
    );
    return data.claimGridChunk;
  }

  /**
   * Release a one-chunk grid created by `claimGridChunk`. The authenticated
   * caller must still own the claim; other grid origins cannot be released.
   */
  async releaseClaimedGrid(
    variables: MarketplaceReleaseClaimedGridMutationVariables,
  ): Promise<MarketplaceReleaseClaimedGridMutation['releaseClaimedGrid']> {
    const data = await this.game.request(
      MarketplaceReleaseClaimedGridDocument,
      variables,
    );
    return data.releaseClaimedGrid;
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

  // -- Studio moderation (requires studio permissions) -----------------------------

  /** The admission queue: listings joined with allow-list standing. */
  async admissionQueue(
    variables: MarketplaceAdmissionQueueQueryVariables,
  ): Promise<MarketplaceAdmissionQueueQuery['appCodeAdmissionQueue']> {
    const data = await this.game.request(
      MarketplaceAdmissionQueueDocument,
      variables,
    );
    return data.appCodeAdmissionQueue;
  }

  /** Studio catalog administration view (includes delisted/killed on request). */
  async appListings(
    variables: MarketplaceAppListingsQueryVariables,
  ): Promise<MarketplaceAppListingsQuery['appPlayerCodeListings']> {
    const data = await this.game.request(
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
      await this.game.request(
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
      await this.game.request(
        MarketplaceTransferListingDocument,
        variables,
      );
    return data.transferPlayerCodeListing;
  }

  /**
   * Catalog status: DELISTED/ACTIVE are owner actions; KILLED is the studio
   * catalog kill.
   */
  async setListingStatus(
    variables: MarketplaceSetListingStatusMutationVariables,
  ): Promise<MarketplaceSetListingStatusMutation['setPlayerCodeListingStatus']> {
    const data =
      await this.game.request(
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
      await this.game.request(
        MarketplaceSetGridClaimPolicyDocument,
        variables,
      );
    return data.setAppGridClaimPolicy;
  }
}
