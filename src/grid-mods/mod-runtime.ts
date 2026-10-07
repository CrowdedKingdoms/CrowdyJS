import {
  PlayerCodeBroker,
  type PlayerCodeEngine,
  type PlayerCodeLogLine,
  type PlayerCodePresentation,
} from '../player-runtime/player-code-broker.js';
import { hostGridProgram, type GridProgramHost } from '../grid-program/host.js';
import type { GridProgramPort } from '../grid-program/protocol.js';
import type { GridScope } from '../grid-scope.js';
import {
  createGridHostCalls,
  type GridHostCallsOptions,
  type GridHostLocal,
} from './grid-host-calls.js';

/**
 * A ck-exec mod's CLIENT half: platform-built WASM run in the tokenless glue worker, with the
 * `digest` (as `artifactHash`), `fuelPerDispatch`, `tickIntervalMs` and summary host calls of
 * `exec.modClientArtifactBytes` (`ExecClientHalves` runs a whole grid's).
 */
export interface WasmGridModSpec {
  kind: 'wasm';
  moduleName: string;
  artifact: ArrayBuffer;
  artifactHash: string;
  fuelPerDispatch: bigint;
  tickIntervalMs?: number;
  /** `'ck-exec'`, the only engine. */
  engine?: PlayerCodeEngine;
  /** The CLIENT half's `capabilitySummary.hostFunctions` the player consented to. */
  consentedHostCalls: readonly string[];
  /** The platform glue worker URL (`@crowdedkingdoms/crowdyjs/player-glue-worker`). */
  workerUrl: string | URL;
}

/** A JS grid program: player code on the far side of a MessagePort. */
export interface ProgramGridModSpec {
  kind: 'program';
  moduleName: string;
  /** The page's end of the channel whose other end the sandbox holds. */
  port: GridProgramPort;
  ttlSeconds?: number;
}

export type GridModSpec = WasmGridModSpec | ProgramGridModSpec;

export interface StartGridModOptions {
  spec: GridModSpec;
  /** The grid, with its box (`client.grid(...)` after `mintToken()`, or passed in). */
  scope: GridScope;
  /** The page's CrowdyJS client (holds the player's app token). */
  client: GridHostCallsOptions['client'];
  /** ck-api endpoints, for grid programs. */
  graphqlUrl?: string;
  graphqlWsUrl?: string;
  local?: GridHostLocal;
  /** Forwarded to `createGridHostCalls`: the visiting player, for `grid_permission_check`. */
  userId?: string;
  onPresentation?: (presentation: PlayerCodePresentation) => void;
  /** A CLIENT half's `crowdy::log` lines, bounded by the broker. Render them as text. */
  onLog?: (line: PlayerCodeLogLine) => void;
  onStopped?: (reason: string) => void;
}

export interface RunningGridMod {
  kind: GridModSpec['kind'];
  moduleName: string;
  stop(): void;
  /** A CLIENT half's `handle_invoke` (`PlayerCodeBroker.invoke`); absent for a grid program. */
  invoke?(payload: Uint8Array, options?: { timeoutMs?: number }): Promise<Uint8Array>;
}

/**
 * One way to run player code inside a grid, whatever it is written in (DN-10
 * §4-5). A ck-exec CLIENT half gets the host calls it was consented through
 * {@link createGridHostCalls}; JS grid programs get real CrowdyJS through a
 * grid-token relay. Both are confined to `scope`'s grid, locally for UX and by
 * the server for authority.
 */
export async function startGridMod(
  options: StartGridModOptions,
): Promise<RunningGridMod> {
  const { spec, scope } = options;
  if (!scope.bounds) await scope.mintToken();
  const box = scope.bounds!;
  if (spec.kind === 'wasm') {
    const broker = new PlayerCodeBroker({
      engine: spec.engine,
      consentedHostCalls: spec.consentedHostCalls,
      workerUrl: spec.workerUrl,
      grid: { low: box.low, high: box.high, gridId: scope.gridId },
      moduleName: spec.moduleName,
      artifactHash: spec.artifactHash,
      fuelPerDispatch: spec.fuelPerDispatch,
      tickIntervalMs: spec.tickIntervalMs,
      onHostCall: createGridHostCalls({
        scope,
        client: options.client,
        local: options.local,
        ...(options.userId !== undefined ? { userId: options.userId } : {}),
      }),
      onPresentation: options.onPresentation,
      onLog: options.onLog,
      onCircuitOpen: (reason) => options.onStopped?.(reason),
    });
    await broker.start(spec.artifact);
    return {
      kind: 'wasm',
      moduleName: spec.moduleName,
      stop: () => broker.stop(),
      invoke: (payload, invokeOptions) => broker.invoke(payload, invokeOptions),
    };
  }
  if (!options.graphqlUrl || !options.graphqlWsUrl) {
    throw new Error('a grid program needs graphqlUrl and graphqlWsUrl');
  }
  const host: GridProgramHost = await hostGridProgram({
    port: spec.port,
    scope,
    graphqlUrl: options.graphqlUrl,
    graphqlWsUrl: options.graphqlWsUrl,
    ttlSeconds: spec.ttlSeconds,
  });
  return {
    kind: 'program',
    moduleName: spec.moduleName,
    stop: () => host.stop(),
  };
}
