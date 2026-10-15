/**
 * The kit's observable value: `get` the current value, `subscribe` to hear each new one. The
 * shape React's `useSyncExternalStore(store.subscribe, store.get)` takes, and that any other
 * framework wraps in a line.
 */
export interface KitStore<T> {
  get(): T;
  /** Calls `listener` with every new value; returns the function that stops it. */
  subscribe(listener: (value: T) => void): () => void;
}

/** A {@link KitStore} its owner sets. */
export class WritableKitStore<T> implements KitStore<T> {
  private value: T;
  private readonly listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(value: T): void {
    this.value = value;
    for (const l of [...this.listeners]) {
      try {
        l(value);
      } catch {
        /* a listener's exception is its own */
      }
    }
  }
}
