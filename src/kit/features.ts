import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import { featureGate } from './blueprints/index.js';
import type { KitInvokePolicy } from './blueprints/index.js';

/**
 * Runtime **monetization** helpers — the app feature/tier surface in shop
 * terms. Features are string keys (`'vip'`, `'land_owner'`, `'battle_pass'`)
 * defined per app and granted to **access tiers** (the management-side
 * `appAccess` tiers players buy/hold); any model function whose policy
 * carries a `tier_feature` leaf then admits only players on a granted tier.
 *
 * Gate blueprint functions by composing {@link gate} (=`featureGate`) into a
 * builder's `*policyExtra` option, e.g.
 * `plotBlueprint({ buyPolicyExtra: kit.features.gate('land_owner') })`.
 *
 * All methods require the app-admin `manage_apps` permission.
 *
 * Obtained via `client.kit(appId).features`.
 */
export class FeaturesKit {
  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
  ) {}

  /** Define (or re-describe) a feature key for the app. */
  async define(featureKey: string, description?: string) {
    return this.gameModel.defineFeature({
      appId: this.appId,
      featureKey,
      ...(description !== undefined ? { description } : {}),
    });
  }

  /** List the app's defined feature keys. */
  async list() {
    return this.gameModel.features({ appId: this.appId });
  }

  /** Grant a feature to an access tier (its holders pass `tier_feature` checks). */
  async grantToTier(
    tierId: Scalars['BigInt']['input'],
    featureKey: string,
  ) {
    return this.gameModel.grantTierFeature({
      appId: this.appId,
      tierId,
      featureKey,
    });
  }

  /** Revoke a feature from an access tier. */
  async revokeFromTier(
    tierId: Scalars['BigInt']['input'],
    featureKey: string,
  ): Promise<boolean> {
    return this.gameModel.revokeTierFeature({
      appId: this.appId,
      tierId,
      featureKey,
    });
  }

  /** List tier→feature grants (optionally for one tier). */
  async tierFeatures(tierId?: Scalars['BigInt']['input']) {
    return this.gameModel.tierFeatures({
      appId: this.appId,
      ...(tierId !== undefined ? { tierId } : {}),
    });
  }

  /**
   * A `tier_feature` policy leaf for `feature` — pass it to any blueprint
   * builder's `*policyExtra` option to monetization-gate that function.
   * (Also exported standalone as `featureGate`.)
   */
  gate(feature: string): KitInvokePolicy {
    return featureGate(feature);
  }
}
