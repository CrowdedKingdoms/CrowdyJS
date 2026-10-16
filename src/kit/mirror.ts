import type { ExecPush } from '../domains/exec.js';
import {
  KIT_SNAPSHOT_METHOD,
  KitError,
  splitKitMessage,
  type KitChanged,
  type KitContainer,
  type KitDelta,
  type KitHeader,
} from './protocol.js';
import type { KitRuntime } from './runtime.js';
import type { KitStore } from './store.js';

type Parsed = { header: KitHeader; body: Record<string, unknown> };

/**
 * A hub topic mirrored on the client: it subscribes, asks the hub for a snapshot, then applies
 * what arrives after the snapshot's `seq`. It asks again when the publishing instance's
 * `epoch` changes, when a delta topic skips a `seq`, and after the connection reconnects.
 */
export abstract class TopicMirror<S> implements KitStore<S | undefined> {
  private state: S | undefined;
  private epoch = -1;
  private seq = 0;
  private buffer: Parsed[] | null = null;
  private syncing: Promise<S> | null = null;
  private stopSub: (() => Promise<void>) | null = null;
  private offReconnect: (() => void) | null = null;
  private readonly listeners = new Set<(value: S | undefined) => void>();
  private readonly eventListeners = new Set<(body: Record<string, unknown>, header: KitHeader) => void>();
  private readonly changedListeners = new Set<(changed: KitChanged, header: KitHeader) => void>();
  private watching: Promise<S> | null = null;

  constructor(
    protected readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
    readonly topic: string,
  ) {}

  /** The state a snapshot's body stands for. */
  protected abstract fromSnapshot(body: Record<string, unknown>): S;
  /** The state after one delta, or null when a delta is not this topic's (resync). */
  protected abstract applyDelta(state: S, delta: KitDelta): S | null;
  /** Whether a skipped `seq` loses state (a delta topic) or not (snapshot topics). */
  protected abstract readonly gapsLoseState: boolean;

  /** Subscribes and takes the first snapshot; resolves with the state. Idempotent. */
  start(): Promise<S> {
    if (!this.watching) {
      this.watching = (async () => {
        this.offReconnect = this.runtime.onReconnect(() => void this.resync().catch(() => undefined));
        this.stopSub = await this.runtime.subscribe(this.nodeType, this.key, this.topic, (p) => this.onPush(p));
        return this.resync();
      })().catch((e) => {
        this.watching = null;
        throw e;
      });
    }
    return this.watching;
  }

  /** Stops the subscription; the last state stays readable. */
  async stop(): Promise<void> {
    this.offReconnect?.();
    this.offReconnect = null;
    const stop = this.stopSub;
    this.stopSub = null;
    this.watching = null;
    await stop?.();
  }

  /** Takes a fresh snapshot (shared by concurrent callers). */
  resync(): Promise<S> {
    if (!this.syncing) {
      this.buffer = [];
      this.syncing = (async () => {
        try {
          const reply = await this.runtime.call(this.nodeType, this.key, KIT_SNAPSHOT_METHOD, { topic: this.topic });
          const msg = splitKitMessage(reply);
          if (!msg) throw new KitError('bad_request', `${this.nodeType} answered snapshot with something other than a kit message`);
          this.epoch = msg.header.epoch;
          this.seq = msg.header.seq;
          this.state = this.fromSnapshot(msg.body);
          const pending = this.buffer ?? [];
          this.buffer = null;
          this.syncing = null;
          for (const m of pending.sort((a, b) => a.header.seq - b.header.seq)) this.apply(m);
          this.emit();
          return this.state as S;
        } catch (e) {
          this.buffer = null;
          this.syncing = null;
          throw e;
        }
      })();
    }
    return this.syncing;
  }

  get(): S | undefined {
    return this.state;
  }

  subscribe(listener: (value: S | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** `event` messages on the topic. */
  onEvent(listener: (body: Record<string, unknown>, header: KitHeader) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** `changed` messages on the topic: someone's private state to read again. */
  onChanged(listener: (changed: KitChanged, header: KitHeader) => void): () => void {
    this.changedListeners.add(listener);
    return () => this.changedListeners.delete(listener);
  }

  /** The epoch and seq the mirror is at; `-1` before its first snapshot. */
  get position(): { epoch: number; seq: number } {
    return { epoch: this.epoch, seq: this.seq };
  }

  private emit(): void {
    for (const l of [...this.listeners]) {
      try {
        l(this.state);
      } catch {
        /* a listener's exception is its own */
      }
    }
  }

  private onPush(push: ExecPush): void {
    const msg = splitKitMessage(push.value);
    if (!msg) return;
    if (this.buffer) {
      this.buffer.push(msg);
      return;
    }
    this.apply(msg);
  }

  private apply({ header, body }: Parsed): void {
    if (header.epoch !== this.epoch) {
      if (header.kind === 'snapshot') {
        this.epoch = header.epoch;
        this.seq = header.seq;
        this.state = this.fromSnapshot(body);
        this.emit();
      } else {
        void this.resync().catch(() => undefined);
      }
      return;
    }
    if (header.seq <= this.seq) return;
    const gap = header.seq !== this.seq + 1;
    this.seq = header.seq;
    switch (header.kind) {
      case 'snapshot':
        this.state = this.fromSnapshot(body);
        this.emit();
        return;
      case 'delta': {
        const next = gap || this.state === undefined ? null : this.applyDelta(this.state, body as unknown as KitDelta);
        if (next === null) {
          void this.resync().catch(() => undefined);
          return;
        }
        this.state = next;
        this.emit();
        return;
      }
      case 'changed':
        for (const l of [...this.changedListeners]) l(body as unknown as KitChanged, header);
        break;
      case 'event':
        for (const l of [...this.eventListeners]) l(body, header);
        break;
    }
    if (gap && this.gapsLoseState) void this.resync().catch(() => undefined);
  }
}

/** A topic whose messages are its hub's whole public state (`snapshot` messages). */
export class HubState<T = Record<string, unknown>> extends TopicMirror<T> {
  protected readonly gapsLoseState = false;

  protected fromSnapshot(body: Record<string, unknown>): T {
    return body as T;
  }

  protected applyDelta(): T | null {
    return null;
  }
}

/** A collection's members by id: what a model topic's snapshot and deltas describe. */
export type KitCollection = ReadonlyMap<number, KitContainer>;

/**
 * A topic carrying a collection (`delta` per member; the snapshot's `containers`): the
 * starters' model topics, such as an area's mobs, NPCs and pets.
 */
export class CollectionMirror extends TopicMirror<KitCollection> {
  protected readonly gapsLoseState = true;

  protected fromSnapshot(body: Record<string, unknown>): KitCollection {
    const out = new Map<number, KitContainer>();
    for (const c of (body.containers as KitDelta[] | undefined) ?? []) {
      if (!c.removed) out.set(c.id, { id: c.id, type_name: c.type_name ?? '', props: c.props ?? {} });
    }
    return out;
  }

  protected applyDelta(state: KitCollection, d: KitDelta): KitCollection | null {
    if (typeof d.id !== 'number') return null;
    const next = new Map(state);
    if (d.removed) {
      next.delete(d.id);
    } else {
      next.set(d.id, { id: d.id, type_name: d.type_name ?? state.get(d.id)?.type_name ?? '', props: d.props ?? {} });
    }
    return next;
  }

  /** The members, oldest first, of one type or all. */
  list(typeName?: string): KitContainer[] {
    const all = [...(this.get()?.values() ?? [])].sort((a, b) => a.id - b.id);
    return typeName ? all.filter((c) => c.type_name === typeName) : all;
  }

  /** One member by id. */
  member(id: number): KitContainer | undefined {
    return this.get()?.get(id);
  }
}

/** How a {@link PrivateState} reads its value and hears that it changed. */
export interface PrivateStateSource<T> {
  nodeType: string;
  key: string;
  /** The topic whose `changed` messages name this player. */
  topic: string;
  /** The `what` (or whats) that concern this value. */
  what: string | readonly string[];
  /** Reads the value with a call the hub answers for its caller alone. */
  read: () => Promise<T>;
}

/**
 * State only its player may read (a hand of cards, an inventory, a pet's bond): read with a
 * caller-scoped call, read again when the hub's `changed` message names this player, and after
 * a reconnect. Nothing private is ever on a topic.
 */
export class PrivateState<T> implements KitStore<T | undefined> {
  private value: T | undefined;
  private reading: Promise<T> | null = null;
  private again = false;
  private stopSub: (() => Promise<void>) | null = null;
  private offReconnect: (() => void) | null = null;
  private readonly listeners = new Set<(value: T | undefined) => void>();
  private readonly whats: ReadonlySet<string>;
  private watching: Promise<T> | null = null;

  constructor(
    private readonly runtime: KitRuntime,
    private readonly source: PrivateStateSource<T>,
  ) {
    this.whats = new Set(typeof source.what === 'string' ? [source.what] : source.what);
  }

  /** Subscribes and reads the first value. Idempotent. */
  start(): Promise<T> {
    if (!this.watching) {
      this.watching = (async () => {
        this.offReconnect = this.runtime.onReconnect(() => void this.refresh().catch(() => undefined));
        this.stopSub = await this.runtime.subscribe(this.source.nodeType, this.source.key, this.source.topic, (p) =>
          this.onPush(p),
        );
        return this.refresh();
      })().catch((e) => {
        this.watching = null;
        throw e;
      });
    }
    return this.watching;
  }

  async stop(): Promise<void> {
    this.offReconnect?.();
    this.offReconnect = null;
    const stop = this.stopSub;
    this.stopSub = null;
    this.watching = null;
    await stop?.();
  }

  /** Reads the value again (one read at a time; a request during one runs after it). */
  refresh(): Promise<T> {
    if (this.reading) {
      this.again = true;
      return this.reading;
    }
    this.reading = (async () => {
      try {
        let v: T;
        do {
          this.again = false;
          v = await this.source.read();
        } while (this.again);
        this.value = v;
        for (const l of [...this.listeners]) l(v);
        return v;
      } finally {
        this.reading = null;
      }
    })();
    return this.reading;
  }

  get(): T | undefined {
    return this.value;
  }

  subscribe(listener: (value: T | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private onPush(push: ExecPush): void {
    const msg = splitKitMessage<KitChanged>(push.value);
    if (!msg || msg.header.kind !== 'changed' || !this.whats.has(msg.body.what)) return;
    const who = Array.isArray(msg.body.who) ? msg.body.who.map(String) : [];
    void this.runtime.playerId().then((me) => {
      if (me === null || who.includes(me)) void this.refresh().catch(() => undefined);
    });
  }
}
