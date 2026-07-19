import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';
import { parseRaceTimingEvent, type RaceTimingEvent } from './wire.js';

/** Options for {@link RacingKit}. */
export interface RacingKitOptions {
  /** The racing engine module name. Defaults to `'racing'`. */
  moduleName?: string;
  /** The possession (ball) engine module name. Defaults to `'possession'`. */
  possessionModuleName?: string;
  /** The course container type. Defaults to `'Course'`. */
  courseTypeName?: string;
}

/** Your live run as the engine reports it. */
export interface KitRaceRun {
  courseId: string;
  started: boolean;
  lap: number;
  nextGate: number;
  splitsMs: number[];
  bestLapMs: number;
  finished: boolean;
  totalMs: number;
}

/**
 * Runtime helpers for the racing engine (Wave 3, G16) and its possession
 * sub-template (G17 sports-lite): server-timed gates/laps from the pose
 * stream (type-97 events), course records with ghost replays on the actor
 * lane (suffix `ghost:<courseId>`, FLAG_RESERVED3), and the authoritative
 * ball (claim/steal/pass/shoot; lane suffix `ball`).
 *
 * Obtained via `client.kit(appId).racing`.
 */
export class RacingKit {
  private readonly moduleName: string;
  private readonly possessionModuleName: string;
  private readonly courseTypeName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly engines: EngineDetector,
    options: RacingKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'racing';
    this.possessionModuleName = options.possessionModuleName ?? 'possession';
    this.courseTypeName = options.courseTypeName ?? 'Course';
  }

  /** Is the racing engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /** Is the possession (ball) engine deployed + enabled? */
  possessionAvailable(): Promise<boolean> {
    return this.engines.has(this.possessionModuleName);
  }

  /** STUDIO (admin) — create a course (`gates` = [[x, z, radius], ...]). */
  async defineCourse(input: {
    courseId: string;
    gates: Array<[number, number, number]>;
    laps?: number;
    displayName?: string;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.courseTypeName,
      displayName: input.displayName ?? `course-${input.courseId}`,
      properties: [
        { key: 'course_id', valueType: 'string', valueJson: JSON.stringify(input.courseId) },
        { key: 'gates', valueType: 'string', valueJson: JSON.stringify(JSON.stringify(input.gates)) },
        { key: 'laps', valueType: 'int', valueJson: String(input.laps ?? 1) },
      ],
    });
  }

  /** Enter a course: your next pose through gate 0 starts the clock. */
  async enter(courseId: string) {
    return this.invoke(this.moduleName, 'enter', { courseId });
  }

  /** Your live run (splits, lap, next gate). */
  async raceStatus(): Promise<KitRaceRun> {
    const body = await this.invoke(this.moduleName, 'race_status', {});
    return {
      courseId: String(body.courseId ?? ''),
      started: body.started === true,
      lap: Number(body.lap ?? 0),
      nextGate: Number(body.nextGate ?? 0),
      splitsMs: Array.isArray(body.splitsMs) ? (body.splitsMs as unknown[]).map(Number) : [],
      bestLapMs: Number(body.bestLapMs ?? 0),
      finished: body.finished === true,
      totalMs: Number(body.totalMs ?? 0),
    };
  }

  /** The course record (holder, time, ghost length). */
  async best(courseId: string) {
    return this.invoke(this.moduleName, 'best', { courseId });
  }

  /** Replay the course-record ghost onto the actor lane. */
  async ghostPlay(courseId: string) {
    return this.invoke(this.moduleName, 'ghost_play', { courseId });
  }

  /** Parse a type-97 race-timing server event. */
  parseRaceTiming(bytes: Uint8Array): RaceTimingEvent | null {
    return parseRaceTimingEvent(bytes);
  }

  // -- possession (sports-lite ball) ----------------------------------------

  /** Join the ball match (teams fill by join order). */
  async joinMatch() {
    return this.invoke(this.possessionModuleName, 'join_match', {});
  }

  /** Claim the free ball (or steal after the protection window). */
  async claim() {
    return this.invoke(this.possessionModuleName, 'claim', {});
  }

  /** Pass along a direction (holder only). */
  async pass(dirX: number, dirZ: number) {
    return this.invoke(this.possessionModuleName, 'pass', { dirX, dirZ });
  }

  /** Shoot at the opposing goal (holder only; the server aims). */
  async shoot() {
    return this.invoke(this.possessionModuleName, 'shoot', {});
  }

  /** The live ball match (teams, ball, standings, summary). */
  async matchState() {
    return this.invoke(this.possessionModuleName, 'match_state', {});
  }

  private async invoke(moduleName: string, exportName: string, params: Record<string, unknown>) {
    const result = await this.engines.invoke(moduleName, exportName, params);
    if (!result.success) {
      throw new Error(`racing.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }
}
