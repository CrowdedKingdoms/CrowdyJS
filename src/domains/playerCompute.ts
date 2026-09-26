import type { GraphQLClient } from '../client.js';
import {
  PlayerComputeDeployDocument,
  PlayerComputeMyModulesDocument,
  PlayerComputeVersionsDocument,
  PlayerComputeDeleteDocument,
  PlayerComputeUsageDocument,
  PlayerComputeSetSwitchDocument,
  PlayerComputeSwitchesDocument,
  PlayerComputeArtifactDocument,
  PlayerComputeTarget,
  type DeployPlayerComputeInput,
  type PlayerComputeArtifactQuery,
  type PlayerComputeArtifactQueryVariables,
  type PlayerComputeUsageQuery,
  type PlayerComputeUsageQueryVariables,
  type PlayerComputeSetSwitchMutation,
  type PlayerComputeSetSwitchMutationVariables,
  type PlayerComputeSwitchesQuery,
  type PlayerComputeSwitchesQueryVariables,
  type PlayerComputeDeployMutation,
  type PlayerComputeMyModulesQuery,
  type PlayerComputeMyModulesQueryVariables,
  type PlayerComputeVersionsQuery,
  type PlayerComputeVersionsQueryVariables,
  type PlayerComputeDeleteMutation,
  type PlayerComputeDeleteMutationVariables,
} from '../generated/graphql.js';

/** A CLIENT module deploy: the Crowdy Studio project whose CLIENT target is compiled. */
export type PlayerClientModuleDeployInput = Omit<
  DeployPlayerComputeInput,
  'target' | 'tickHz' | 'gridEvents'
>;

/**
 * Players' CLIENT modules — Rust compiled on the platform to browser WASM, bound to
 * player-owned grids and run in the page by {@link PlayerCodeBroker} — exposed as
 * `client.playerCompute`. Server-side player code is a ck-exec mod (`client.exec.mod*`).
 *
 * Deploying requires current grid ownership plus `write_client_code` at both the
 * app-tier and grid ACL layers; fetching the artifact requires `run_client_code` and
 * app admission when strict allow-list mode is active. Closed source remains visible
 * only to its personal author.
 */
export class PlayerComputeAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * Compile a project's CLIENT target into an immutable pending version of a grid-bound
   * module. Compilation is asynchronous; poll {@link versions}.
   */
  async deploy(
    input: PlayerClientModuleDeployInput,
  ): Promise<PlayerComputeDeployMutation['playerComputeDeploy']> {
    const data = await this.graphql.request(PlayerComputeDeployDocument, {
      input: { ...input, target: PlayerComputeTarget.Client },
    });
    return data.playerComputeDeploy;
  }

  /**
   * List modules authored by the caller or installed on grids they currently
   * own. Closed source is not included in this module-level result.
   */
  async myModules(
    variables: PlayerComputeMyModulesQueryVariables,
  ): Promise<PlayerComputeMyModulesQuery['playerComputeMyModules']> {
    const data = await this.graphql.request(PlayerComputeMyModulesDocument, variables);
    return data.playerComputeMyModules;
  }

  /**
   * List immutable versions newest-first. Source and compile logs are redacted
   * unless the caller is the personal author or the version is open source.
   */
  async versions(
    variables: PlayerComputeVersionsQueryVariables,
  ): Promise<PlayerComputeVersionsQuery['playerComputeVersions']> {
    const data = await this.graphql.request(PlayerComputeVersionsDocument, variables);
    return data.playerComputeVersions;
  }

  /**
   * Delete a self-authored module and its versions. The caller must still own
   * the grid. Returns false when no matching module exists.
   */
  async delete(
    variables: PlayerComputeDeleteMutationVariables,
  ): Promise<PlayerComputeDeleteMutation['playerComputeDelete']> {
    const data = await this.graphql.request(PlayerComputeDeleteDocument, variables);
    return data.playerComputeDelete;
  }

  /**
   * The caller's compile quota for one app (`compilesThisHour` of `maxCompilesPerHour`)
   * and the wallet/spend-cap gate state with its typed reason (PLAYER_QUOTA_EXHAUSTED /
   * PLAYER_WALLET_EMPTY / PLAYER_SPEND_CAP / PLAYER_COMPUTE_KILLED).
   */
  async usage(
    variables: PlayerComputeUsageQueryVariables,
  ): Promise<PlayerComputeUsageQuery['playerComputeUsage']> {
    const data = await this.graphql.request(
      PlayerComputeUsageDocument,
      variables,
    );
    return data.playerComputeUsage;
  }

  /**
   * Throw or release a kill-ladder switch at player/grid/app scope (studio,
   * requires `manage_compute`); a thrown switch stops artifact fetches.
   */
  async setSwitch(
    variables: PlayerComputeSetSwitchMutationVariables,
  ): Promise<PlayerComputeSetSwitchMutation['playerComputeSetSwitch']> {
    const data = await this.graphql.request(
      PlayerComputeSetSwitchDocument,
      variables,
    );
    return data.playerComputeSetSwitch;
  }

  /** Active kill-ladder switches (studio, requires `view_compute_diagnostics`). */
  async switches(
    variables: PlayerComputeSwitchesQueryVariables,
  ): Promise<PlayerComputeSwitchesQuery['playerComputeSwitches']> {
    const data = await this.graphql.request(
      PlayerComputeSwitchesDocument,
      variables,
    );
    return data.playerComputeSwitches;
  }

  /**
   * Fetch a compiled CLIENT artifact + metadata for the browser broker.
   * Fail-closed server-side (ownership, authorship, run_client_code,
   * admission). Returns the metadata as-is; use {@link artifactBytes} to get
   * the decoded ArrayBuffer ready to hand {@link PlayerCodeBroker.start}.
   */
  async artifact(
    variables: PlayerComputeArtifactQueryVariables,
  ): Promise<PlayerComputeArtifactQuery['playerComputeArtifact']> {
    const data = await this.graphql.request(
      PlayerComputeArtifactDocument,
      variables,
    );
    return data.playerComputeArtifact;
  }

  /**
   * Fetch a client artifact and decode its bytes to an ArrayBuffer plus the
   * broker inputs (content hash for side-load verification, per-dispatch fuel
   * budget). Convenience over {@link artifact} for the Crowdy Studio CLIENT
   * deploy loop.
   */
  async artifactBytes(
    variables: PlayerComputeArtifactQueryVariables,
  ): Promise<{
    bytes: ArrayBuffer;
    artifactHash: string;
    fuelPerDispatch: bigint;
    contractJson: string | null;
    versionId: string;
  }> {
    const a = await this.artifact(variables);
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
}
