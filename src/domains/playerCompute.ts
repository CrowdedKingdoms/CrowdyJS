import type { GraphQLClient } from '../client.js';
import {
  PlayerComputeDeployDocument,
  PlayerComputeSetEnabledDocument,
  PlayerComputeMyModulesDocument,
  PlayerComputeVersionsDocument,
  PlayerComputeDeleteDocument,
  PlayerComputeInvokeDocument,
  PlayerComputeUsageDocument,
  PlayerComputeRunsDocument,
  PlayerComputeLogsDocument,
  PlayerComputeSetSwitchDocument,
  PlayerComputeSwitchesDocument,
  type PlayerComputeUsageQuery,
  type PlayerComputeUsageQueryVariables,
  type PlayerComputeRunsQuery,
  type PlayerComputeRunsQueryVariables,
  type PlayerComputeLogsQuery,
  type PlayerComputeLogsQueryVariables,
  type PlayerComputeSetSwitchMutation,
  type PlayerComputeSetSwitchMutationVariables,
  type PlayerComputeSwitchesQuery,
  type PlayerComputeSwitchesQueryVariables,
  type PlayerComputeDeployMutation,
  type PlayerComputeDeployMutationVariables,
  type PlayerComputeSetEnabledMutation,
  type PlayerComputeSetEnabledMutationVariables,
  type PlayerComputeMyModulesQuery,
  type PlayerComputeMyModulesQueryVariables,
  type PlayerComputeVersionsQuery,
  type PlayerComputeVersionsQueryVariables,
  type PlayerComputeDeleteMutation,
  type PlayerComputeDeleteMutationVariables,
  type PlayerComputeInvokeMutation,
  type PlayerComputeInvokeMutationVariables,
} from '../generated/graphql.js';

/**
 * Player-authored Rust/WASM bound to player-owned grids — exposed as
 * `client.playerCompute` and routed to the Game API.
 *
 * Deploying requires current grid ownership plus the target-specific
 * `write_server_code` or `write_client_code` permission at both the app-tier
 * and grid ACL layers. Enabling separately requires the matching run
 * permission, a successful compile, and app admission when strict allow-list
 * mode is active. Closed source remains visible only to its personal author.
 */
export class PlayerComputeAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * Create or update a grid-bound module and publish an immutable pending
   * source version. Compilation is asynchronous.
   */
  async deploy(
    input: PlayerComputeDeployMutationVariables['input'],
  ): Promise<PlayerComputeDeployMutation['playerComputeDeploy']> {
    const data = await this.graphql.request(PlayerComputeDeployDocument, { input });
    return data.playerComputeDeploy;
  }

  /**
   * Request activation or stop execution. Enabling checks ownership, run
   * permission, compile success, and app code admission independently of
   * authoring permission.
   */
  async setEnabled(
    variables: PlayerComputeSetEnabledMutationVariables,
  ): Promise<PlayerComputeSetEnabledMutation['playerComputeSetEnabled']> {
    const data = await this.graphql.request(
      PlayerComputeSetEnabledDocument,
      variables,
    );
    return data.playerComputeSetEnabled;
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

  /** Invoke an enabled/admitted server module synchronously as the grid owner. */
  async invoke(
    variables: PlayerComputeInvokeMutationVariables,
  ): Promise<PlayerComputeInvokeMutation['playerComputeInvoke']> {
    const data = await this.graphql.request(
      PlayerComputeInvokeDocument,
      variables,
    );
    return data.playerComputeInvoke;
  }

  /**
   * The caller's spend/quota view for one app (P2): compute units burned in
   * the current clock hour/day vs the effective policy caps, compile-quota
   * utilization, and the wallet/spend-cap gate state with its typed reason
   * (PLAYER_QUOTA_EXHAUSTED / PLAYER_WALLET_EMPTY / PLAYER_SPEND_CAP /
   * PLAYER_COMPUTE_KILLED). The remaining-budget source for a live cost
   * meter.
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

  /** Executions on an owned grid, newest first (attributed to the grid owner). */
  async runs(
    variables: PlayerComputeRunsQueryVariables,
  ): Promise<PlayerComputeRunsQuery['playerComputeRuns']> {
    const data = await this.graphql.request(
      PlayerComputeRunsDocument,
      variables,
    );
    return data.playerComputeRuns;
  }

  /** Failed-run diagnostics on an owned grid (typed error kinds), newest first. */
  async logs(
    variables: PlayerComputeLogsQueryVariables,
  ): Promise<PlayerComputeLogsQuery['playerComputeLogs']> {
    const data = await this.graphql.request(
      PlayerComputeLogsDocument,
      variables,
    );
    return data.playerComputeLogs;
  }

  /**
   * Throw or release a kill-ladder switch at player/grid/app scope (studio,
   * requires `manage_compute`). Quota state is retained across a kill.
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
}
