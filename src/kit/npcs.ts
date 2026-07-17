import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import { kitContainerProperties } from './shared.js';

/** Options for {@link NpcsKit}. Must match the deployed NPC blueprint. */
export interface NpcsKitOptions {
  /** The `typeName` the NPC blueprint was deployed with. Defaults to `'Npc'`. */
  typeName?: string;
}

/** A parsed view of one live NPC. */
export interface KitNpc {
  containerId: string;
  displayName: string;
  role: string;
  x: number;
  y: number;
  z: number;
  behaviorState: string;
  health: number;
  /** All visible properties, including any extras your blueprint added. */
  properties: Record<string, unknown>;
}

/**
 * Runtime helpers for the {@link npcBlueprint} conventions: spawn NPC
 * instances, read their server-driven state, and manage/monitor the
 * automations behind them. Behaviors run in the API server — clients only
 * re-read state (or listen for model-driven notifications) and render.
 *
 * Spawning and the automation management/monitoring calls are studio/admin
 * operations (`manage_apps`); reads are player-safe.
 *
 * Obtained via `client.kit(appId).npcs`.
 */
export class NpcsKit {
  private readonly typeName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: NpcsKitOptions = {},
  ) {
    this.typeName = options.typeName ?? 'Npc';
  }

  /** Spawn a live NPC instance (admin — the type is admin-instantiable). */
  async spawn(input: {
    displayName: string;
    role?: string;
    position?: { x: number; y: number; z: number };
    properties?: SeedPropertyInput[];
    sessionId?: string;
  }) {
    const properties: SeedPropertyInput[] = [
      ...(input.role !== undefined
        ? [{ key: 'role', valueType: 'string', valueJson: JSON.stringify(input.role) }]
        : []),
      ...(input.position
        ? [
            { key: 'x', valueType: 'float', valueJson: String(input.position.x) },
            { key: 'y', valueType: 'float', valueJson: String(input.position.y) },
            { key: 'z', valueType: 'float', valueJson: String(input.position.z) },
          ]
        : []),
      ...(input.properties ?? []),
    ];
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.typeName,
      displayName: input.displayName,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(properties.length ? { properties } : {}),
    });
  }

  /**
   * List live NPCs with parsed state, optionally filtered by `role`. Fetches
   * each NPC's visible properties in parallel — fine for the bounded NPC
   * populations automations are designed around.
   */
  async list(options: { role?: string; sessionId?: string } = {}): Promise<KitNpc[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.typeName,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
    const npcs = await Promise.all(
      containers.map((c) => this.toNpc(c.containerId, c.displayName)),
    );
    return options.role !== undefined
      ? npcs.filter((n) => n.role === options.role)
      : npcs;
  }

  /** Read one NPC's current server-side state. */
  async state(npcId: string): Promise<KitNpc> {
    const container = await this.gameModel.container({
      appId: this.appId,
      containerId: npcId,
    });
    return this.toNpc(container.containerId, container.displayName);
  }

  /** Run one of the NPC automations immediately (admin; useful for testing). */
  async runNow(automationName: string) {
    return this.gameModel.runAutomation({ appId: this.appId, name: automationName });
  }

  /**
   * Pause or resume an NPC automation (admin). Re-enabling also resets a
   * tripped failure circuit.
   */
  async setEnabled(automationName: string, enabled: boolean) {
    return this.gameModel.setAutomationEnabled({
      appId: this.appId,
      name: automationName,
      enabled,
    });
  }

  /** Aggregate "what are my NPCs doing" stats over a recent window (admin). */
  async stats(windowMinutes?: number) {
    return this.gameModel.automationStats({
      appId: this.appId,
      ...(windowMinutes !== undefined ? { windowMinutes } : {}),
    });
  }

  /** Recent automation run history, newest first (admin). */
  async runs(options: { automationName?: string; success?: boolean; limit?: number } = {}) {
    return this.gameModel.automationRuns({ appId: this.appId, ...options });
  }

  private async toNpc(containerId: string, displayName: string): Promise<KitNpc> {
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      containerId,
    );
    return {
      containerId,
      displayName,
      role: String(props.role ?? ''),
      x: Number(props.x ?? 0),
      y: Number(props.y ?? 0),
      z: Number(props.z ?? 0),
      behaviorState: String(props.behavior_state ?? ''),
      health: Number(props.health ?? 0),
      properties: props,
    };
  }
}
