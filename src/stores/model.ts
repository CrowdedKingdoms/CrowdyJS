/**
 * ContainerMirror — the client half of the platform's **notify-to-pull**
 * pattern for game-model state: keep typed snapshots of the containers you
 * care about, re-pull them on demand or whenever a bound channel pings
 * ("state changed"), and render straight from the cache.
 *
 * Model changes are pull-based on this platform (there is no model
 * subscription); functions declare channel/spatial notifications and clients
 * re-read. The Game Kit's match layer pings a per-match channel — bind the
 * mirror to that channel and every watched container refreshes itself.
 */

import type { WorldSessionContext } from './session.js';

/** A typed snapshot of one watched container. */
export interface MirroredContainer<T = Record<string, unknown>> {
  readonly containerId: string;
  typeName: string;
  displayName: string;
  ownerUserId: string | null;
  /** The parsed, caller-visible properties. */
  value: T;
  /** Bumped on every refresh that changed the snapshot. */
  revision: number;
  /** Local time of the last refresh. */
  refreshedAt: number;
}

/** Options for {@link attachContainerMirror}. */
export interface ContainerMirrorConfig {
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface WatchEntry {
  parse: (properties: Record<string, unknown>) => unknown;
  snapshot: MirroredContainer<unknown> | null;
  /** Serialized form of the last snapshot for change detection. */
  lastSerialized: string | null;
}

/**
 * The SDK-managed **model mirror**: typed, cached snapshots of watched
 * game-model containers with coalesced refresh and channel-ping binding.
 * Reads are synchronous ({@link get}); {@link onChange} fires only when a
 * refresh actually changed the visible state.
 */
export class ContainerMirror {
  private readonly watches = new Map<string, WatchEntry>();
  private readonly listeners = new Set<{
    containerId?: string;
    handler: (container: MirroredContainer<unknown>) => void;
  }>();
  private readonly boundChannels = new Set<string>();
  private readonly now: () => number;
  private refreshing = false;
  private refreshQueued = false;

  constructor(
    private readonly ctx: WorldSessionContext,
    config: ContainerMirrorConfig = {},
  ) {
    this.now = config.now ?? Date.now;

    // One listener serves every bound channel: a ping means "model state
    // changed somewhere relevant" → coalesced refresh of all watches.
    ctx.onDispose(
      ctx.on('channelMessage', (notification) => {
        if (!this.boundChannels.has(String(notification.channelId))) return;
        void this.refreshAll();
      }),
    );
  }

  /**
   * Watch a container: fetches the initial snapshot and keeps it refreshable.
   * `parse` maps the visible properties object to your type (defaults to the
   * raw object).
   */
  async watch<T = Record<string, unknown>>(
    containerId: string,
    parse?: (properties: Record<string, unknown>) => T,
  ): Promise<MirroredContainer<T>> {
    const entry: WatchEntry = {
      parse: parse ?? ((props) => props),
      snapshot: null,
      lastSerialized: null,
    };
    this.watches.set(containerId, entry);
    await this.refresh(containerId);
    return entry.snapshot as MirroredContainer<T>;
  }

  /** Stop watching a container (its snapshot is dropped). */
  unwatch(containerId: string): void {
    this.watches.delete(containerId);
  }

  /** The current snapshot of a watched container (undefined before watch resolves). */
  get<T = Record<string, unknown>>(containerId: string): MirroredContainer<T> | undefined {
    return (this.watches.get(containerId)?.snapshot ?? undefined) as
      | MirroredContainer<T>
      | undefined;
  }

  /** Every watched snapshot. */
  list(): Array<MirroredContainer<unknown>> {
    const out: Array<MirroredContainer<unknown>> = [];
    for (const entry of this.watches.values()) {
      if (entry.snapshot) out.push(entry.snapshot);
    }
    return out;
  }

  /**
   * Subscribe to snapshot changes — every watched container, or one
   * `containerId`. Fires only when a refresh changed the visible state.
   * @returns off.
   */
  onChange(
    handler: (container: MirroredContainer<unknown>) => void,
    containerId?: string,
  ): () => void {
    const entry = { containerId, handler };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  /**
   * Bind a channel: any message on it triggers a coalesced {@link refreshAll}
   * — pair with model functions that declare channel notifications (e.g. the
   * Game Kit's `match_changed` pings).
   */
  bindToChannel(channelId: string): () => void {
    this.boundChannels.add(String(channelId));
    return () => this.boundChannels.delete(String(channelId));
  }

  /** Re-pull one watched container now. */
  async refresh(containerId: string): Promise<void> {
    const entry = this.watches.get(containerId);
    if (!entry) return;
    const state = await this.ctx.client.gameModel.containerState({
      appId: this.ctx.appId,
      containerId,
    });
    let properties: Record<string, unknown>;
    try {
      properties = JSON.parse(state.propertiesJson) as Record<string, unknown>;
    } catch {
      properties = {};
    }
    const serialized = `${state.displayName}|${state.propertiesJson}`;
    const changed = serialized !== entry.lastSerialized;
    entry.lastSerialized = serialized;
    if (!entry.snapshot) {
      entry.snapshot = {
        containerId,
        typeName: state.typeName,
        displayName: state.displayName,
        ownerUserId: state.ownerUserId != null ? String(state.ownerUserId) : null,
        value: entry.parse(properties),
        revision: 1,
        refreshedAt: this.now(),
      };
    } else {
      entry.snapshot.refreshedAt = this.now();
      if (changed) {
        entry.snapshot.typeName = state.typeName;
        entry.snapshot.displayName = state.displayName;
        entry.snapshot.ownerUserId =
          state.ownerUserId != null ? String(state.ownerUserId) : null;
        entry.snapshot.value = entry.parse(properties);
        entry.snapshot.revision += 1;
      }
    }
    if (changed) {
      for (const listener of [...this.listeners]) {
        if (
          listener.containerId === undefined ||
          listener.containerId === containerId
        ) {
          listener.handler(entry.snapshot);
        }
      }
    }
  }

  /**
   * Re-pull every watched container. Concurrent calls coalesce: a refresh
   * requested while one is running queues exactly one follow-up pass (pings
   * can burst; state converges without stampeding the API).
   */
  async refreshAll(): Promise<void> {
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing = true;
    try {
      do {
        this.refreshQueued = false;
        await Promise.all(
          [...this.watches.keys()].map((id) =>
            this.refresh(id).catch(() => {
              // A failed pull keeps the previous snapshot; the next ping retries.
            }),
          ),
        );
      } while (this.refreshQueued);
    } finally {
      this.refreshing = false;
    }
  }
}

/** Attach a {@link ContainerMirror}. Prefer the `model` config key. */
export function attachContainerMirror(
  ctx: WorldSessionContext,
  config: ContainerMirrorConfig = {},
): ContainerMirror {
  return new ContainerMirror(ctx, config);
}
