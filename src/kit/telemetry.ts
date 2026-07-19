import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import { kitContainerProperties } from './shared.js';

/** Options for {@link TelemetryKit}. */
export interface TelemetryKitOptions {
  /** The counter container type name. Defaults to `'TelemetryCounter'`. */
  counterTypeName?: string;
  /**
   * Sample rate for `track()` in [0, 1] — the client-side budget knob.
   * Defaults to 1 (every event).
   */
  sampleRate?: number;
}

/**
 * Game analytics events (matrix P7) — MODEL-THIN by design: `track()`
 * writes a naming-convention row into the existing model event log via a
 * fire-and-forget container property bump, and sampled counters live in
 * ordinary `TelemetryCounter` containers (`event_name` + `count`). Export
 * and BI are platform concerns, deliberately out of scope; the convention
 * is the abstraction.
 *
 * Naming convention: `<area>.<action>` (e.g. `ftue.step_completed`,
 * `shop.purchase`). Keep cardinality low — counters are containers.
 *
 * Obtained via `client.kit(appId).telemetry`.
 */
export class TelemetryKit {
  private readonly counterTypeName: string;
  private readonly sampleRate: number;
  /** event name -> counter container id (cached per session). */
  private readonly counterIds = new Map<string, string>();

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: TelemetryKitOptions = {},
  ) {
    this.counterTypeName = options.counterTypeName ?? 'TelemetryCounter';
    this.sampleRate = options.sampleRate ?? 1;
  }

  /**
   * Track one event — fire-and-forget (never throws, never blocks
   * gameplay): bumps the event's sampled counter. `props` ride the
   * container's last-props snapshot for spot-debugging (NOT a warehouse).
   */
  track(name: string, props: Record<string, unknown> = {}): void {
    if (Math.random() > this.sampleRate) return;
    void this.bump(name, props).catch(() => undefined);
  }

  /** The awaitable form of {@link track} for tests/backfills. */
  async bump(name: string, props: Record<string, unknown> = {}): Promise<void> {
    const containerId = await this.ensureCounter(name);
    const current = await kitContainerProperties(this.gameModel, String(this.appId), containerId);
    await this.gameModel.setProperty({
      appId: this.appId,
      containerId,
      key: 'count',
      valueType: 'int',
      valueJson: String(Number(current.count ?? 0) + 1),
    });
    if (Object.keys(props).length > 0) {
      await this.gameModel.setProperty({
        appId: this.appId,
        containerId,
        key: 'last_props',
        valueType: 'string',
        valueJson: JSON.stringify(JSON.stringify(props).slice(0, 500)),
      });
    }
  }

  /** Read the sampled counters (dashboards, tests). */
  async counters(): Promise<Array<{ eventName: string; count: number; lastProps: string }>> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.counterTypeName,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(this.gameModel, String(this.appId), c.containerId);
        return {
          eventName: String(props.event_name ?? ''),
          count: Number(props.count ?? 0),
          lastProps: String(props.last_props ?? ''),
        };
      }),
    );
  }

  private async ensureCounter(name: string): Promise<string> {
    const cached = this.counterIds.get(name);
    if (cached) return cached;
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.counterTypeName,
    });
    for (const c of containers) {
      const props = await kitContainerProperties(this.gameModel, String(this.appId), c.containerId);
      if (String(props.event_name ?? '') === name) {
        this.counterIds.set(name, c.containerId);
        return c.containerId;
      }
    }
    const created = await this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.counterTypeName,
      displayName: `telemetry ${name}`,
      properties: [
        { key: 'event_name', valueType: 'string', valueJson: JSON.stringify(name) },
        { key: 'count', valueType: 'int', valueJson: '0' },
      ],
    });
    this.counterIds.set(name, created.containerId);
    return created.containerId;
  }
}

/** The telemetry blueprint: one counter type; the convention is the point. */
export function telemetryBlueprint(counterTypeName = 'TelemetryCounter') {
  return {
    name: 'telemetry',
    containerTypes: [
      {
        typeName: counterTypeName,
        displayName: 'Telemetry counter',
        description:
          "One sampled event counter (event_name + count + last_props). Naming convention: '<area>.<action>'.",
      },
    ],
    propertyDefinitions: [
      {
        containerTypeName: counterTypeName,
        key: 'event_name',
        valueType: 'string',
        defaultValueJson: '""',
        description: "The tracked event's convention name ('<area>.<action>').",
      },
      {
        containerTypeName: counterTypeName,
        key: 'count',
        valueType: 'int',
        defaultValueJson: '0',
        description: 'Sampled occurrence count.',
      },
      {
        containerTypeName: counterTypeName,
        key: 'last_props',
        valueType: 'string',
        defaultValueJson: '""',
        description: 'The last tracked props JSON (spot-debugging, not a warehouse).',
      },
    ],
  };
}
