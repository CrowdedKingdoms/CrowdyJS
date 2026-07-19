import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector, EngineInvokeResult } from './engine.js';

/** Options for {@link MinigamesKit}. */
export interface MinigamesKitOptions {
  /** Default module when calls omit one (e.g. your scaffolded game). */
  defaultModuleName?: string;
}

/**
 * A thin invoke wrapper for invoke-loop minigames (the Wave 2 `minigame`
 * scaffold pattern): synchronous `play` RPCs with server-bound caller
 * identity, server-held secrets, and per-caller records. Every method
 * resolves the engine envelope — denials come back as
 * `{success: false, reason}` rather than throwing.
 *
 * Obtained via `client.kit(appId).minigames`.
 */
export class MinigamesKit {
  private readonly defaultModuleName?: string;

  constructor(
    _appId: Scalars['BigInt']['input'],
    private readonly engines: EngineDetector,
    options: MinigamesKitOptions = {},
  ) {
    this.defaultModuleName = options.defaultModuleName;
  }

  /** Is a minigame module deployed + enabled (cached per session)? */
  engineAvailable(moduleName?: string): Promise<boolean> {
    const name = moduleName ?? this.defaultModuleName;
    if (!name) return Promise.resolve(false);
    return this.engines.has(name);
  }

  /** One round: invoke the game's `play` export with your move. */
  async play(
    params: Record<string, unknown>,
    moduleName?: string,
  ): Promise<EngineInvokeResult> {
    return this.invoke('play', params, moduleName);
  }

  /** Your per-caller record. */
  async record(moduleName?: string): Promise<EngineInvokeResult> {
    return this.invoke('record', {}, moduleName);
  }

  /** Any other export the game defines (typed result envelope). */
  async invoke(
    exportName: string,
    params: Record<string, unknown> = {},
    moduleName?: string,
  ): Promise<EngineInvokeResult> {
    const name = moduleName ?? this.defaultModuleName;
    if (!name) {
      return { success: false, reason: 'no minigame module configured', body: {} };
    }
    return this.engines.invoke(name, exportName, params);
  }
}
