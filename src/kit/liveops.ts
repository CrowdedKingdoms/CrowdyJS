import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import { liveopsNames, type LiveopsNames } from './blueprints/liveops.js';
import type { EngineDetector } from './engine.js';
import { kitContainerProperties, kitInvoke } from './shared.js';
import { parseEngineEvent, EVENT_ZONE_CHANGE } from './wire.js';

/** Options for {@link LiveopsKit}. */
export interface LiveopsKitOptions {
  /** The `typePrefix` the liveops blueprint was deployed with. */
  typePrefix?: string;
  /** The scheduler engine module name. Defaults to `'liveops-scheduler'`. */
  moduleName?: string;
}

/** A parsed event window. */
export interface KitEventWindow {
  containerId: string;
  windowId: string;
  active: boolean;
  opensAtMs: number;
  closesAtMs: number;
  modifiers: Record<string, unknown>;
}

/** A parsed season definition (+ its battle-pass composition). */
export interface KitSeason {
  containerId: string;
  seasonId: string;
  active: boolean;
  startsAtMs: number;
  endsAtMs: number;
  passTrack: string;
  passFeatures: string[];
}

/** A parsed type-98 zone-change event (BR circles, event areas). */
export interface ZoneChangeEvent {
  kind: string;
  phase: number | null;
  radiusNow: number;
  centerX: number;
  centerZ: number;
  body: Record<string, unknown>;
}

/**
 * Runtime helpers for the liveops blueprint: event windows (admin CRUD +
 * active reads — engine-backed when the liveops-scheduler is deployed),
 * seasons with battle-pass composition, and the type-98 zone-change parser.
 *
 * Obtained via `client.kit(appId).liveops`.
 */
export class LiveopsKit {
  private readonly names: LiveopsNames;
  private readonly moduleName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: LiveopsKitOptions = {},
    private readonly engines?: EngineDetector,
  ) {
    this.names = liveopsNames(options.typePrefix ?? '');
    this.moduleName = options.moduleName ?? 'liveops-scheduler';
  }

  /** Is the liveops-scheduler engine deployed + enabled (cached)? */
  engineAvailable(): Promise<boolean> {
    if (!this.engines) return Promise.resolve(false);
    return this.engines.has(this.moduleName);
  }

  /** STUDIO (admin) — create an event window. */
  async defineWindow(input: {
    windowId: string;
    displayName?: string;
    opensAtMs?: number;
    closesAtMs?: number;
    modifiers?: Record<string, unknown>;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.windowType,
      displayName: input.displayName ?? `Window ${input.windowId}`,
      properties: [
        { key: 'window_id', valueType: 'string', valueJson: JSON.stringify(input.windowId) },
        ...(input.opensAtMs !== undefined
          ? [{ key: 'opens_at_ms', valueType: 'int', valueJson: String(input.opensAtMs) }]
          : []),
        ...(input.closesAtMs !== undefined
          ? [{ key: 'closes_at_ms', valueType: 'int', valueJson: String(input.closesAtMs) }]
          : []),
        {
          key: 'modifiers',
          valueType: 'string',
          valueJson: JSON.stringify(JSON.stringify(input.modifiers ?? {})),
        },
      ],
    });
  }

  /** Every window (model read). */
  async windows(): Promise<KitEventWindow[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.windowType,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(this.gameModel, String(this.appId), c.containerId);
        let modifiers: Record<string, unknown> = {};
        try {
          modifiers = JSON.parse(String(props.modifiers ?? '{}')) as Record<string, unknown>;
        } catch {
          /* opaque */
        }
        return {
          containerId: c.containerId,
          windowId: String(props.window_id ?? ''),
          active: props.active === true,
          opensAtMs: Number(props.opens_at_ms ?? 0),
          closesAtMs: Number(props.closes_at_ms ?? 0),
          modifiers,
        };
      }),
    );
  }

  /**
   * The ACTIVE windows. Engine path (scheduler deployed): the module's
   * authoritative view; otherwise filters the model read.
   */
  async activeWindows(): Promise<KitEventWindow[]> {
    if (this.engines && (await this.engineAvailable())) {
      const result = await this.engines.invoke(this.moduleName, 'active_windows', {});
      if (result.success && Array.isArray(result.body.windows)) {
        const all = await this.windows();
        const activeIds = new Set(
          (result.body.windows as Array<Record<string, unknown>>).map((w) => String(w.windowId)),
        );
        return all.filter((w) => activeIds.has(w.windowId));
      }
    }
    return (await this.windows()).filter((w) => w.active);
  }

  /** STUDIO (admin/automation) — open a window through the model function. */
  async openWindow(windowContainerId: string, sessionId?: string) {
    return kitInvoke<boolean>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.openWindowFn,
      selfContainerId: windowContainerId,
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }

  /** STUDIO (admin/automation) — close a window through the model function. */
  async closeWindow(windowContainerId: string, sessionId?: string) {
    return kitInvoke<boolean>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.closeWindowFn,
      selfContainerId: windowContainerId,
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }

  /** STUDIO (admin) — create a season (+ battle-pass composition). */
  async defineSeason(input: {
    seasonId: string;
    displayName?: string;
    startsAtMs?: number;
    endsAtMs?: number;
    passTrack?: string;
    passFeatures?: string[];
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.seasonType,
      displayName: input.displayName ?? `Season ${input.seasonId}`,
      properties: [
        { key: 'season_id', valueType: 'string', valueJson: JSON.stringify(input.seasonId) },
        ...(input.startsAtMs !== undefined
          ? [{ key: 'starts_at_ms', valueType: 'int', valueJson: String(input.startsAtMs) }]
          : []),
        ...(input.endsAtMs !== undefined
          ? [{ key: 'ends_at_ms', valueType: 'int', valueJson: String(input.endsAtMs) }]
          : []),
        ...(input.passTrack !== undefined
          ? [{ key: 'pass_track', valueType: 'string', valueJson: JSON.stringify(input.passTrack) }]
          : []),
        {
          key: 'pass_features',
          valueType: 'string',
          valueJson: JSON.stringify(JSON.stringify(input.passFeatures ?? [])),
        },
      ],
    });
  }

  /** Every season (model read). */
  async seasons(): Promise<KitSeason[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.seasonType,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(this.gameModel, String(this.appId), c.containerId);
        let passFeatures: string[] = [];
        try {
          passFeatures = (JSON.parse(String(props.pass_features ?? '[]')) as unknown[]).map(String);
        } catch {
          /* opaque */
        }
        return {
          containerId: c.containerId,
          seasonId: String(props.season_id ?? ''),
          active: props.active === true,
          startsAtMs: Number(props.starts_at_ms ?? 0),
          endsAtMs: Number(props.ends_at_ms ?? 0),
          passTrack: String(props.pass_track ?? ''),
          passFeatures,
        };
      }),
    );
  }

  /** The active season, when one exists. */
  async currentSeason(): Promise<KitSeason | null> {
    return (await this.seasons()).find((s) => s.active) ?? null;
  }

  /** STUDIO (admin/automation) — activate a season through the model function. */
  async activateSeason(seasonContainerId: string, sessionId?: string) {
    return kitInvoke<boolean>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.activateSeasonFn,
      selfContainerId: seasonContainerId,
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }

  /** Parse a type-98 zone-change server event (BR circles, event areas). */
  parseZoneChange(bytes: Uint8Array): ZoneChangeEvent | null {
    const parsed = parseEngineEvent(bytes);
    if (!parsed || parsed.eventType !== EVENT_ZONE_CHANGE) return null;
    return {
      kind: String(parsed.body.kind ?? ''),
      phase: parsed.body.phase != null ? Number(parsed.body.phase) : null,
      radiusNow: Number(parsed.body.radiusNow ?? 0),
      centerX: Number(parsed.body.centerX ?? 0),
      centerZ: Number(parsed.body.centerZ ?? 0),
      body: parsed.body,
    };
  }
}
