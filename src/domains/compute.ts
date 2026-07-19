import type { GraphQLClient } from '../client.js';

import {
  ComputeUpsertModuleDocument,
  type ComputeUpsertModuleMutation,
  type ComputeUpsertModuleMutationVariables,
  ComputeDeployVersionDocument,
  type ComputeDeployVersionMutation,
  ComputeSetModuleEnabledDocument,
  type ComputeSetModuleEnabledMutation,
  type ComputeSetModuleEnabledMutationVariables,
  ComputeDeleteModuleDocument,
  type ComputeDeleteModuleMutation,
  type ComputeDeleteModuleMutationVariables,
  ComputeUpsertTriggerDocument,
  type ComputeUpsertTriggerMutation,
  type ComputeUpsertTriggerMutationVariables,
  ComputeDeleteTriggerDocument,
  type ComputeDeleteTriggerMutation,
  type ComputeDeleteTriggerMutationVariables,
  ComputeSetPolicyDocument,
  type ComputeSetPolicyMutation,
  type ComputeSetPolicyMutationVariables,
  ComputeInvokeDocument,
  type ComputeInvokeMutation,
  type ComputeInvokeMutationVariables,
  ComputeModulesDocument,
  type ComputeModulesQuery,
  type ComputeModulesQueryVariables,
  ComputeModuleDocument,
  type ComputeModuleQuery,
  type ComputeModuleQueryVariables,
  ComputeModuleVersionsDocument,
  type ComputeModuleVersionsQuery,
  type ComputeModuleVersionsQueryVariables,
  ComputeModuleTriggersDocument,
  type ComputeModuleTriggersQuery,
  type ComputeModuleTriggersQueryVariables,
  ComputeModulePolicyDocument,
  type ComputeModulePolicyQuery,
  type ComputeModulePolicyQueryVariables,
  ComputeModuleRunsDocument,
  type ComputeModuleRunsQuery,
  type ComputeModuleRunsQueryVariables,
  ComputeModuleStatsDocument,
  type ComputeModuleStatsQuery,
  type ComputeModuleStatsQueryVariables,
  ComputeModuleLogsDocument,
  type ComputeModuleLogsQuery,
  type ComputeModuleLogsQueryVariables,
  ComputeAppDiagnosticsDocument,
  ComputeDeployTemplateDocument,
  type ComputeDeployTemplateMutation,
  type ComputeDeployTemplateMutationVariables,
  ComputeTemplatesDocument,
  type ComputeTemplatesQuery,
  type ComputeTemplatesQueryVariables,
  type ComputeAppDiagnosticsQuery,
  type ComputeAppDiagnosticsQueryVariables,
} from '../generated/graphql.js';

/** The crowdy-compute-sdk version the platform toolchain currently pins. */
export const COMPUTE_SDK_VERSION = '0.1.0';
/** The guest ABI version the platform currently supports. */
export const COMPUTE_ABI_VERSION = 0;

/** Options for {@link ComputeAPI.deployVersion}. */
export interface DeployVersionOptions {
  appId: ComputeSetModuleEnabledMutationVariables['appId'];
  moduleName: string;
  /**
   * Relative path -> file contents. Must include `Cargo.toml` and
   * `src/lib.rs`; only `.rs` files under `src/` plus `Cargo.toml` are
   * accepted by the server (crate allowlist, size caps, no build-time code).
   */
  sourceFiles: Record<string, string>;
  /** crowdy-compute-sdk version pin. Defaults to {@link COMPUTE_SDK_VERSION}. */
  sdkVersion?: string;
  /** Guest ABI version pin. Defaults to {@link COMPUTE_ABI_VERSION}. */
  abiVersion?: number;
}

/** Options for {@link ComputeAPI.waitForCompile}. */
export interface WaitForCompileOptions {
  /** Total budget in ms before giving up (default 120_000). */
  timeoutMs?: number;
  /** Poll interval in ms (default 2_000). */
  intervalMs?: number;
}

/**
 * Typed client for **Compute Modules** — server-side Rust/WebAssembly logic
 * on the Game API (`client.compute`). Studios upload Rust source; the
 * platform compiles it to WASM and runs it sandboxed on the game servers with
 * fuel metering, triggers (tick / event / invoke), an app-scoped host data
 * API, and replication egress. Modules are **server-only**: this client
 * manages, invokes, and observes them — nothing executes client-side.
 *
 * Authoring mutations require the org **`manage_compute`** permission;
 * monitoring queries require **`view_compute_diagnostics`**. `invoke` is
 * gated per-export by the invoke trigger's policy.
 *
 * Docs: https://docs.crowdedkingdoms.com/game-api/compute-modules
 */
export class ComputeAPI {
  constructor(private gql: GraphQLClient) {}

  // -- Authoring (manage_compute) ---------------------------------------------

  /**
   * Create or update a module's metadata (upsert key `(appId, name)`). New
   * modules start disabled; enable after a successful compile. Set
   * `alwaysOn: true` for world-simulation modules that must run without
   * connected players (otherwise modules load lazily on realtime presence).
   *
   * Requires the org **`manage_compute`** permission.
   *
   * @throws {CrowdyGraphQLError} `FORBIDDEN` without the permission.
   */
  async upsertModule(
    input: ComputeUpsertModuleMutationVariables['input'],
  ): Promise<ComputeUpsertModuleMutation['computeUpsertModule']> {
    const data = await this.gql.request(ComputeUpsertModuleDocument, { input });
    return data.computeUpsertModule;
  }

  /**
   * Upload an immutable source version and make it the deployed version. The
   * source is validated server-side (Cargo.toml + `src/*.rs` only, dependency
   * allowlist, size caps, no build-time code) and parked as
   * `compileStatus: "pending"` until a game server compiles it — poll with
   * {@link moduleVersions} or {@link waitForCompile}.
   *
   * Requires the org **`manage_compute`** permission.
   *
   * @param opts - App, module, `sourceFiles` map (stringified for you), and
   *   optional SDK/ABI pins (defaulted to the current platform pins).
   */
  async deployVersion(
    opts: DeployVersionOptions,
  ): Promise<ComputeDeployVersionMutation['computeDeployVersion']> {
    const data = await this.gql.request(ComputeDeployVersionDocument, {
      input: {
        appId: opts.appId,
        moduleName: opts.moduleName,
        sourceFilesJson: JSON.stringify(opts.sourceFiles),
        sdkVersion: opts.sdkVersion ?? COMPUTE_SDK_VERSION,
        abiVersion: opts.abiVersion ?? COMPUTE_ABI_VERSION,
      },
    });
    return data.computeDeployVersion;
  }

  /**
   * Enable or disable a module. Enabling requires a successfully compiled
   * deployed version and resets the failure circuit; disabling stops all
   * scheduling. Requires the org **`manage_compute`** permission.
   */
  async setModuleEnabled(
    variables: ComputeSetModuleEnabledMutationVariables,
  ): Promise<ComputeSetModuleEnabledMutation['computeSetModuleEnabled']> {
    const data = await this.gql.request(ComputeSetModuleEnabledDocument, variables);
    return data.computeSetModuleEnabled;
  }

  /**
   * Delete a module and (via cascade) its versions, triggers, and lease. Run
   * history is retained for auditing. **Destructive.** Requires the org
   * **`manage_compute`** permission.
   *
   * @returns `true` if a module was deleted.
   */
  async deleteModule(
    variables: ComputeDeleteModuleMutationVariables,
  ): Promise<ComputeDeleteModuleMutation['computeDeleteModule']> {
    const data = await this.gql.request(ComputeDeleteModuleDocument, variables);
    return data.computeDeleteModule;
  }

  /**
   * Bind a trigger to a module: a tick loop (`triggerType: "tick"` +
   * `tickHz`, clamped by the app policy), an event subscription
   * (`triggerType: "event"` + `onEvent`: `function_invoked` |
   * `property_changed` | `container_created` | `compute_event`), or a
   * client-callable export (`triggerType: "invoke"` + `exportName` +
   * optional `invokePolicyJson` authority tree; null policy = compute admins
   * only). Requires the org **`manage_compute`** permission.
   */
  async upsertTrigger(
    input: ComputeUpsertTriggerMutationVariables['input'],
  ): Promise<ComputeUpsertTriggerMutation['computeUpsertTrigger']> {
    const data = await this.gql.request(ComputeUpsertTriggerDocument, { input });
    return data.computeUpsertTrigger;
  }

  /**
   * Delete a trigger by id. Requires the org **`manage_compute`** permission.
   *
   * @returns `true` if a trigger was deleted.
   */
  async deleteTrigger(
    variables: ComputeDeleteTriggerMutationVariables,
  ): Promise<ComputeDeleteTriggerMutation['computeDeleteTrigger']> {
    const data = await this.gql.request(ComputeDeleteTriggerDocument, variables);
    return data.computeDeleteTrigger;
  }

  /**
   * Set the app's compute policy (guardrails: kill switch, module count,
   * tick-rate / fuel / memory / runtime / host-op / egress ceilings, circuit
   * tuning). Omitted fields keep their current values; values above the
   * platform ceilings are rejected. Requires the org **`manage_compute`**
   * permission.
   */
  async setPolicy(
    input: ComputeSetPolicyMutationVariables['input'],
  ): Promise<ComputeSetPolicyMutation['computeSetPolicy']> {
    const data = await this.gql.request(ComputeSetPolicyDocument, { input });
    return data.computeSetPolicy;
  }

  // -- Invoke ------------------------------------------------------------------

  /**
   * Invoke a module's client-callable export (an `invoke` trigger) as a
   * **synchronous RPC**: the module runs server-side and its result comes
   * back directly — unlike the spatial send surface, a failure (policy
   * denial, fuel exhaustion, trap) is a thrown error, not a silent drop.
   *
   * Authorization: the export's invoke policy, or `manage_compute` holders
   * only when no policy is set.
   *
   * @returns The invoke result; `resultJson` is set when the module's bytes
   *   parse as JSON (`resultBase64` always carries the raw bytes).
   * @throws {CrowdyGraphQLError} `FORBIDDEN` on policy denial; `BAD_REQUEST`
   *   when the module is disabled or the call fails inside the sandbox.
   */
  async invoke(
    variables: ComputeInvokeMutationVariables,
  ): Promise<ComputeInvokeMutation['computeInvoke']> {
    const data = await this.gql.request(ComputeInvokeDocument, variables);
    return data.computeInvoke;
  }

  // -- Monitoring (view_compute_diagnostics) ------------------------------------

  /** List the app's modules. Requires **`view_compute_diagnostics`**. */
  async modules(
    variables: ComputeModulesQueryVariables,
  ): Promise<ComputeModulesQuery['computeModules']> {
    const data = await this.gql.request(ComputeModulesDocument, variables);
    return data.computeModules;
  }

  /** Read one module by name. Requires **`view_compute_diagnostics`**. */
  async module(
    variables: ComputeModuleQueryVariables,
  ): Promise<ComputeModuleQuery['computeModule']> {
    const data = await this.gql.request(ComputeModuleDocument, variables);
    return data.computeModule;
  }

  /**
   * List a module's source versions, newest first, including compile
   * status/log. Requires **`view_compute_diagnostics`**.
   */
  async moduleVersions(
    variables: ComputeModuleVersionsQueryVariables,
  ): Promise<ComputeModuleVersionsQuery['computeModuleVersions']> {
    const data = await this.gql.request(ComputeModuleVersionsDocument, variables);
    return data.computeModuleVersions;
  }

  /**
   * The platform's engine-template registry: ready-made engines deployable
   * by name with {@link deployTemplate}.
   */
  async templates(
    variables: ComputeTemplatesQueryVariables
  ): Promise<ComputeTemplatesQuery['computeTemplates']> {
    const data = await this.gql.request(ComputeTemplatesDocument, variables);
    return data.computeTemplates;
  }

  /**
   * Deploy a named engine template from the platform registry — one call
   * instead of the upsert/deploy/trigger/enable sequence. Compilation runs
   * asynchronously; follow with {@link waitForCompile}.
   */
  async deployTemplate(
    variables: ComputeDeployTemplateMutationVariables
  ): Promise<ComputeDeployTemplateMutation['computeDeployTemplate']> {
    const data = await this.gql.request(ComputeDeployTemplateDocument, variables);
    return data.computeDeployTemplate;
  }

  /**
   * Poll {@link moduleVersions} until the newest version's compile settles
   * (`succeeded` or `failed`). Resolves with the settled version; **rejects**
   * on compile failure (message includes the compile log) or timeout.
   *
   * Requires **`view_compute_diagnostics`**.
   */
  async waitForCompile(
    appId: ComputeModuleVersionsQueryVariables['appId'],
    moduleName: string,
    opts: WaitForCompileOptions = {},
  ): Promise<ComputeModuleVersionsQuery['computeModuleVersions'][number]> {
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const intervalMs = opts.intervalMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const versions = await this.moduleVersions({ appId, moduleName, limit: 1 });
      const latest = versions[0];
      if (latest?.compileStatus === 'succeeded') return latest;
      if (latest?.compileStatus === 'failed') {
        throw new Error(
          `compute module '${moduleName}' compile failed:\n${latest.compileLog ?? '(no log)'}`,
        );
      }
      if (Date.now() + intervalMs > deadline) {
        throw new Error(
          `compute module '${moduleName}' compile did not settle within ${timeoutMs}ms` +
            ` (status: ${latest?.compileStatus ?? 'no version found'})`,
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  /**
   * List trigger bindings, optionally filtered to one module. Requires
   * **`view_compute_diagnostics`**.
   */
  async moduleTriggers(
    variables: ComputeModuleTriggersQueryVariables,
  ): Promise<ComputeModuleTriggersQuery['computeModuleTriggers']> {
    const data = await this.gql.request(ComputeModuleTriggersDocument, variables);
    return data.computeModuleTriggers;
  }

  /**
   * Read the app's compute policy (platform defaults when unset). Requires
   * **`view_compute_diagnostics`**.
   */
  async modulePolicy(
    variables: ComputeModulePolicyQueryVariables,
  ): Promise<ComputeModulePolicyQuery['computeModulePolicy']> {
    const data = await this.gql.request(ComputeModulePolicyDocument, variables);
    return data.computeModulePolicy;
  }

  /**
   * List runs, newest first (module loads/`init`, every failure, and circuit
   * probes; healthy high-frequency ticks are aggregated into per-minute
   * usage instead of one row per tick). Requires
   * **`view_compute_diagnostics`**.
   */
  async moduleRuns(
    variables: ComputeModuleRunsQueryVariables,
  ): Promise<ComputeModuleRunsQuery['computeModuleRuns']> {
    const data = await this.gql.request(ComputeModuleRunsDocument, variables);
    return data.computeModuleRuns;
  }

  /**
   * Aggregate activity over a recent window (default 60 minutes): run and
   * failure counts, fuel, egress, per-module breakdown. Requires
   * **`view_compute_diagnostics`**.
   */
  async moduleStats(
    variables: ComputeModuleStatsQueryVariables,
  ): Promise<ComputeModuleStatsQuery['computeModuleStats']> {
    const data = await this.gql.request(ComputeModuleStatsDocument, variables);
    return data.computeModuleStats;
  }

  /**
   * Diagnostic log lines (guest `log()` output + failure lines), newest
   * first. Requires **`view_compute_diagnostics`**.
   */
  async moduleLogs(
    variables: ComputeModuleLogsQueryVariables,
  ): Promise<ComputeModuleLogsQuery['computeModuleLogs']> {
    const data = await this.gql.request(ComputeModuleLogsDocument, variables);
    return data.computeModuleLogs;
  }

  /**
   * Snapshot of the app's compute footprint: module/version/trigger counts,
   * 24h run activity, most-active modules. Requires
   * **`view_compute_diagnostics`**.
   */
  async appDiagnostics(
    variables: ComputeAppDiagnosticsQueryVariables,
  ): Promise<ComputeAppDiagnosticsQuery['computeAppDiagnostics']> {
    const data = await this.gql.request(ComputeAppDiagnosticsDocument, variables);
    return data.computeAppDiagnostics;
  }
}
