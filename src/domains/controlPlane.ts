import type { GraphQLClient } from '../client.js';
import {
  CpEnvironmentsDocument,
  CpEnvironmentDocument,
  CpChangeOrdersDocument,
  CpChangeOrderDocument,
  CpAuditDocument,
  CpSecretsDocument,
  CpEnvSecretsDocument,
  CpOvhCatalogSummaryDocument,
  CpComputePlatformCeilingsDocument,
  CpSetComputePlatformCeilingsDocument,
  CpUsageSummaryDocument,
  CpUnreleasedGameApiTagsDocument,
  CpEnvironmentVersionsDocument,
  OperatorUsersDocument,
  SetEnvironmentDeletionProtectionDocument,
  PutCpSecretDocument,
  DeleteCpSecretDocument,
  PutCpEnvSecretDocument,
  IngestEnvironmentVersionDocument,
  PublishEnvironmentReleaseFromGameApiTagDocument,
  YankEnvironmentVersionDocument,
  type CpEnvironmentsQuery,
  type CpEnvironmentQuery,
  type CpChangeOrdersQuery,
  type CpChangeOrderQuery,
  type CpAuditQuery,
  type CpSecretsQuery,
  type CpEnvSecretsQuery,
  type CpOvhCatalogSummaryQuery,
  type CpComputePlatformCeilingsQuery,
  type CpSetComputePlatformCeilingsMutation,
  type CpSetComputePlatformCeilingsInput,
  type CpUsageSummaryQuery,
  type CpUnreleasedGameApiTagsQuery,
  type CpEnvironmentVersionsQuery,
  type OperatorUsersQuery,
  type SetEnvironmentDeletionProtectionMutation,
  type PutCpSecretMutation,
  type DeleteCpSecretMutation,
  type PutCpEnvSecretMutation,
  type IngestEnvironmentVersionMutation,
  type PublishEnvironmentReleaseFromGameApiTagMutation,
  type YankEnvironmentVersionMutation,
  type IngestEnvironmentVersionInput,
  type PublishEnvironmentReleaseFromGameApiTagInput,
} from '../generated/graphql.js';

/**
 * Operator (control-plane) surface — exposed as `client.operator`.
 *
 * Targets the **management-api**. EVERY operation here requires
 * `users.is_operator` (super-admins implicitly have it). This is the privileged
 * platform-operations surface (cross-org environment administration, secrets,
 * release management) and is NOT for end users. Mutations write audit entries
 * and several have real side effects (GitHub commits, deploy retargeting).
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a session, `FORBIDDEN`
 *   when the caller is not an operator.
 */
export class ControlPlaneAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * Paginated list of every environment across all orgs (1-based paging).
   *
   * @param opts - Optional `page` (default 1) and `pageSize` (default 50).
   * @returns A page of operator environment rows.
   */
  async environments(
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<CpEnvironmentsQuery['cpEnvironments']> {
    const data = await this.management.request(CpEnvironmentsDocument, {
      page: opts.page,
      pageSize: opts.pageSize,
    });
    return data.cpEnvironments;
  }

  /**
   * Operator view of one environment by slug (across any org).
   *
   * @param slug - Environment slug.
   * @returns The environment row, or `null` if not found.
   */
  async environment(
    slug: string,
  ): Promise<CpEnvironmentQuery['cpEnvironment']> {
    const data = await this.management.request(CpEnvironmentDocument, { slug });
    return data.cpEnvironment;
  }

  /**
   * Paginated change orders, optionally filtered by environment.
   *
   * @param opts - Optional `environmentId` filter, `page`, `pageSize`.
   * @returns A page of change-order rows.
   */
  async changeOrders(
    opts: { environmentId?: string; page?: number; pageSize?: number } = {},
  ): Promise<CpChangeOrdersQuery['cpChangeOrders']> {
    const data = await this.management.request(CpChangeOrdersDocument, {
      environmentId: opts.environmentId,
      page: opts.page,
      pageSize: opts.pageSize,
    });
    return data.cpChangeOrders;
  }

  /**
   * One change order with its tasks and steps.
   *
   * @param id - Change order UUID.
   * @returns The change-order detail, or `null` if not found.
   */
  async changeOrder(
    id: string,
  ): Promise<CpChangeOrderQuery['cpChangeOrder']> {
    const data = await this.management.request(CpChangeOrderDocument, { id });
    return data.cpChangeOrder;
  }

  /**
   * Most recent operator audit entries (newest first), optionally filtered.
   *
   * @param opts - Optional `environmentId` filter and `limit` (default 200).
   * @returns The audit entries.
   */
  async audit(
    opts: { environmentId?: string; limit?: number } = {},
  ): Promise<CpAuditQuery['cpAudit']> {
    const data = await this.management.request(CpAuditDocument, {
      environmentId: opts.environmentId,
      limit: opts.limit,
    });
    return data.cpAudit;
  }

  /**
   * Control-plane secret metadata (names/kinds only, never plaintext).
   *
   * @param environmentId - Optional environment UUID filter.
   * @returns The secret metadata rows.
   */
  async secrets(
    environmentId?: string,
  ): Promise<CpSecretsQuery['cpSecrets']> {
    const data = await this.management.request(CpSecretsDocument, {
      environmentId,
    });
    return data.cpSecrets;
  }

  /**
   * Environment-delivered secret metadata (names/kinds only, never plaintext).
   *
   * @param environmentId - Optional environment UUID filter.
   * @returns The env-secret metadata rows.
   */
  async envSecrets(
    environmentId?: string,
  ): Promise<CpEnvSecretsQuery['cpEnvSecrets']> {
    const data = await this.management.request(CpEnvSecretsDocument, {
      environmentId,
    });
    return data.cpEnvSecrets;
  }

  /**
   * OVH flavor catalog with provider vs. customer pricing.
   *
   * @param region - Optional region code filter (e.g. `'GRA11'`).
   * @returns The catalog rows.
   */
  async ovhCatalogSummary(
    region?: string,
  ): Promise<CpOvhCatalogSummaryQuery['cpOvhCatalogSummary']> {
    const data = await this.management.request(CpOvhCatalogSummaryDocument, {
      region,
    });
    return data.cpOvhCatalogSummary;
  }

  /**
   * Platform-wide compute ceilings (the maxima `computeSetPolicy` clamps to).
   * Every knob is nullable: `null` means no operator override, so the
   * env-var/bootstrap default applies on the game-api side.
   *
   * @returns The stored ceiling overrides plus updatedAt/updatedByUserId.
   */
  async computePlatformCeilings(): Promise<
    CpComputePlatformCeilingsQuery['cpComputePlatformCeilings']
  > {
    const data = await this.management.request(
      CpComputePlatformCeilingsDocument,
    );
    return data.cpComputePlatformCeilings;
  }

  /**
   * Patch the platform compute ceilings. Patch semantics per knob: omit =
   * unchanged, explicit `null` = clear the override (fall back to the
   * game-api bootstrap default), positive value = set. Changes replica-sync
   * to game-api and take effect on the next `computeSetPolicy` call (no
   * restart), within a 30s cache bound. Writes a
   * `compute.platform_ceilings_set` audit entry.
   *
   * @param input - The per-knob patch.
   * @returns The stored ceilings after the patch.
   */
  async setComputePlatformCeilings(
    input: CpSetComputePlatformCeilingsInput,
  ): Promise<
    CpSetComputePlatformCeilingsMutation['cpSetComputePlatformCeilings']
  > {
    const data = await this.management.request(
      CpSetComputePlatformCeilingsDocument,
      { input },
    );
    return data.cpSetComputePlatformCeilings;
  }

  /**
   * Operator per-minute usage summary for any environment (not org-scoped).
   *
   * @param environmentSlug - Environment slug.
   * @param since - Start of the window (ISO-8601 DateTime) up to now.
   * @returns The usage summary.
   */
  async usageSummary(
    environmentSlug: string,
    since: string,
  ): Promise<CpUsageSummaryQuery['cpUsageSummary']> {
    const data = await this.management.request(CpUsageSummaryDocument, {
      environmentSlug,
      since,
    });
    return data.cpUsageSummary;
  }

  /**
   * cks-game-api git tags not yet pinned by any environment release.
   *
   * @returns The unreleased tags with proposed versions.
   */
  async unreleasedGameApiTags(): Promise<
    CpUnreleasedGameApiTagsQuery['cpUnreleasedGameApiTags']
  > {
    const data = await this.management.request(
      CpUnreleasedGameApiTagsDocument,
      {},
    );
    return data.cpUnreleasedGameApiTags;
  }

  /**
   * Environment release manifests merged from git + DB.
   *
   * @returns The version rows with latest-available and git-source flags.
   */
  async environmentVersions(): Promise<
    CpEnvironmentVersionsQuery['cpEnvironmentVersions']
  > {
    const data = await this.management.request(
      CpEnvironmentVersionsDocument,
      {},
    );
    return data.cpEnvironmentVersions;
  }

  /**
   * List users with operator and/or super-admin privileges.
   *
   * @returns The privileged users.
   */
  async operatorUsers(): Promise<OperatorUsersQuery['operatorUsers']> {
    const data = await this.management.request(OperatorUsersDocument, {});
    return data.operatorUsers;
  }

  /**
   * Toggle deletion protection on an environment (blocks purge when enabled).
   * Writes an audit entry.
   *
   * @param environmentId - Environment UUID.
   * @param enabled - `true` to protect, `false` to unprotect.
   * @returns `true` on success.
   */
  async setDeletionProtection(
    environmentId: string,
    enabled: boolean,
  ): Promise<
    SetEnvironmentDeletionProtectionMutation['setEnvironmentDeletionProtection']
  > {
    const data = await this.management.request(
      SetEnvironmentDeletionProtectionDocument,
      { environmentId, enabled },
    );
    return data.setEnvironmentDeletionProtection;
  }

  /**
   * Create/overwrite a control-plane secret (plaintext is write-only). Writes an
   * audit entry.
   *
   * @param environmentId - Environment UUID.
   * @param name - Secret name/key.
   * @param plaintext - Secret value to encrypt and store.
   * @param kind - Optional classification tag.
   * @returns The secret metadata row.
   */
  async putSecret(
    environmentId: string,
    name: string,
    plaintext: string,
    kind?: string,
  ): Promise<PutCpSecretMutation['putCpSecret']> {
    const data = await this.management.request(PutCpSecretDocument, {
      environmentId,
      name,
      plaintext,
      kind,
    });
    return data.putCpSecret;
  }

  /**
   * Delete a control-plane secret by environment + name. Writes an audit entry.
   *
   * @param environmentId - Environment UUID.
   * @param name - Secret name/key to delete.
   * @returns `true` when a secret was removed.
   */
  async deleteSecret(
    environmentId: string,
    name: string,
  ): Promise<DeleteCpSecretMutation['deleteCpSecret']> {
    const data = await this.management.request(DeleteCpSecretDocument, {
      environmentId,
      name,
    });
    return data.deleteCpSecret;
  }

  /**
   * Create/overwrite an environment-delivered secret (injected into the tenant
   * runtime; plaintext is write-only). Writes an audit entry.
   *
   * @param environmentId - Environment UUID.
   * @param name - Secret name/key.
   * @param plaintext - Secret value to encrypt and store.
   * @param kind - Optional classification tag.
   * @returns The env-secret metadata row.
   */
  async putEnvSecret(
    environmentId: string,
    name: string,
    plaintext: string,
    kind?: string,
  ): Promise<PutCpEnvSecretMutation['putCpEnvSecret']> {
    const data = await this.management.request(PutCpEnvSecretDocument, {
      environmentId,
      name,
      plaintext,
      kind,
    });
    return data.putCpEnvSecret;
  }

  /**
   * Ingest a release manifest into the deployable catalog. Writes an audit
   * entry.
   *
   * @param input - {@link IngestEnvironmentVersionInput} (version, force).
   * @returns The ingested version row.
   */
  async ingestEnvironmentVersion(
    input: IngestEnvironmentVersionInput,
  ): Promise<IngestEnvironmentVersionMutation['ingestEnvironmentVersion']> {
    const data = await this.management.request(
      IngestEnvironmentVersionDocument,
      { input },
    );
    return data.ingestEnvironmentVersion;
  }

  /**
   * Cut a new environment release from a cks-game-api git tag (ingests + commits
   * the manifest to git). SIDE EFFECT: retargets redeploy and writes to GitHub.
   *
   * @param input - {@link PublishEnvironmentReleaseFromGameApiTagInput}.
   * @returns The publish result.
   */
  async publishReleaseFromGameApiTag(
    input: PublishEnvironmentReleaseFromGameApiTagInput,
  ): Promise<
    PublishEnvironmentReleaseFromGameApiTagMutation['publishEnvironmentReleaseFromGameApiTag']
  > {
    const data = await this.management.request(
      PublishEnvironmentReleaseFromGameApiTagDocument,
      { input },
    );
    return data.publishEnvironmentReleaseFromGameApiTag;
  }

  /**
   * Yank (withdraw) an environment version so it can no longer be deployed.
   * Existing environments are unaffected. Writes an audit entry.
   *
   * @param version - Environment version to yank (e.g. `'v0.1.4'`).
   * @returns `true` on success.
   */
  async yankEnvironmentVersion(
    version: string,
  ): Promise<YankEnvironmentVersionMutation['yankEnvironmentVersion']> {
    const data = await this.management.request(
      YankEnvironmentVersionDocument,
      { version },
    );
    return data.yankEnvironmentVersion;
  }
}
