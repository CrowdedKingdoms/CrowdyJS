import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';
import { kitContainerProperties } from './shared.js';
import type { EnginePose } from './wire.js';

/** Options for {@link NpcsKit}. Must match the deployed NPC blueprint. */
export interface NpcsKitOptions {
  /** The `typeName` the NPC blueprint was deployed with. Defaults to `'Npc'`. */
  typeName?: string;
  /**
   * The compute module driving NPC movement when the app runs an engine
   * (smooth FLAG_NPC actor emits instead of property nudges). Defaults to
   * `'npc-engine'`.
   */
  moduleName?: string;
}

/**
 * The minimal shape of a live actor entry {@link overlayLivePoses} reads —
 * matches the world-session `RemoteActor<EnginePose>` without importing it.
 */
export interface LiveNpcPose {
  uuid: string;
  state: Pick<EnginePose, 'x' | 'y' | 'z'>;
  receivedAt: number;
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
  private readonly moduleName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: NpcsKitOptions = {},
    private readonly engines?: EngineDetector,
  ) {
    this.typeName = options.typeName ?? 'Npc';
    this.moduleName = options.moduleName ?? 'npc-engine';
  }

  /**
   * Is an NPC compute engine deployed + enabled (cached per session)? When
   * true, NPCs stream smooth FLAG_NPC actor poses — overlay them with
   * {@link overlayLivePoses}. When false (model-only deployment), the polled
   * container positions are all there is, exactly as before.
   */
  engineAvailable(): Promise<boolean> {
    if (!this.engines) return Promise.resolve(false);
    return this.engines.has(this.moduleName);
  }

  /**
   * Overlay live engine-driven poses onto a polled NPC snapshot (the
   * generalized BWF `NpcService.withLivePoses` pattern): each NPC whose
   * `actor_uuid` has a fresh pose in the npcs actor lane gets its position
   * replaced; the rest keep their durable container position, so NPCs stand
   * at their last synced spot instead of disappearing.
   *
   * @param npcs - The polled snapshot (from {@link list}).
   * @param lane - The live actors, e.g. `session.actors.lane('npcs').list()`.
   */
  overlayLivePoses(npcs: KitNpc[], lane: LiveNpcPose[]): KitNpc[] {
    if (lane.length === 0) return npcs;
    const poses = new Map(lane.map((actor) => [actor.uuid, actor]));
    return npcs.map((npc) => {
      const uuid = String(npc.properties.actor_uuid ?? '');
      const live = uuid ? poses.get(uuid) : undefined;
      if (!live) return npc;
      return { ...npc, x: live.state.x, y: live.state.y, z: live.state.z };
    });
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
