import type {
  ExecAPI,
  ExecClientCapabilitySummary,
  ExecGridClientMod,
} from '../domains/exec.js';
import { CrowdyGraphQLError, CrowdyProtocolError } from '../errors.js';
import {
  PlayerCodeBroker,
  type PlayerCodeBrokerOptions,
  type PlayerCodeGridBounds,
  type PlayerCodeHostCall,
  type PlayerCodePresentation,
} from '../player-runtime/player-code-broker.js';

/** The grid a player stands in: its id and chunk box. */
export type ExecClientHalvesGrid = PlayerCodeGridBounds & { gridId: string };

/**
 * One question for the player. `author`: trust every CLIENT half of `authorId` on the grid, at
 * the hash of their union (`exec.trustAuthor`). `mod`: consent to one CLIENT half at its hash
 * (`exec.consentClientMod`).
 */
export interface ExecClientHalfPrompt {
  kind: 'author' | 'mod';
  gridId: string;
  authorId: string;
  /** What a yes consents to: the author's `authorCapabilityHash`, or the mod's `capabilityHash`. */
  capabilityHash: string;
  /** The summary to show: the author's union, or the one CLIENT half's. */
  capabilitySummaryJson: string;
  capabilitySummary: ExecClientCapabilitySummary | null;
  /** The CLIENT halves a yes covers now. */
  mods: readonly ExecGridClientMod[];
}

/**
 * Why a CLIENT half stopped: no longer listed (`removed`), a new digest, capability hash or tick
 * interval (`changed`), listed without the player's consent or trust (`unconsented`), refused by
 * `filter` (`filtered`), the runner left the grid (`left-grid`) or was stopped (`stopped`), or
 * the broker's circuit breaker tripped (`circuit-open`).
 */
export type ExecClientHalfStopReason =
  | 'removed'
  | 'changed'
  | 'unconsented'
  | 'filtered'
  | 'left-grid'
  | 'stopped'
  | 'circuit-open';

/** A consent, fetch or start that failed, and when that CLIENT half is tried again. */
export interface ExecClientHalfError {
  mod: ExecGridClientMod;
  stage: 'consent' | 'fetch' | 'start';
  /**
   * `not-found`: not served to the player now (every refusal of the artifact, and a trust while
   * not standing in the grid); `rate-limited`: 12 fetches a minute per player and mod;
   * `conflict`: the hash moved on; `refused`: the served module was, for bytes that differ from
   * its digest, an unknown CLIENT ABI or a capability summary that does not parse; `failed`:
   * anything else.
   */
  reason: 'not-found' | 'rate-limited' | 'conflict' | 'refused' | 'failed';
  error: unknown;
  /** When the runner fetches or starts it again (epoch ms); absent for a consent. */
  retryAt?: number;
}

/** The part of `PlayerCodeBroker` the runner drives. */
export interface ExecClientHalfBroker {
  start(artifact: ArrayBuffer): Promise<void>;
  stop(): void;
}

export interface ExecClientHalvesOptions {
  exec: Pick<ExecAPI, 'gridClientMods' | 'consentClientMod' | 'trustAuthor' | 'modClientArtifactBytes'>;
  appId: string;
  /** The platform glue worker (`@crowdedkingdoms/crowdyjs/player-glue-worker`), same origin. */
  workerUrl: string | URL;
  /**
   * Answers the host calls a CLIENT half makes that the broker does not answer itself, for
   * example with `createGridHostCalls` over the grid's scope.
   */
  onHostCall: (call: PlayerCodeHostCall, mod: ExecGridClientMod) => Promise<unknown>;
  onPresentation?: (presentation: PlayerCodePresentation, mod: ExecGridClientMod) => void;
  /**
   * Asks the player about CLIENT halves they neither consented to nor trust the author of; true
   * consents. Without it, only what the player already agreed to runs. A declined question is
   * not asked again on this grid until its hash changes.
   */
  confirm?: (prompt: ExecClientHalfPrompt) => boolean | Promise<boolean>;
  /** `author` (the default): one question per author; `mod`: one per CLIENT half. */
  ask?: 'author' | 'mod';
  /** Leaves out the CLIENT halves it returns false for, e.g. the one Crowdy Studio previews. */
  filter?: (mod: ExecGridClientMod) => boolean;
  onStarted?: (mod: ExecGridClientMod) => void;
  onStopped?: (mod: ExecGridClientMod, reason: ExecClientHalfStopReason) => void;
  onError?: (error: ExecClientHalfError) => void;
  /** How long a CLIENT half waits after `NOT_FOUND` before it is fetched again. Default 15 s. */
  notFoundRetryMs?: number;
  /** How long after `RATE_LIMITED`. Default 60 s, the limit's window. */
  rateLimitedRetryMs?: number;
  /** How long after any other failure, refused bytes included. Default 60 s. */
  failedRetryMs?: number;
  /** Modules kept by digest, across grids. Default 16. */
  cacheSize?: number;
  now?: () => number;
  brokerFactory?: (options: PlayerCodeBrokerOptions) => ExecClientHalfBroker;
}

interface RunningHalf {
  mod: ExecGridClientMod;
  broker: ExecClientHalfBroker;
  started: boolean;
}

interface CachedModule {
  bytes: ArrayBuffer;
  fuelPerDispatch: bigint;
  /** The served artifact's own `hostFunctions`; the broker allows only calls also listed. */
  hostFunctions: readonly string[];
}

const identity = (m: ExecGridClientMod) =>
  `${m.modId}\u0000${m.digest}\u0000${m.capabilityHash}\u0000${m.tickIntervalMs}`;

function refusal(error: unknown): ExecClientHalfError['reason'] {
  if (error instanceof CrowdyProtocolError) return 'refused';
  if (error instanceof CrowdyGraphQLError) {
    if (error.code === 'NOT_FOUND') return 'not-found';
    if (error.code === 'RATE_LIMITED') return 'rate-limited';
    if (error.code === 'CONFLICT') return 'conflict';
  }
  return 'failed';
}

/**
 * Runs the CLIENT halves of ck-exec mods that the grid a player stands in serves, the way a game
 * should: tell it the grid ({@link enterGrid}) and call {@link refresh} on a cadence (every 10 s
 * or so). Each refresh lists the grid's CLIENT halves (`exec.gridClientMods`), stops the workers
 * whose mod is gone or whose `modId`, `digest`, `capabilityHash` or tick interval changed, asks
 * the player once per author (or per CLIENT half) about the rest, fetches each consented one
 * (`exec.modClientArtifactBytes`, which refuses bytes that differ from their digest) and runs it
 * in a `PlayerCodeBroker` with `engine: 'ck-exec'`, its fuel budget and tick interval, bounded
 * to the host calls of the capability summary the player consented to.
 *
 * Modules are cached by digest, since a digest never changes its bytes and the artifact query
 * allows 12 fetches a minute per player and mod. A cached module starts without a fetch, so the
 * serve checks that query makes (`run_client_code`, standing in the grid) are those of the fetch
 * that filled the cache; consent and trust are the listing's, on every refresh.
 *
 * `NOT_FOUND` (not served to this player now) and `RATE_LIMITED` hold that CLIENT half back for
 * a while instead of fetching on every refresh. The legacy grid-attached client mods
 * (`marketplace.gridClientMods`) are not this runner's.
 */
export class ExecClientHalves {
  private grid: ExecClientHalvesGrid | null = null;
  private generation = 0;
  private readonly workers = new Map<string, RunningHalf>();
  private readonly cache = new Map<string, CachedModule>();
  private readonly retryAt = new Map<string, number>();
  private readonly declined = new Set<string>();
  private readonly approved = new Set<string>();
  private inFlight: { generation: number; done: Promise<void> } | null = null;

  constructor(private readonly options: ExecClientHalvesOptions) {}

  /** The grid the player stands in, or null. Any change stops every CLIENT half of the old one. */
  enterGrid(grid: ExecClientHalvesGrid | null): void {
    if (sameGrid(this.grid, grid)) return;
    this.stopAll('left-grid');
    this.grid = grid ? { ...grid } : null;
    this.generation++;
    this.declined.clear();
    this.approved.clear();
  }

  /** The CLIENT halves running now. */
  get running(): readonly ExecGridClientMod[] {
    return [...this.workers.values()].filter((w) => w.started).map((w) => w.mod);
  }

  /**
   * One reconcile of the current grid; a call while one runs for the same grid joins it. Rejects
   * when the grid's CLIENT halves cannot be listed, and what runs keeps running.
   */
  refresh(): Promise<void> {
    if (this.inFlight?.generation === this.generation) return this.inFlight.done;
    const generation = this.generation;
    const done = this.reconcile(generation).finally(() => {
      if (this.inFlight?.done === done) this.inFlight = null;
    });
    this.inFlight = { generation, done };
    return done;
  }

  /** Stops every CLIENT half and leaves the grid; the module cache stays. */
  stop(): void {
    this.stopAll('stopped');
    this.grid = null;
    this.generation++;
    this.declined.clear();
    this.approved.clear();
  }

  private async reconcile(generation: number): Promise<void> {
    const grid = this.grid;
    if (!grid) return;
    const { exec, appId } = this.options;
    const current = () => generation === this.generation;
    let listed = await exec.gridClientMods(appId, grid.gridId);
    if (!current()) return;
    this.stopStale(listed);
    if (await this.askAbout(listed, grid, current)) {
      if (!current()) return;
      listed = await exec.gridClientMods(appId, grid.gridId);
      if (!current()) return;
      this.stopStale(listed);
    }
    for (const mod of listed) {
      if (!current()) return;
      if (!this.wanted(mod) || !(mod.callerConsented || mod.callerTrustsAuthor)) continue;
      if (this.workers.has(mod.modId)) continue;
      if ((this.retryAt.get(identity(mod)) ?? 0) > this.now()) continue;
      await this.start(mod, grid, current);
    }
  }

  private stopStale(listed: readonly ExecGridClientMod[]): void {
    const byId = new Map(listed.map((m) => [m.modId, m]));
    for (const [modId, worker] of [...this.workers]) {
      const next = byId.get(modId);
      const reason: ExecClientHalfStopReason | null = !next
        ? 'removed'
        : identity(next) !== identity(worker.mod)
          ? 'changed'
          : !this.wanted(next)
            ? 'filtered'
            : !(next.callerConsented || next.callerTrustsAuthor)
              ? 'unconsented'
              : null;
      if (reason) this.stopWorker(modId, reason);
    }
  }

  /** Asks about what the player has not agreed to; true when a consent or trust went through. */
  private async askAbout(
    listed: readonly ExecGridClientMod[],
    grid: ExecClientHalvesGrid,
    current: () => boolean,
  ): Promise<boolean> {
    const pending = listed.filter(
      (m) => this.wanted(m) && !m.callerConsented && !m.callerTrustsAuthor,
    );
    if (pending.length === 0) return false;
    const prompts: Array<{ key: string; prompt: ExecClientHalfPrompt }> = [];
    if ((this.options.ask ?? 'author') === 'author') {
      for (const authorId of new Set(pending.map((m) => m.authorId))) {
        const theirs = listed.filter((m) => m.authorId === authorId);
        const [first] = theirs;
        prompts.push({
          key: `author\u0000${authorId}\u0000${first.authorCapabilityHash}`,
          prompt: {
            kind: 'author',
            gridId: grid.gridId,
            authorId,
            capabilityHash: first.authorCapabilityHash,
            capabilitySummaryJson: first.authorCapabilitySummaryJson,
            capabilitySummary: first.authorCapabilitySummary,
            mods: theirs,
          },
        });
      }
    } else {
      for (const mod of pending) {
        prompts.push({
          key: `mod\u0000${mod.modId}\u0000${mod.capabilityHash}`,
          prompt: {
            kind: 'mod',
            gridId: grid.gridId,
            authorId: mod.authorId,
            capabilityHash: mod.capabilityHash,
            capabilitySummaryJson: mod.capabilitySummaryJson,
            capabilitySummary: mod.capabilitySummary,
            mods: [mod],
          },
        });
      }
    }
    let agreed = false;
    for (const { key, prompt } of prompts) {
      if (!current()) return agreed;
      if (this.declined.has(key)) continue;
      if (!this.approved.has(key)) {
        if (!this.options.confirm) continue;
        const yes = await this.options.confirm(prompt);
        if (!current()) return agreed;
        if (!yes) {
          this.declined.add(key);
          continue;
        }
        // Kept until it goes through: a trust refused while the player's presence is not yet
        // registered is retried on the next refresh without asking again.
        this.approved.add(key);
      }
      try {
        const { exec, appId } = this.options;
        if (prompt.kind === 'author') {
          await exec.trustAuthor(appId, grid.gridId, prompt.authorId, prompt.capabilityHash);
        } else {
          await exec.consentClientMod(appId, prompt.mods[0].modId, prompt.capabilityHash);
        }
        this.approved.delete(key);
        agreed = true;
      } catch (error) {
        const reason = refusal(error);
        // The hash moved on: the next listing brings the new one, and a new question.
        if (reason === 'conflict') this.approved.delete(key);
        this.options.onError?.({ mod: prompt.mods[0], stage: 'consent', reason, error });
      }
    }
    return agreed;
  }

  private async start(
    mod: ExecGridClientMod,
    grid: ExecClientHalvesGrid,
    current: () => boolean,
  ): Promise<void> {
    // What the player consented to, and what the served artifact itself lists, bound the
    // module's host calls in the broker.
    const consented = mod.capabilitySummary?.hostFunctions;
    if (!Array.isArray(consented)) {
      this.fail(
        mod,
        'start',
        new CrowdyProtocolError({
          message: `CLIENT half of mod ${mod.modId}: its capability summary does not parse`,
        }),
      );
      return;
    }
    let module = this.cache.get(mod.digest);
    if (module) {
      this.cache.delete(mod.digest);
      this.cache.set(mod.digest, module);
    } else {
      try {
        const a = await this.options.exec.modClientArtifactBytes(this.options.appId, mod.modId);
        module = {
          bytes: a.bytes,
          fuelPerDispatch: a.fuelPerDispatch,
          hostFunctions: a.capabilitySummary.hostFunctions,
        };
        this.remember(a.digest, module);
        if (!current()) return;
        // Changed between the listing and the fetch: the next listing starts the new one.
        if (
          a.digest !== mod.digest ||
          a.capabilityHash !== mod.capabilityHash ||
          a.tickIntervalMs !== mod.tickIntervalMs
        ) {
          return;
        }
      } catch (error) {
        if (!current()) return;
        this.fail(mod, 'fetch', error);
        return;
      }
    }
    const served = module.hostFunctions;
    const broker: ExecClientHalfBroker = (
      this.options.brokerFactory ?? ((o) => new PlayerCodeBroker(o))
    )({
      engine: 'ck-exec',
      workerUrl: this.options.workerUrl,
      grid: { low: grid.low, high: grid.high, gridId: grid.gridId },
      moduleName: mod.name,
      artifactHash: mod.digest,
      fuelPerDispatch: module.fuelPerDispatch,
      tickIntervalMs: mod.tickIntervalMs,
      consentedHostCalls: consented.filter((fn) => served.includes(fn)),
      onHostCall: (call) => this.options.onHostCall(call, mod),
      onPresentation: (presentation) => this.options.onPresentation?.(presentation, mod),
      onCircuitOpen: () => {
        if (this.workers.get(mod.modId)?.broker !== broker) return;
        this.retryAt.set(identity(mod), this.now() + (this.options.failedRetryMs ?? 60_000));
        this.stopWorker(mod.modId, 'circuit-open');
      },
    });
    const worker: RunningHalf = { mod, broker, started: false };
    this.workers.set(mod.modId, worker);
    try {
      await broker.start(module.bytes);
    } catch (error) {
      if (this.workers.get(mod.modId) !== worker) return;
      this.workers.delete(mod.modId);
      broker.stop();
      if (current()) this.fail(mod, 'start', error);
      return;
    }
    if (this.workers.get(mod.modId) !== worker) return;
    worker.started = true;
    this.options.onStarted?.(mod);
  }

  private fail(mod: ExecGridClientMod, stage: 'fetch' | 'start', error: unknown): void {
    const reason = refusal(error);
    const wait =
      reason === 'not-found'
        ? (this.options.notFoundRetryMs ?? 15_000)
        : reason === 'rate-limited'
          ? (this.options.rateLimitedRetryMs ?? 60_000)
          : (this.options.failedRetryMs ?? 60_000);
    const retryAt = this.now() + wait;
    this.retryAt.set(identity(mod), retryAt);
    this.options.onError?.({ mod, stage, reason, error, retryAt });
  }

  private remember(digest: string, module: CachedModule): void {
    this.cache.set(digest, module);
    const limit = Math.max(1, this.options.cacheSize ?? 16);
    for (const oldest of this.cache.keys()) {
      if (this.cache.size <= limit) break;
      this.cache.delete(oldest);
    }
  }

  private wanted(mod: ExecGridClientMod): boolean {
    return this.options.filter ? this.options.filter(mod) : true;
  }

  private stopWorker(modId: string, reason: ExecClientHalfStopReason): void {
    const worker = this.workers.get(modId);
    if (!worker) return;
    this.workers.delete(modId);
    worker.broker.stop();
    if (worker.started) this.options.onStopped?.(worker.mod, reason);
  }

  private stopAll(reason: ExecClientHalfStopReason): void {
    for (const modId of [...this.workers.keys()]) this.stopWorker(modId, reason);
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}

function sameGrid(a: ExecClientHalvesGrid | null, b: ExecClientHalvesGrid | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.gridId === b.gridId &&
    a.low.x === b.low.x &&
    a.low.y === b.low.y &&
    a.low.z === b.low.z &&
    a.high.x === b.high.x &&
    a.high.y === b.high.y &&
    a.high.z === b.high.z
  );
}
