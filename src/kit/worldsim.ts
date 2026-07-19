import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import { worldsimNames, type WorldsimNames } from './blueprints/index.js';
import type { EngineDetector, EngineInvokeResult } from './engine.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';
import { parseWeatherEvent, type WeatherEvent } from './wire.js';

/** Options for {@link WorldsimKit}. Must match the deployed worldsim blueprint. */
export interface WorldsimKitOptions {
  /** The `typePrefix` the worldsim blueprint was deployed with. */
  typePrefix?: string;
  /**
   * The compute module serving `forecast` when the app runs a world engine.
   * Defaults to `'world-engine'`.
   */
  moduleName?: string;
}

/** A world engine's forecast (current front + day phase). */
export interface KitForecast {
  weather: string;
  /** Day phase in [0, 1) when the engine reports it. */
  dayPhase?: number;
  isNight?: boolean;
  /** Milliseconds until the current front rolls. */
  remainingMs?: number;
  body: Record<string, unknown>;
}

/** A parsed view of the world clock/weather state. */
export interface KitWorldState {
  containerId: string;
  timeOfDay: number;
  day: number;
  weather: string;
}

/** A parsed view of one resource node. */
export interface KitResourceNode {
  containerId: string;
  displayName: string;
  nodeId: string;
  resourceItemId: string;
  amount: number;
  maxAmount: number;
  regenRate: number;
  x: number;
  y: number;
  z: number;
}

/** A parsed view of one crop / production job. */
export interface KitCrop {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  stage: number;
  maxStage: number;
  outputItemId: string;
  outputQty: number;
  ready: boolean;
}

/** A parsed view of one wave spawner. */
export interface KitWaveSpawner {
  containerId: string;
  displayName: string;
  wave: number;
  nextWaveSize: number;
}

/**
 * Runtime helpers for the {@link worldsimBlueprint} conventions: the world
 * clock/weather singleton, regenerating resource nodes players gather from,
 * crops that mature server-side, and wave counters the host reads. The
 * simulation itself runs in automations — these helpers create/read state
 * and drive the player-facing functions.
 *
 * Obtained via `client.kit(appId).worldsim`.
 */
export class WorldsimKit {
  private readonly names: WorldsimNames;
  private readonly moduleName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: WorldsimKitOptions = {},
    private readonly engines?: EngineDetector,
  ) {
    this.names = worldsimNames(options.typePrefix ?? '');
    this.moduleName = options.moduleName ?? 'world-engine';
  }

  /** Is a world compute engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    if (!this.engines) return Promise.resolve(false);
    return this.engines.has(this.moduleName);
  }

  /**
   * The world engine's `forecast` invoke: the current weather front plus
   * day-phase fields. Late joiners call this once, then track transitions
   * from the type-90 event stream ({@link parseWeather}).
   */
  async forecast(): Promise<KitForecast> {
    const result: EngineInvokeResult = this.engines
      ? await this.engines.invoke(this.moduleName, 'forecast')
      : { success: false, reason: 'compute domain unavailable', body: {} };
    if (!result.success) {
      throw new Error(`forecast unavailable: ${result.reason ?? 'engine missing'}`);
    }
    return {
      weather: String(result.body.weather ?? ''),
      dayPhase: typeof result.body.dayPhase === 'number' ? result.body.dayPhase : undefined,
      isNight: typeof result.body.isNight === 'boolean' ? result.body.isNight : undefined,
      remainingMs:
        typeof result.body.remainingMs === 'number' ? result.body.remainingMs : undefined,
      body: result.body,
    };
  }

  /**
   * Parse a server-event payload as a world-engine weather transition
   * (type 90), or null when it is another event type. Feed it your world
   * session's server-event stream.
   */
  parseWeather(payload: Uint8Array): WeatherEvent | null {
    return parseWeatherEvent(payload);
  }

  /**
   * Find-or-create the WorldState singleton (admin). `anchorChunk` is where
   * the clock's spatial time-changed ping is emitted.
   */
  async ensureWorld(
    options: { anchorChunk?: { x: number; y: number; z: number }; displayName?: string } = {},
  ) {
    const existing = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.worldStateType,
    });
    if (existing.length > 0) return existing[0];
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.worldStateType,
      displayName: options.displayName ?? 'World',
      properties: options.anchorChunk
        ? [
            { key: 'cx', valueType: 'int', valueJson: String(options.anchorChunk.x) },
            { key: 'cy', valueType: 'int', valueJson: String(options.anchorChunk.y) },
            { key: 'cz', valueType: 'int', valueJson: String(options.anchorChunk.z) },
          ]
        : [],
    });
  }

  /** Read the world clock/weather state. */
  async worldState(): Promise<KitWorldState> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.worldStateType,
    });
    if (containers.length === 0) {
      throw new Error(
        `No ${this.names.worldStateType} exists yet — run kit.worldsim.ensureWorld() as admin`,
      );
    }
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      containers[0].containerId,
    );
    return {
      containerId: containers[0].containerId,
      timeOfDay: Number(props.time_of_day ?? 0),
      day: Number(props.day ?? 0),
      weather: String(props.weather ?? 'clear'),
    };
  }

  /** Force the weather (app admins only — the policy denies everyone else). */
  async setWeather(weather: string): Promise<KitInvokeResult<string>> {
    const state = await this.worldState();
    return kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.setWeatherFn,
      selfContainerId: state.containerId,
      params: { weather },
    });
  }

  /** Create a resource node (admin). */
  async createNode(input: {
    displayName: string;
    nodeId: string;
    resourceItemId: string;
    amount?: number;
    maxAmount?: number;
    regenRate?: number;
    position?: { x: number; y: number; z: number };
    properties?: SeedPropertyInput[];
  }) {
    const maxAmount = input.maxAmount ?? 100;
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.nodeType,
      displayName: input.displayName,
      properties: [
        { key: 'node_id', valueType: 'string', valueJson: JSON.stringify(input.nodeId) },
        {
          key: 'resource_item_id',
          valueType: 'string',
          valueJson: JSON.stringify(input.resourceItemId),
        },
        { key: 'amount', valueType: 'int', valueJson: String(input.amount ?? maxAmount) },
        { key: 'max_amount', valueType: 'int', valueJson: String(maxAmount) },
        { key: 'regen_rate', valueType: 'int', valueJson: String(input.regenRate ?? 1) },
        ...(input.position
          ? [
              { key: 'x', valueType: 'float', valueJson: String(input.position.x) },
              { key: 'y', valueType: 'float', valueJson: String(input.position.y) },
              { key: 'z', valueType: 'float', valueJson: String(input.position.z) },
            ]
          : []),
        ...(input.properties ?? []),
      ],
    });
  }

  /** List resource nodes with parsed state. */
  async nodes(): Promise<KitResourceNode[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.nodeType,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          nodeId: String(props.node_id ?? ''),
          resourceItemId: String(props.resource_item_id ?? ''),
          amount: Number(props.amount ?? 0),
          maxAmount: Number(props.max_amount ?? 0),
          regenRate: Number(props.regen_rate ?? 0),
          x: Number(props.x ?? 0),
          y: Number(props.y ?? 0),
          z: Number(props.z ?? 0),
        };
      }),
    );
  }

  /**
   * Gather from a node into a caller-owned stack of the node's resource;
   * the node decrement and the grant commit atomically. Resolves with the
   * node's remaining amount.
   */
  async gather(input: {
    nodeId: string;
    amount: number;
    toStackId: string;
  }): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.gatherNodeFn,
      selfContainerId: input.nodeId,
      params: { amount: input.amount, to_stack_id: input.toStackId },
    });
  }

  /** Plant a crop / start a production job (member). */
  async plant(input: {
    ownerUserId: Scalars['BigInt']['input'];
    outputItemId: string;
    outputQty?: number;
    maxStage?: number;
    displayName?: string;
    sessionId?: string;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.cropType,
      displayName: input.displayName ?? `Crop ${input.outputItemId}`,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      properties: [
        { key: 'owner_user_id', valueType: 'int', valueJson: String(input.ownerUserId) },
        {
          key: 'output_item_id',
          valueType: 'string',
          valueJson: JSON.stringify(input.outputItemId),
        },
        { key: 'output_qty', valueType: 'int', valueJson: String(input.outputQty ?? 1) },
        { key: 'max_stage', valueType: 'int', valueJson: String(input.maxStage ?? 3) },
      ],
    });
  }

  /** List a player's crops (all crops when `ownerUserId` is null). */
  async crops(
    ownerUserId: Scalars['BigInt']['input'] | null,
  ): Promise<KitCrop[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.cropType,
    });
    const filtered =
      ownerUserId === null
        ? containers
        : containers.filter(
            (c) =>
              c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
          );
    return Promise.all(
      filtered.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        const stage = Number(props.stage ?? 0);
        const maxStage = Number(props.max_stage ?? 0);
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          stage,
          maxStage,
          outputItemId: String(props.output_item_id ?? ''),
          outputQty: Number(props.output_qty ?? 0),
          ready: maxStage > 0 && stage >= maxStage,
        };
      }),
    );
  }

  /**
   * Harvest a grown crop into a caller-owned stack of the output item;
   * resets the stage for regrowth. Resolves with the yield quantity.
   */
  async harvest(cropId: string, toStackId: string): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.harvestFn,
      selfContainerId: cropId,
      params: { to_stack_id: toStackId },
    });
  }

  /** Create a wave spawner (admin; blueprint deployed with `waves`). */
  async createSpawner(input: {
    displayName: string;
    nextWaveSize?: number;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.spawnerType,
      displayName: input.displayName,
      properties: [
        {
          key: 'next_wave_size',
          valueType: 'int',
          valueJson: String(input.nextWaveSize ?? 5),
        },
      ],
    });
  }

  /** List wave spawners (the host reads these to spawn entities). */
  async spawners(): Promise<KitWaveSpawner[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.spawnerType,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          wave: Number(props.wave ?? 0),
          nextWaveSize: Number(props.next_wave_size ?? 0),
        };
      }),
    );
  }

  /** Run one of the worldsim automations immediately (admin; for testing). */
  async runNow(automationName: string) {
    return this.gameModel.runAutomation({ appId: this.appId, name: automationName });
  }

  /** Pause or resume one of the worldsim automations (admin). */
  async setEnabled(automationName: string, enabled: boolean) {
    return this.gameModel.setAutomationEnabled({
      appId: this.appId,
      name: automationName,
      enabled,
    });
  }
}
