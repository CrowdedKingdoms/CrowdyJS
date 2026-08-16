import type { GraphQLClient } from '../client.js';
import {
  CpComputePlatformCeilingsDocument,
  CpSetComputePlatformCeilingsDocument,
  type CpComputePlatformCeilingsQuery,
  type CpSetComputePlatformCeilingsMutation,
  type CpSetComputePlatformCeilingsInput,
} from '../generated/graphql.js';

/**
 * Operator (platform-policy) surface — exposed as `client.operator`.
 *
 * As of the v13 unified API this surface is reduced to the platform-wide
 * compute ceilings: dedicated customer environments were retired, and the
 * infrastructure control plane (environments, change orders, secrets, release
 * management, audit) moved to the separate infra-control-plane service with
 * its own auth and operator console. EVERY operation here still requires
 * `users.is_operator` (super-admins implicitly have it).
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a session, `FORBIDDEN`
 *   when the caller is not an operator.
 */
export class ControlPlaneAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * The platform-wide compute ceilings (max modules, tick rates, fuel,
   * memory, run time, db-op and egress budgets).
   *
   * @returns The stored ceilings row.
   */
  async computePlatformCeilings(): Promise<
    CpComputePlatformCeilingsQuery['cpComputePlatformCeilings']
  > {
    const data = await this.api.request(
      CpComputePlatformCeilingsDocument,
    );
    return data.cpComputePlatformCeilings;
  }

  /**
   * Patch the platform compute ceilings. Patch semantics per knob: omit =
   * unchanged, explicit `null` = clear the override (fall back to the
   * game-api bootstrap default), positive value = set. Takes effect on the
   * next `computeSetPolicy` call (no restart), within a 30s cache bound.
   * Writes a `compute.platform_ceilings_set` audit entry.
   *
   * @param input - The per-knob patch.
   * @returns The stored ceilings after the patch.
   */
  async setComputePlatformCeilings(
    input: CpSetComputePlatformCeilingsInput,
  ): Promise<
    CpSetComputePlatformCeilingsMutation['cpSetComputePlatformCeilings']
  > {
    const data = await this.api.request(
      CpSetComputePlatformCeilingsDocument,
      { input },
    );
    return data.cpSetComputePlatformCeilings;
  }
}
