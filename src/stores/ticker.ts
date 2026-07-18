/**
 * The scheduler behind every timer-driven store behavior (the actor send
 * loop, stale reaping, chunk write-back throttling, the host heartbeat).
 *
 * Why an abstraction: browsers throttle main-thread timers in hidden tabs
 * (≥1 s immediately, down to ~1/minute under intensive throttling), which
 * would silently drop a backgrounded player's presence rate. Timers inside a
 * **dedicated Web Worker are exempt**, so games that need full-rate sends
 * while backgrounded pass {@link workerTicker} to `createWorldSession`;
 * everything else defaults to {@link intervalTicker}. Tests drive stores
 * deterministically with {@link manualTicker}.
 *
 * (WebSocket message delivery is NOT throttled in hidden tabs, so inbound
 * store updates flow regardless of the ticker choice.)
 */

/** A cancellable repeating-callback scheduler. */
export interface Ticker {
  /**
   * Invoke `callback` every `intervalMs` until cancelled.
   * @returns A cancel function for this schedule.
   */
  every(intervalMs: number, callback: () => void): () => void;
  /** Cancel every schedule and release resources (e.g. terminate the worker). */
  dispose(): void;
}

/** Plain `setInterval` ticker — the default. Subject to background-tab throttling. */
export function intervalTicker(): Ticker {
  const handles = new Set<ReturnType<typeof setInterval>>();
  return {
    every(intervalMs, callback) {
      const handle = setInterval(callback, intervalMs);
      handles.add(handle);
      return () => {
        clearInterval(handle);
        handles.delete(handle);
      };
    },
    dispose() {
      for (const handle of handles) clearInterval(handle);
      handles.clear();
    },
  };
}

const WORKER_SOURCE = `
const timers = new Map();
self.onmessage = (event) => {
  const { id, intervalMs, cancel } = event.data;
  if (cancel) {
    const handle = timers.get(id);
    if (handle !== undefined) { clearInterval(handle); timers.delete(id); }
    return;
  }
  timers.set(id, setInterval(() => self.postMessage({ id }), intervalMs));
};
`;

/**
 * A ticker whose intervals run inside an inline dedicated Web Worker —
 * exempt from background-tab timer throttling, so a hidden tab keeps
 * sending presence at full rate. Falls back to {@link intervalTicker} in
 * runtimes without `Worker`/`Blob` support (Node, SSR).
 */
export function workerTicker(): Ticker {
  const g = globalThis as {
    Worker?: new (url: string | URL) => Worker;
    Blob?: typeof Blob;
    URL?: typeof URL;
  };
  if (!g.Worker || !g.Blob || !g.URL?.createObjectURL) {
    return intervalTicker();
  }

  const url = g.URL.createObjectURL(
    new g.Blob([WORKER_SOURCE], { type: 'application/javascript' }),
  );
  let worker: Worker | null;
  try {
    worker = new g.Worker(url);
  } catch {
    g.URL.revokeObjectURL(url);
    return intervalTicker();
  }

  const callbacks = new Map<number, () => void>();
  let nextId = 1;
  worker.onmessage = (event: MessageEvent<{ id: number }>) => {
    callbacks.get(event.data.id)?.();
  };

  return {
    every(intervalMs, callback) {
      if (!worker) return () => {};
      const id = nextId++;
      callbacks.set(id, callback);
      worker.postMessage({ id, intervalMs });
      return () => {
        callbacks.delete(id);
        worker?.postMessage({ id, cancel: true });
      };
    },
    dispose() {
      callbacks.clear();
      worker?.terminate();
      worker = null;
      g.URL?.revokeObjectURL(url);
    },
  };
}

/** A {@link manualTicker}: time only moves when the test calls `advance`. */
export interface ManualTicker extends Ticker {
  /** Advance virtual time, firing due callbacks (repeatedly, in due order). */
  advance(ms: number): void;
  /** The current virtual time in ms. */
  readonly now: number;
}

/** Deterministic ticker for tests — no real timers. */
export function manualTicker(): ManualTicker {
  interface Task {
    intervalMs: number;
    callback: () => void;
    nextAt: number;
  }
  const tasks = new Set<Task>();
  let now = 0;

  return {
    get now() {
      return now;
    },
    every(intervalMs, callback) {
      const task: Task = { intervalMs, callback, nextAt: now + intervalMs };
      tasks.add(task);
      return () => tasks.delete(task);
    },
    advance(ms) {
      const end = now + ms;
      // Fire tasks in due order until none are due before `end`.
      for (;;) {
        let next: Task | null = null;
        for (const task of tasks) {
          if (task.nextAt <= end && (next === null || task.nextAt < next.nextAt)) {
            next = task;
          }
        }
        if (!next) break;
        now = next.nextAt;
        next.nextAt += next.intervalMs;
        next.callback();
      }
      now = end;
    },
    dispose() {
      tasks.clear();
    },
  };
}
