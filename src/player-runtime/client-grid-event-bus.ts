/**
 * The page-local half of the grid event bus (DN-10 §4). A CLIENT mod's
 * `emit_event(name, payload, target?)` never leaves the page: it reaches the
 * other client mods running on the SAME grid in this browser, through their
 * `on_event` export. A mod on another grid never sees it, and neither does the
 * server (server mods have their own grid bus, reached by server code).
 */

/** What a subscribed mod receives in `on_event` (JSON-encoded). */
export interface ClientGridEvent {
  kind: 'grid_event';
  gridId: string;
  eventName: string;
  payload: unknown;
  sourceModule: string | null;
  /** Set when the emitter addressed one module by name. */
  target: string | null;
  /** Hops since the originating dispatch; the bus drops anything past the cap. */
  cascadeDepth: number;
}

export interface ClientGridEventSubscriber {
  moduleName: string | null;
  deliver(event: ClientGridEvent): boolean;
}

/** Same ceiling as the server event buses. */
export const CLIENT_GRID_EVENT_MAX_CASCADE = 8;

export class ClientGridEventBus {
  private readonly byGrid = new Map<string, Set<ClientGridEventSubscriber>>();

  subscribe(gridId: string, subscriber: ClientGridEventSubscriber): () => void {
    let set = this.byGrid.get(gridId);
    if (!set) {
      set = new Set();
      this.byGrid.set(gridId, set);
    }
    set.add(subscriber);
    return () => {
      const current = this.byGrid.get(gridId);
      if (!current) return;
      current.delete(subscriber);
      if (current.size === 0) this.byGrid.delete(gridId);
    };
  }

  /**
   * Deliver to every subscriber on `event.gridId` except the sender (unless
   * the sender addressed itself). Returns how many mods accepted it.
   */
  publish(event: ClientGridEvent, sender?: ClientGridEventSubscriber): number {
    if (event.cascadeDepth > CLIENT_GRID_EVENT_MAX_CASCADE) return 0;
    const set = this.byGrid.get(event.gridId);
    if (!set) return 0;
    let delivered = 0;
    for (const subscriber of [...set]) {
      if (event.target !== null) {
        if (subscriber.moduleName !== event.target) continue;
      } else if (subscriber === sender) {
        continue;
      }
      if (subscriber.deliver(event)) delivered += 1;
    }
    return delivered;
  }
}

/** The bus every broker joins unless it is given its own (or `null`). */
export const defaultClientGridEventBus = new ClientGridEventBus();
