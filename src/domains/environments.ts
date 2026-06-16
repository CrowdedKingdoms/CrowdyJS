import type { GraphQLClient } from '../client.js';
import {
  OrgEnvironmentsDocument,
  OrgEnvironmentDocument,
  EnvironmentVersionsDocument,
  EnvironmentForwardVersionsDocument,
  EnvironmentDatacentersDocument,
  EnvironmentFlavorsDocument,
  EnvironmentQuoteDocument,
  CreateEnvironmentDocument,
  DestroyEnvironmentDocument,
  PurgeEnvironmentDocument,
  ResumeEnvironmentDocument,
  UpdateEnvironmentScalingDocument,
  RedeployEnvironmentDocument,
  RestartEnvironmentServicesDocument,
  LinkAppToEnvironmentDocument,
  type OrgEnvironmentsQuery,
  type OrgEnvironmentQuery,
  type EnvironmentVersionsQuery,
  type EnvironmentForwardVersionsQuery,
  type EnvironmentDatacentersQuery,
  type EnvironmentFlavorsQuery,
  type EnvironmentQuoteQuery,
  type CreateEnvironmentMutation,
  type DestroyEnvironmentMutation,
  type PurgeEnvironmentMutation,
  type ResumeEnvironmentMutation,
  type UpdateEnvironmentScalingMutation,
  type RedeployEnvironmentMutation,
  type RestartEnvironmentServicesMutation,
  type LinkAppToEnvironmentMutation,
  type EnvironmentQuoteInput,
  type CreateEnvironmentInput,
  type DestroyEnvironmentInput,
  type PurgeEnvironmentInput,
  type ResumeEnvironmentInput,
  type UpdateEnvironmentScalingInput,
  type RedeployEnvironmentInput,
  type RestartEnvironmentServicesInput,
  type LinkAppToEnvironmentInput,
} from '../generated/graphql.js';

/**
 * Dedicated customer environments — exposed as `client.environments` (and
 * grouped under `client.admin`).
 *
 * Targets the **management-api**. Reads require the `view_environments` org
 * permission ({@link quote} requires `view_billing`); the deploy/scale/destroy
 * mutations require `manage_environments`. Lifecycle mutations are asynchronous:
 * they return a {@link CksEnvironmentChangeOrder} you poll via {@link get} until
 * its `status` is `succeeded`/`failed`. `BigInt` ids are decimal strings; `since`
 * args are ISO-8601 `DateTime` strings.
 *
 * WARNING: {@link create}, {@link destroy}, {@link purge}, and
 * {@link redeploy} provision or tear down real cloud resources (and reserve
 * wallet funds). Drive them only against a sandbox org in tests.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above.
 */
export class EnvironmentsAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * List every environment owned by an org (any lifecycle state). Summary rows
   * only — use {@link get} for full detail. Requires `view_environments`.
   *
   * @param orgId - Numeric org id.
   * @returns The org's environments.
   */
  async list(orgId: string): Promise<OrgEnvironmentsQuery['orgEnvironments']> {
    const data = await this.management.request(OrgEnvironmentsDocument, {
      orgId,
    });
    return data.orgEnvironments;
  }

  /**
   * Full detail for one environment (components, change orders, outputs).
   * Requires `view_environments`.
   *
   * @param orgId - Numeric org id.
   * @param slug - Environment slug.
   * @returns The {@link CksEnvironmentDetail}, or `null` if not found.
   */
  async get(
    orgId: string,
    slug: string,
  ): Promise<OrgEnvironmentQuery['orgEnvironment']> {
    const data = await this.management.request(OrgEnvironmentDocument, {
      orgId,
      slug,
    });
    return data.orgEnvironment;
  }

  /**
   * Catalog of deployable environment release versions (newest first). Any
   * authenticated caller.
   *
   * @returns The available environment versions.
   */
  async versions(): Promise<EnvironmentVersionsQuery['environmentVersions']> {
    const data = await this.management.request(EnvironmentVersionsDocument, {});
    return data.environmentVersions;
  }

  /**
   * Versions a specific environment may upgrade to (forward-only). Requires
   * `view_environments`.
   *
   * @param orgId - Numeric org id.
   * @param slug - Environment slug.
   * @returns The upgrade-target versions.
   */
  async forwardVersions(
    orgId: string,
    slug: string,
  ): Promise<EnvironmentForwardVersionsQuery['environmentForwardVersions']> {
    const data = await this.management.request(
      EnvironmentForwardVersionsDocument,
      { orgId, slug },
    );
    return data.environmentForwardVersions;
  }

  /**
   * OVH datacenters with at least one customer-selectable flavor. **Public.**
   *
   * @returns The selectable datacenters.
   */
  async datacenters(): Promise<
    EnvironmentDatacentersQuery['environmentDatacenters']
  > {
    const data = await this.management.request(
      EnvironmentDatacentersDocument,
      {},
    );
    return data.environmentDatacenters;
  }

  /**
   * Customer-selectable instance flavors (with pricing) in a datacenter.
   *
   * @param datacenter - Datacenter/region code from {@link datacenters}.
   * @returns The available flavors.
   */
  async flavors(
    datacenter: string,
  ): Promise<EnvironmentFlavorsQuery['environmentFlavors']> {
    const data = await this.management.request(EnvironmentFlavorsDocument, {
      datacenter,
    });
    return data.environmentFlavors;
  }

  /**
   * Price a proposed environment selection and check the wallet can cover it.
   * Read-only (provisions nothing). Requires `view_billing`.
   *
   * @param input - {@link EnvironmentQuoteInput}: org, datacenter, flavors,
   *   server counts.
   * @returns The {@link CksEnvironmentQuote} including the `canCreate` gate.
   */
  async quote(
    input: EnvironmentQuoteInput,
  ): Promise<EnvironmentQuoteQuery['environmentQuote']> {
    const data = await this.management.request(EnvironmentQuoteDocument, {
      input,
    });
    return data.environmentQuote;
  }

  /**
   * Provision a new dedicated environment. Requires `manage_environments`.
   * Reserves wallet funds and starts cloud provisioning — poll {@link get}.
   *
   * @param input - {@link CreateEnvironmentInput}.
   * @returns The new environment's detail with its initial change order.
   */
  async create(
    input: CreateEnvironmentInput,
  ): Promise<CreateEnvironmentMutation['createEnvironment']> {
    const data = await this.management.request(CreateEnvironmentDocument, {
      input,
    });
    return data.createEnvironment;
  }

  /**
   * Tear down an environment's runtime (keeps the record). Requires
   * `manage_environments`.
   *
   * @param input - {@link DestroyEnvironmentInput}.
   * @returns The destroy {@link CksEnvironmentChangeOrder}.
   */
  async destroy(
    input: DestroyEnvironmentInput,
  ): Promise<DestroyEnvironmentMutation['destroyEnvironment']> {
    const data = await this.management.request(DestroyEnvironmentDocument, {
      input,
    });
    return data.destroyEnvironment;
  }

  /**
   * Permanently purge a destroyed environment's record. Requires
   * `manage_environments`. Irreversible.
   *
   * @param input - {@link PurgeEnvironmentInput}.
   * @returns `true` on success.
   */
  async purge(
    input: PurgeEnvironmentInput,
  ): Promise<PurgeEnvironmentMutation['purgeEnvironment']> {
    const data = await this.management.request(PurgeEnvironmentDocument, {
      input,
    });
    return data.purgeEnvironment;
  }

  /**
   * Resume a suspended (non-payment) environment after funding the wallet.
   * Requires `manage_environments`.
   *
   * @param input - {@link ResumeEnvironmentInput}.
   * @returns The resume {@link CksEnvironmentChangeOrder}.
   */
  async resume(
    input: ResumeEnvironmentInput,
  ): Promise<ResumeEnvironmentMutation['resumeEnvironment']> {
    const data = await this.management.request(ResumeEnvironmentDocument, {
      input,
    });
    return data.resumeEnvironment;
  }

  /**
   * Change min/max server counts (autoscaling bounds). Requires
   * `manage_environments`.
   *
   * @param input - {@link UpdateEnvironmentScalingInput}.
   * @returns The scaling {@link CksEnvironmentChangeOrder}.
   */
  async updateScaling(
    input: UpdateEnvironmentScalingInput,
  ): Promise<UpdateEnvironmentScalingMutation['updateEnvironmentScaling']> {
    const data = await this.management.request(
      UpdateEnvironmentScalingDocument,
      { input },
    );
    return data.updateEnvironmentScaling;
  }

  /**
   * Deploy a (forward-only) environment release version. Requires
   * `manage_environments`.
   *
   * @param input - {@link RedeployEnvironmentInput} (target version).
   * @returns The deploy {@link CksEnvironmentChangeOrder}.
   */
  async redeploy(
    input: RedeployEnvironmentInput,
  ): Promise<RedeployEnvironmentMutation['redeployEnvironment']> {
    const data = await this.management.request(RedeployEnvironmentDocument, {
      input,
    });
    return data.redeployEnvironment;
  }

  /**
   * Restart an environment's services without redeploying. Requires
   * `manage_environments`.
   *
   * @param input - {@link RestartEnvironmentServicesInput}.
   * @returns The restart {@link CksEnvironmentChangeOrder}.
   */
  async restartServices(
    input: RestartEnvironmentServicesInput,
  ): Promise<
    RestartEnvironmentServicesMutation['restartEnvironmentServices']
  > {
    const data = await this.management.request(
      RestartEnvironmentServicesDocument,
      { input },
    );
    return data.restartEnvironmentServices;
  }

  /**
   * Link an app to an environment so its runtime is served there. Requires
   * `manage_environments`.
   *
   * @param input - {@link LinkAppToEnvironmentInput}.
   * @returns The updated {@link App} (with its new routing fields).
   */
  async linkApp(
    input: LinkAppToEnvironmentInput,
  ): Promise<LinkAppToEnvironmentMutation['linkAppToEnvironment']> {
    const data = await this.management.request(LinkAppToEnvironmentDocument, {
      input,
    });
    return data.linkAppToEnvironment;
  }
}
