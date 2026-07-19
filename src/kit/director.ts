import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';

/** Options for {@link DirectorKit}. */
export interface DirectorKitOptions {
  /** The director module name. Defaults to `'director'`. */
  moduleName?: string;
  /** The encounter-definition container type. Defaults to `'EncounterDef'`. */
  defTypeName?: string;
}

/** One wave of an encounter definition. */
export interface KitWaveSpec {
  units: Array<{ mobId: string; count: number }>;
  delayMs?: number;
  /** Boss wave: hp + phase thresholds (descending hp percentages). */
  boss?: { hp: number; phases?: number[] };
}

/** A director run's state. */
export interface KitDirectorRun {
  runId: string;
  encounterId: string;
  players: number;
  phase: Record<string, unknown>;
  pending: number;
  wavesCleared: number;
  wavesTotal: number;
  boss: { hp: number; maxHp: number; phase: number; thresholds: number[] } | null;
  finished: boolean;
  outcome: string;
}

function toRun(body: Record<string, unknown>): KitDirectorRun {
  const boss = body.boss as Record<string, unknown> | null;
  return {
    runId: String(body.runId ?? ''),
    encounterId: String(body.encounterId ?? ''),
    players: Number(body.players ?? 1),
    phase: (body.phase as Record<string, unknown>) ?? {},
    pending: Number(body.pending ?? 0),
    wavesCleared: Number(body.wavesCleared ?? 0),
    wavesTotal: Number(body.wavesTotal ?? 0),
    boss: boss
      ? {
          hp: Number(boss.hp ?? 0),
          maxHp: Number(boss.maxHp ?? 0),
          phase: Number(boss.phase ?? 0),
          thresholds: Array.isArray(boss.thresholds) ? (boss.thresholds as unknown[]).map(Number) : [],
        }
      : null,
    finished: body.finished === true,
    outcome: String(body.outcome ?? ''),
  };
}

/**
 * Runtime helpers for the director engine (Wave 2): data-driven encounter
 * direction — wave schedules, spawn budgets, boss phases, party scaling.
 * The director emits `director_spawn` compute events; the mob layer
 * simulates and reports kills back.
 *
 * Obtained via `client.kit(appId).director`.
 */
export class DirectorKit {
  private readonly moduleName: string;
  private readonly defTypeName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly engines: EngineDetector,
    options: DirectorKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'director';
    this.defTypeName = options.defTypeName ?? 'EncounterDef';
  }

  /** Is the director deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /** STUDIO (admin) — create an encounter definition container. */
  async defineEncounter(input: {
    encounterId: string;
    displayName?: string;
    waves: KitWaveSpec[];
    spawnBudget?: number;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.defTypeName,
      displayName: input.displayName ?? `Encounter ${input.encounterId}`,
      properties: [
        { key: 'encounter_id', valueType: 'string', valueJson: JSON.stringify(input.encounterId) },
        { key: 'waves', valueType: 'string', valueJson: JSON.stringify(JSON.stringify(input.waves)) },
        ...(input.spawnBudget !== undefined
          ? [{ key: 'spawn_budget', valueType: 'int', valueJson: String(input.spawnBudget) }]
          : []),
      ],
    });
  }

  /** Start a run (party size scales unit counts server-side). */
  async startRun(encounterId: string, players = 1): Promise<KitDirectorRun> {
    return toRun(await this.invoke('start_run', { encounterId, players }));
  }

  /** Report kills toward the live wave (trusted callers/engines). */
  async reportKill(runId: string, count = 1): Promise<KitDirectorRun> {
    return toRun(await this.invoke('report_kill', { runId, count }));
  }

  /** Report boss hp; phase transitions announce on the compute bus. */
  async reportBossHp(runId: string, hp: number): Promise<KitDirectorRun> {
    return toRun(await this.invoke('report_boss_hp', { runId, hp }));
  }

  /** Force-clear the live wave (run creator only). */
  async skipWave(runId: string): Promise<KitDirectorRun> {
    return toRun(await this.invoke('skip_wave', { runId }));
  }

  /** One run's state (or engine totals without an id). */
  async runState(runId?: string): Promise<KitDirectorRun | Record<string, unknown>> {
    const body = await this.invoke('run_state', runId ? { runId } : {});
    return runId ? toRun(body) : body;
  }

  private async invoke(exportName: string, params: Record<string, unknown>) {
    const result = await this.engines.invoke(this.moduleName, exportName, params);
    if (!result.success) {
      throw new Error(`director.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }
}
