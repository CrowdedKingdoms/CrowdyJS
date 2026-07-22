import type { PlayerComputeAPI } from '../domains/playerCompute.js';
import type { PlayerWalletAPI } from '../domains/playerWallet.js';
import {
  PlayerCodeBroker,
  type PlayerCodeBrokerOptions,
  type PlayerCodeGridBounds,
} from '../player-runtime/player-code-broker.js';

export type LiveCodingTarget = 'server' | 'client';

export interface LiveCodingStatus {
  phase:
    | 'idle'
    | 'deploying'
    | 'compiling'
    | 'compile_failed'
    | 'enabling'
    | 'running'
    | 'error';
  target: LiveCodingTarget;
  message?: string;
  compileLog?: string | null;
  /** Remaining-budget snapshot from playerComputeUsage, when loaded. */
  usage?: {
    hourUnitsUsed: string;
    unitsPerHour: string | null;
    compilesThisHour: number;
    maxCompilesPerHour: number;
    gateStatus: string;
    gateReason: string | null;
  };
}

export interface LiveCodingControllerOptions {
  playerCompute: Pick<
    PlayerComputeAPI,
    'deploy' | 'setEnabled' | 'usage' | 'runs' | 'logs' | 'versions' | 'artifactBytes'
  >;
  playerWallet?: Pick<PlayerWalletAPI, 'balance'>;
  /** BigInt scalars are strings on the wire (codegen). */
  appId: string;
  gridId: string;
  grid: PlayerCodeGridBounds;
  /** The platform glue worker asset URL for client deploys. */
  workerUrl: string | URL;
  /** Page-side host-call router for the broker (World Stores reads + owner effects). */
  onHostCall: PlayerCodeBrokerOptions['onHostCall'];
  onPresentation?: PlayerCodeBrokerOptions['onPresentation'];
  /** Client tick cadence (ms); the worker self-drives `tick` for HUD-style mods. */
  clientTickIntervalMs?: number;
  onStatus?: (status: LiveCodingStatus) => void;
  /** Poll interval for compile status (ms). */
  pollMs?: number;
  /** Injectable clock/sleep + broker factory for tests. */
  sleep?: (ms: number) => Promise<void>;
  brokerFactory?: (options: PlayerCodeBrokerOptions) => PlayerCodeBroker;
}

/**
 * Headless driver for the live-coding deploy loop (08), shared by the DOM
 * panel and any custom host UI. It owns the edit -> deploy -> compile-poll ->
 * (server) enable / (client) fetch+respawn state machine, surfaces compile
 * feedback and the quota/wallet meters, and manages the client broker
 * lifecycle. All IO is injected so it is unit-testable without a browser.
 */
export class LiveCodingController {
  private broker: PlayerCodeBroker | null = null;
  private status: LiveCodingStatus = { phase: 'idle', target: 'server' };

  constructor(private readonly options: LiveCodingControllerOptions) {}

  getStatus(): LiveCodingStatus {
    return this.status;
  }

  private set(next: Partial<LiveCodingStatus>): void {
    this.status = { ...this.status, ...next };
    this.options.onStatus?.(this.status);
  }

  private sleep(ms: number): Promise<void> {
    return (this.options.sleep ?? ((d) => new Promise((r) => setTimeout(r, d))))(
      ms,
    );
  }

  /** Refresh the quota/wallet meter for the panel. */
  async refreshUsage(): Promise<void> {
    const usage = await this.options.playerCompute.usage({
      appId: this.options.appId,
    });
    this.set({
      usage: {
        hourUnitsUsed: String(usage.hourUnitsUsed),
        unitsPerHour: usage.unitsPerHour != null ? String(usage.unitsPerHour) : null,
        compilesThisHour: usage.compilesThisHour,
        maxCompilesPerHour: usage.maxCompilesPerHour,
        gateStatus: usage.gateStatus,
        gateReason: usage.gateReason ?? null,
      },
    });
  }

  /**
   * Deploy source and run it. For server targets: deploy -> poll compile ->
   * enable. For client targets: deploy -> poll compile -> fetch bytes ->
   * (re)spawn the broker worker. Draft mode suppresses server egress to other
   * sessions while iterating.
   */
  async deploy(input: {
    name: string;
    target: LiveCodingTarget;
    sourceFilesJson: string;
    tickHz?: number;
    draft?: boolean;
  }): Promise<void> {
    const { name, target } = input;
    this.set({ phase: 'deploying', target, message: undefined, compileLog: null });
    let version;
    try {
      version = await this.options.playerCompute.deploy({
        appId: this.options.appId,
        gridId: this.options.gridId,
        name,
        target: target === 'server' ? ('SERVER' as never) : ('CLIENT' as never),
        sourceFilesJson: input.sourceFilesJson,
        tickHz: input.tickHz,
        draft: input.draft,
      });
    } catch (err) {
      // Compile-quota refusals and cap breaches surface here (P2 governor).
      this.set({ phase: 'error', message: (err as Error).message });
      return;
    }

    const compiled = await this.pollCompile(name, version.versionId);
    if (!compiled.ok) {
      this.set({
        phase: 'compile_failed',
        message: 'compile failed',
        compileLog: compiled.log,
      });
      return;
    }

    if (target === 'server') {
      this.set({ phase: 'enabling' });
      await this.options.playerCompute.setEnabled({
        appId: this.options.appId,
        gridId: this.options.gridId,
        name,
        enabled: true,
      });
      this.set({ phase: 'running', message: 'server module live' });
    } else {
      await this.runClient(name);
    }
    await this.refreshUsage().catch(() => {});
  }

  private async pollCompile(
    name: string,
    versionId: string,
  ): Promise<{ ok: boolean; log: string | null }> {
    this.set({ phase: 'compiling' });
    const pollMs = this.options.pollMs ?? 1500;
    for (let i = 0; i < 60; i++) {
      const versions = await this.options.playerCompute.versions({
        appId: this.options.appId,
        gridId: this.options.gridId,
        name,
      });
      const v = versions.find((row) => row.versionId === versionId);
      if (v?.compileStatus === 'succeeded') return { ok: true, log: v.compileLog ?? null };
      if (v?.compileStatus === 'failed') return { ok: false, log: v.compileLog ?? null };
      await this.sleep(pollMs);
    }
    return { ok: false, log: 'compile timed out' };
  }

  private async runClient(name: string): Promise<void> {
    const artifact = await this.options.playerCompute.artifactBytes({
      appId: this.options.appId,
      gridId: this.options.gridId,
      name,
    });
    const options: PlayerCodeBrokerOptions = {
      workerUrl: this.options.workerUrl,
      grid: this.options.grid,
      artifactHash: artifact.artifactHash,
      fuelPerDispatch: artifact.fuelPerDispatch,
      onHostCall: this.options.onHostCall,
      onPresentation: this.options.onPresentation,
      tickIntervalMs: this.options.clientTickIntervalMs ?? 1000,
    };
    const broker =
      this.options.brokerFactory?.(options) ?? new PlayerCodeBroker(options);
    if (this.broker) {
      await broker.start(artifact.bytes);
      this.broker.stop();
      this.broker = broker;
    } else {
      await broker.start(artifact.bytes);
      this.broker = broker;
    }
    this.set({ phase: 'running', message: 'client module live in the sandbox' });
  }

  stop(): void {
    this.broker?.stop();
    this.broker = null;
    this.set({ phase: 'idle' });
  }
}
