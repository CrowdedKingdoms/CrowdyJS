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
  MarketplaceRenewAcquisitionDocument,
  MarketplaceTopUpAcquisitionDocument,
  MarketplaceRefundAcquisitionDocument,
  MarketplaceGridListingsDocument,
  MarketplacePurchaseGridDocument,
  MarketplaceSetListingPricingDocument,
  MarketplaceSetOrgShareDocument,
  MarketplaceBeginSellerOnboardingDocument,
  MarketplaceBeginOrgSellerOnboardingDocument,
  MarketplaceCreateAccountSessionDocument,
  MarketplaceCreateOrgAccountSessionDocument,
  type MarketplaceCreateAccountSessionMutation,
  type MarketplaceCreateAccountSessionMutationVariables,
  type MarketplaceCreateOrgAccountSessionMutation,
  type MarketplaceCreateOrgAccountSessionMutationVariables,
  MarketplaceMySellerBalanceDocument,
  MarketplaceRequestPayoutDocument,
  MarketplaceSpendPayoutToWalletDocument,
  MarketplaceCommerceRiskQueueDocument,
  MarketplaceDecideRiskFlagDocument,
  MarketplaceCreateGridListingDocument,
  type MarketplaceRenewAcquisitionMutationVariables,
  type MarketplaceTopUpAcquisitionMutationVariables,
  type MarketplaceRefundAcquisitionMutationVariables,
  type MarketplaceGridListingsQueryVariables,
  type MarketplacePurchaseGridMutationVariables,
  type MarketplaceSetListingPricingMutationVariables,
  type MarketplaceSetOrgShareMutationVariables,
  type MarketplaceBeginSellerOnboardingMutationVariables,
  type MarketplaceBeginOrgSellerOnboardingMutationVariables,
  type MarketplaceRequestPayoutMutationVariables,
  type MarketplaceSpendPayoutToWalletMutationVariables,
  type MarketplaceCommerceRiskQueueQueryVariables,
  type MarketplaceDecideRiskFlagMutationVariables,
  type MarketplaceCreateGridListingMutationVariables,
  type MarketplaceGridListingsQuery,
  type MarketplacePurchaseGridMutation,
  type MarketplaceBeginSellerOnboardingMutation,
  type MarketplaceBeginOrgSellerOnboardingMutation,
  type MarketplaceMySellerBalanceQuery,
  type MarketplaceCommerceRiskQueueQuery,
  type MarketplaceCreateGridListingMutation,
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

  // -- P4b: paid modes + grid commerce (Game API) --------------------------------

  /** Renew a RENT / extend a TIME_LIMITED acquisition (a wallet charge). */
  async renewAcquisition(variables: MarketplaceRenewAcquisitionMutationVariables) {
    const data = await this.game.request(
      MarketplaceRenewAcquisitionDocument,
      variables,
    );
    return data.renewPlayerCodeAcquisition;
  }

  /** Top up a COST_LIMITED acquisition's unit budget (a wallet charge). */
  async topUpAcquisition(variables: MarketplaceTopUpAcquisitionMutationVariables) {
    const data = await this.game.request(
      MarketplaceTopUpAcquisitionDocument,
      variables,
    );
    return data.topUpPlayerCodeAcquisition;
  }

  /** Refund a paid acquisition (within window, before meaningful use). Returns cents. */
  async refundAcquisition(
    variables: MarketplaceRefundAcquisitionMutationVariables,
  ): Promise<number> {
    const data = await this.game.request(
      MarketplaceRefundAcquisitionDocument,
      variables,
    );
    return data.refundPlayerCodeAcquisition;
  }

  /** Browse the app's grid listings. */
  async gridListings(
    variables: MarketplaceGridListingsQueryVariables,
  ): Promise<MarketplaceGridListingsQuery['gridListings']> {
    const data = await this.game.request(
      MarketplaceGridListingsDocument,
      variables,
    );
    return data.gridListings;
  }

  /** Buy a grid listing (wallet debit + atomic ownership; refund on failure). */
  async purchaseGrid(
    variables: MarketplacePurchaseGridMutationVariables,
  ): Promise<MarketplacePurchaseGridMutation['purchaseGrid']> {
    const data = await this.game.request(
      MarketplacePurchaseGridDocument,
      variables,
    );
    return data.purchaseGrid;
  }

  // -- P4b: pricing, seller payouts, grid catalog, risk (Management API) ----------

  /** Author-only: set a listing's acquisition mode + price. */
  async setListingPricing(
    variables: MarketplaceSetListingPricingMutationVariables,
  ): Promise<boolean> {
    const data = await this.management.request(
      MarketplaceSetListingPricingDocument,
      variables,
    );
    return data.setListingPricing;
  }

  /** Set the app's marketplace org revenue share (bps; manage_billing). */
  async setOrgShare(
    variables: MarketplaceSetOrgShareMutationVariables,
  ): Promise<number> {
    const data = await this.management.request(
      MarketplaceSetOrgShareDocument,
      variables,
    );
    return data.setAppMarketplaceOrgShare;
  }

  /**
   * Account Session for the EMBEDDED Connect components: initialize
   * Connect.js with the returned publishableKey + clientSecret and mount
   * account-onboarding / payouts / balances INSIDE your UI (no Stripe-hosted
   * redirect). Client secrets are short-lived — pass this method as the
   * fetchClientSecret callback so Connect.js refreshes automatically.
   */
  async createAccountSession(
    variables: MarketplaceCreateAccountSessionMutationVariables,
  ): Promise<
    MarketplaceCreateAccountSessionMutation['createSellerAccountSession']
  > {
    const data = await this.management.request(
      MarketplaceCreateAccountSessionDocument,
      variables,
    );
    return data.createSellerAccountSession;
  }

  /** Embedded-components Account Session for an ORG payout account (manage_billing). */
  async createOrgAccountSession(
    variables: MarketplaceCreateOrgAccountSessionMutationVariables,
  ): Promise<
    MarketplaceCreateOrgAccountSessionMutation['createOrgSellerAccountSession']
  > {
    const data = await this.management.request(
      MarketplaceCreateOrgAccountSessionDocument,
      variables,
    );
    return data.createOrgSellerAccountSession;
  }

  /** Begin Stripe Connect Express onboarding for the calling player-seller. */
  async beginSellerOnboarding(
    variables: MarketplaceBeginSellerOnboardingMutationVariables,
  ): Promise<MarketplaceBeginSellerOnboardingMutation['beginSellerOnboarding']> {
    const data = await this.management.request(
      MarketplaceBeginSellerOnboardingDocument,
      variables,
    );
    return data.beginSellerOnboarding;
  }

  /** Begin onboarding for an org payout account (manage_billing in the org). */
  async beginOrgSellerOnboarding(
    variables: MarketplaceBeginOrgSellerOnboardingMutationVariables,
  ): Promise<
    MarketplaceBeginOrgSellerOnboardingMutation['beginOrgSellerOnboarding']
  > {
    const data = await this.management.request(
      MarketplaceBeginOrgSellerOnboardingDocument,
      variables,
    );
    return data.beginOrgSellerOnboarding;
  }

  /** The calling player's seller payout balance. */
  async mySellerBalance(): Promise<
    MarketplaceMySellerBalanceQuery['mySellerPayoutBalance']
  > {
    const data = await this.management.request(
      MarketplaceMySellerBalanceDocument,
      {},
    );
    return data.mySellerPayoutBalance;
  }

  /** Pay out the calling player's payable balance to their Connect account. */
  async requestPayout(
    variables: MarketplaceRequestPayoutMutationVariables = {},
  ): Promise<number> {
    const data = await this.management.request(
      MarketplaceRequestPayoutDocument,
      variables,
    );
    return data.requestSellerPayout;
  }

  /** Earn-to-mod: convert payable balance into the player wallet. Returns cents. */
  async spendPayoutToWallet(
    variables: MarketplaceSpendPayoutToWalletMutationVariables,
  ): Promise<number> {
    const data = await this.management.request(
      MarketplaceSpendPayoutToWalletDocument,
      variables,
    );
    return data.spendPayoutBalanceToWallet;
  }

  /** The app's open T11 commerce risk queue (manage_compute). */
  async commerceRiskQueue(
    variables: MarketplaceCommerceRiskQueueQueryVariables,
  ): Promise<MarketplaceCommerceRiskQueueQuery['commerceRiskQueue']> {
    const data = await this.management.request(
      MarketplaceCommerceRiskQueueDocument,
      variables,
    );
    return data.commerceRiskQueue;
  }

  /** Release or confirm a T11 risk flag (manage_compute). */
  async decideRiskFlag(
    variables: MarketplaceDecideRiskFlagMutationVariables,
  ): Promise<boolean> {
    const data = await this.management.request(
      MarketplaceDecideRiskFlagDocument,
      variables,
    );
    return data.decideCommerceRiskFlag;
  }

  /** Studio: create a grid listing (blueprint or concrete; manage_apps). */
  async createGridListing(
    variables: MarketplaceCreateGridListingMutationVariables,
  ): Promise<MarketplaceCreateGridListingMutation['createGridListing']> {
    const data = await this.management.request(
      MarketplaceCreateGridListingDocument,
      variables,
    );
    return data.createGridListing;
  }
}
