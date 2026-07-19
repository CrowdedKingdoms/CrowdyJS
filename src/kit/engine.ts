/**
 * Compute-engine capability detection + invoke envelope for the kit helpers.
 * Games deploy engines (mob-engine, world-engine, bwf-mobs, ...) as compute
 * modules; kit helpers probe once per module per session and route through
 * the engine when it is present, falling back to the model/automation path
 * when it is not — so the same client code works on model-only deployments.
 */

import { CrowdyGraphQLError } from '../errors.js';
import type { ComputeAPI } from '../domains/compute.js';

/** The `{success, ...}` envelope engine invoke exports resolve with. */
export interface EngineInvokeResult<T = Record<string, unknown>> {
  success: boolean;
  /** The engine's denial reason when `success` is false. */
  reason?: string;
  /** The parsed result body (includes any extra fields the export returns). */
  body: T & Record<string, unknown>;
  fuelUsed?: string;
  durationUs?: number;
}

/**
 * Per-session cached probe of which compute modules an app has enabled.
 * Obtained internally by kit helpers; share one via `kit.engines`.
 */
export class EngineDetector {
  private readonly cache = new Map<string, Promise<boolean>>();

  constructor(
    private readonly appId: string,
    private readonly compute: ComputeAPI | undefined,
  ) {}

  /**
   * Is `moduleName` deployed + enabled? Cached per module for the client's
   * lifetime ({@link reset} to re-probe after deploys). Resolves false when
   * the client has no compute domain wired.
   */
  has(moduleName: string): Promise<boolean> {
    if (!this.compute) return Promise.resolve(false);
    let probe = this.cache.get(moduleName);
    if (!probe) {
      probe = this.probe(moduleName);
      this.cache.set(moduleName, probe);
    }
    return probe;
  }

  /** Drop cached probes (call after deploying/enabling modules). */
  reset(): void {
    this.cache.clear();
  }

  /**
   * Invoke an engine export and parse the `{success, ...}` envelope.
   * Envelope failures (denials) resolve — only transport/user errors throw.
   */
  async invoke<T = Record<string, unknown>>(
    moduleName: string,
    exportName: string,
    params?: Record<string, unknown>,
  ): Promise<EngineInvokeResult<T>> {
    if (!this.compute) {
      return {
        success: false,
        reason: 'compute domain unavailable',
        body: {} as T & Record<string, unknown>,
      };
    }
    try {
      const result = await this.compute.invoke({
        appId: this.appId,
        moduleName,
        exportName,
        ...(params !== undefined ? { paramsJson: JSON.stringify(params) } : {}),
      });
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(result.resultJson ?? '{}') as Record<string, unknown>;
      } catch {
        body = {};
      }
      return {
        success: body.success !== false,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        body: body as T & Record<string, unknown>,
        fuelUsed: result.fuelUsed != null ? String(result.fuelUsed) : undefined,
        durationUs: result.durationUs != null ? Number(result.durationUs) : undefined,
      };
    } catch (error) {
      if (error instanceof CrowdyGraphQLError) {
        return {
          success: false,
          reason: error.message,
          body: {} as T & Record<string, unknown>,
        };
      }
      throw error;
    }
  }

  private async probe(moduleName: string): Promise<boolean> {
    if (!this.compute) return false;
    try {
      const module = await this.compute.module({ appId: this.appId, name: moduleName });
      return module != null && module.enabled === true;
    } catch (error) {
      if (!(error instanceof CrowdyGraphQLError)) throw error;
      if (error.code !== 'FORBIDDEN') return false;
    }
    // Player tokens lack view_compute_diagnostics: probe via a status invoke
    // (engines all export one). Missing modules reject; denials mean present.
    try {
      const result = await this.invoke(moduleName, 'status');
      if (result.success) return true;
      return !/not found|no such module|not enabled/i.test(result.reason ?? '');
    } catch {
      return false;
    }
  }
}
