import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector, EngineInvokeResult } from './engine.js';

/** Options for {@link InstancesKit}. */
export interface InstancesKitOptions {
  /** The instance-engine module name. Defaults to `'instance-engine'`. */
  moduleName?: string;
}

/** A parsed instance (private world slice). */
export interface KitInstance {
  instanceId: string;
  name: string;
  creator: string;
  members: string[];
  /** Decimal string (u64 seeds exceed JS safe integers). */
  seed: string;
  status: string;
  outcome: string;
  sessionId: string;
  containerId: string;
  /** Reserved chunk-volume corner [x, y, z]. */
  chunkBase: [number, number, number];
  volumeChunks: number;
}

function toInstance(body: Record<string, unknown>): KitInstance {
  return {
    instanceId: String(body.instanceId ?? ''),
    name: String(body.name ?? ''),
    creator: String(body.creator ?? ''),
    members: Array.isArray(body.members) ? (body.members as unknown[]).map(String) : [],
    seed: String(body.seed ?? '0'),
    status: String(body.status ?? ''),
    outcome: String(body.outcome ?? ''),
    sessionId: String(body.sessionId ?? ''),
    containerId: String(body.containerId ?? ''),
    chunkBase: (Array.isArray(body.chunkBase) ? body.chunkBase : [0, 0, 0]).map(Number) as [
      number,
      number,
      number,
    ],
    volumeChunks: Number(body.volumeChunks ?? 0),
  };
}

/**
 * Runtime helpers for the instance-engine (Wave 2): private world slices
 * with lifecycle (open/join/complete), per-run seeds for deterministic
 * procedural content, and reserved disjoint chunk volumes. v1 spatial
 * isolation is by-convention (disjoint volumes + distance-scoped emits).
 *
 * Obtained via `client.kit(appId).instances`.
 */
export class InstancesKit {
  private readonly moduleName: string;

  constructor(
    _appId: Scalars['BigInt']['input'],
    private readonly engines: EngineDetector,
    options: InstancesKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'instance-engine';
  }

  /** Is the instance engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /** Open a new instance (caller becomes creator + first member). */
  async open(input: { name?: string; seed?: string; sessionId?: string } = {}): Promise<KitInstance> {
    const result = await this.invoke('open', input as Record<string, unknown>);
    return toInstance(result.body);
  }

  /** Join an open instance. */
  async join(instanceId: string): Promise<KitInstance> {
    const result = await this.invoke('join', { instanceId });
    return toInstance(result.body);
  }

  /** Complete an instance (member-only; announces `instance_completed`). */
  async complete(instanceId: string, outcome?: string): Promise<KitInstance> {
    const result = await this.invoke('complete', { instanceId, outcome });
    return toInstance(result.body);
  }

  /** One instance's state (or the engine's totals without an id). */
  async state(instanceId?: string): Promise<KitInstance | Record<string, unknown>> {
    const result = await this.invoke('state', instanceId ? { instanceId } : {});
    return instanceId ? toInstance(result.body) : result.body;
  }

  private async invoke(
    exportName: string,
    params: Record<string, unknown>,
  ): Promise<EngineInvokeResult> {
    const result = await this.engines.invoke(this.moduleName, exportName, params);
    if (!result.success) {
      throw new Error(`instances.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result;
  }
}
