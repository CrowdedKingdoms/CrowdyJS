/**
 * Wire protocol between the Crowdy Studio page and the DeepSeek Harness that
 * runs in a Web Worker inside the Studio agent pane.
 *
 * The harness side lives in the published `@crowdedkingdoms/crowdy-dsh`
 * package (`bridge-protocol` export); this file mirrors it so the SDK stays
 * dependency-free. Keep the two in step.
 *
 * Two channels exist:
 *
 *   - `postMessage` between the page and the harness iframe: the iframe says
 *     `crowdy-dsh:ready`, the page answers `crowdy-dsh:boot` with the home
 *     files to seed and a one-time `nonce`, and the iframe reports
 *     `crowdy-dsh:booted` or `:failed`.
 *   - one `BroadcastChannel` (name chosen by the page) between the page and
 *     the worker: the worker asks the page to do what only the page can
 *     (draft tests, screenshots, project switching, game observation) and the
 *     page pushes token, project and context updates.
 *
 * A `BroadcastChannel` is open to every same-origin script, so the channel
 * name is unguessable and every frame carries the boot nonce; a frame without
 * the right nonce is dropped. The page still confirms a live deploy with the
 * player before running it, because the harness UI's approval is inside the
 * iframe and the page cannot see it.
 */

/**
 * v3 (CrowdyJS 17): a project carries `source` and `githubSha`. A GITHUB
 * project's files are the server's mirror of the repository at that commit;
 * the worker writes them through `crowdyStudioGitHubPutFile` with
 * `expectedCommitSha = githubSha` and no longer mirrors anything back to
 * Studio itself. `page.project` / `page.saved` re-announce the commit whenever
 * it moves so the worker's next write carries the current one.
 */
/**
 * v4 (CrowdyJS 17.7 / crowdy-dsh 0.4, DN-10): the grid requests. The agent can
 * ask which grid the open project is bound to (`grid.context`) and run a JS
 * grid program from a project file inside it (`grid.programRun`,
 * `grid.programStatus`). The page answers them only when its host offers a
 * `grid` capability; otherwise they fail with a clear message.
 */
/**
 * v5 (CrowdyJS 18.23 / crowdy-dsh 0.5): game mode. A boot with
 * `studioMode: 'game'` edits the bound Construct game instead of the mod
 * crates. The page owns a draft of the repository ({@link DraftStore} in
 * `crowdy-studio/draft`); the worker reads it as a snapshot (`draft.tree`,
 * batched `draft.read`), writes under the harness's write preconditions, and
 * hears every other change through `page.draftChanged`. `draft.commit`
 * publishes the draft as ONE commit with the agent's message once the player
 * confirms here. Versions are git blob SHA-1 hashes, so an unchanged draft
 * file hashes to its GitHub blob. `worker.ready` names the modes the worker
 * can mount; game mode is refused against a worker without it. The v4 game
 * requests (`studio.putGameFile`, `listRepo`, ...) were never published.
 */
export const CROWDY_DSH_PROTOCOL_VERSION = 5 as const;

/** Which Studio editor a boot mounts. Fixed for the life of the worker. */
export type DshStudioMode = 'mod' | 'game';

export type DshBridgeSide = 'page' | 'worker';

export type DshBridgeFrame =
  | { v: typeof CROWDY_DSH_PROTOCOL_VERSION; n: string; from: DshBridgeSide; t: 'req'; id: string; method: string; params: unknown }
  | { v: typeof CROWDY_DSH_PROTOCOL_VERSION; n: string; from: DshBridgeSide; t: 'res'; id: string; result: unknown }
  | { v: typeof CROWDY_DSH_PROTOCOL_VERSION; n: string; from: DshBridgeSide; t: 'err'; id: string; code: string; message: string }
  | { v: typeof CROWDY_DSH_PROTOCOL_VERSION; n: string; from: DshBridgeSide; t: 'event'; event: string; payload: unknown };

export interface DshScreenshotResult {
  name: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: ArrayBuffer;
  width: number;
  height: number;
  caption?: string;
}

export interface DshDiagnostic {
  target: 'SERVER' | 'CLIENT';
  path: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface DshRuntimeStatus {
  target: 'SERVER' | 'CLIENT';
  phase: string;
  moduleName?: string;
  runningRevision?: string;
  savedRevision?: string;
  message?: string;
}

export interface DshBuildResult {
  ok: boolean;
  mode: 'draft' | 'live';
  summary: string;
  diagnostics: DshDiagnostic[];
  buildLog: string;
  runtime: DshRuntimeStatus[];
  screenshot?: DshScreenshotResult;
}

export type DshProjectSource = 'STUDIO' | 'GITHUB';

export interface DshProjectSummary {
  projectId: string;
  name: string;
  kind: string;
  updatedAt: string;
  /** Where the files are authored. GITHUB means the repository is the working tree. */
  source: DshProjectSource;
  /** Commit the GITHUB project mirrors; null for a STUDIO project. */
  githubSha: string | null;
  /** `owner/repo@branch` for a GITHUB project, for the agent's own words. */
  github?: string;
}

/** The grid the open project is bound to, as the page sees it (v4). */
export interface DshGridContext {
  appId: string;
  gridId: string;
  low: { x: string; y: string; z: string };
  high: { x: string; y: string; z: string };
  /** Whether the signed-in player currently owns the grid. */
  owned: boolean;
  channels: Array<{ groupId: string; name: string }>;
  sessions: Array<{ sessionId: string; name: string | null; status: string }>;
}

/** One JS grid program the page is running (v4). */
export interface DshGridProgramStatus {
  path: string;
  running: boolean;
  startedAt?: string;
  lastError?: string;
  /** Recent `console` lines from the program's sandbox. */
  log: string[];
}

// ── Game mode: the draft of the bound repository (v5) ─────────────────────────

export interface DshDraftEntry {
  path: string;
  /** Git blob SHA-1 of the content (`blob <bytes>\0<content>`). */
  hash: string;
  size: number;
  /** Not UTF-8 text, or larger than the page serves as text: listed, never readable. */
  binary: boolean;
  /** Differs from the base commit. */
  dirty: boolean;
}

export interface DshDraftTree {
  baseCommitSha: string | null;
  revision: number;
  entries: DshDraftEntry[];
  /** Paths deleted in the draft that still exist at the base. */
  deleted: string[];
  truncated: boolean;
}

export type DshDraftPrecondition = { kind: 'createIfAbsent' } | { kind: 'ifHash'; hash: string };

export interface DshDraftFileText {
  path: string;
  hash: string;
  content: string;
}

export interface DshDraftWriteResult {
  path: string;
  hash: string;
  previousHash: string | null;
  revision: number;
}

export interface DshDraftCommitResult {
  commitSha: string;
  committed: string[];
  baseCommitSha: string;
}

export interface DshPreviewStatus {
  revision: number;
  ok: boolean;
  scene?: string;
  errors: Array<{ path?: string; line?: number; column?: number; message: string }>;
  note?: string;
}

export interface DshSkillSummary {
  name: string;
  description: string;
  /** Playbook page that holds the body, e.g. `skills/<name>/SKILL.md`. */
  page: string;
}

/** Stable `err` codes the page answers draft requests with. */
export const DSH_DRAFT_ERROR_CODES = {
  stale: 'DRAFT_STALE',
  notFound: 'DRAFT_NOT_FOUND',
  refused: 'DRAFT_PATH_REFUSED',
  tooLarge: 'DRAFT_TOO_LARGE',
  conflict: 'DRAFT_CONFLICT',
  declined: 'DRAFT_DECLINED',
  unavailable: 'DRAFT_UNAVAILABLE',
} as const;

export interface DshBridgeRequestMap {
  'studio.screenshot': { params: { label?: string }; result: DshScreenshotResult };
  'studio.draftTest': { params: Record<string, never>; result: DshBuildResult };
  'studio.deployLive': { params: Record<string, never>; result: DshBuildResult };
  'studio.runtimeStatus': { params: Record<string, never>; result: { runtime: DshRuntimeStatus[] } };
  'studio.runtimeLogs': { params: { limit?: number }; result: { lines: string[]; truncated: boolean } };
  'studio.clientLogs': { params: { limit?: number }; result: { lines: string[]; truncated: boolean } };
  'studio.projectList': {
    params: Record<string, never>;
    result: { projects: DshProjectSummary[]; currentProjectId: string | null };
  };
  'studio.projectOpen': { params: { projectId: string }; result: { project: DshProjectSummary } };
  'studio.projectCreate': { params: { name: string; template?: string }; result: { project: DshProjectSummary } };
  'game.observe': { params: Record<string, never>; result: { observation: unknown; capturedAt: string } };
  'grid.context': { params: Record<string, never>; result: { grid: DshGridContext | null } };
  'grid.programRun': {
    params: { path: string; stop?: boolean };
    result: { program: DshGridProgramStatus };
  };
  'grid.programStatus': { params: Record<string, never>; result: { programs: DshGridProgramStatus[] } };
  'studio.readPlaybook': { params: { page: string }; result: { text: string } };
  'studio.listSkills': { params: Record<string, never>; result: { skills: DshSkillSummary[] } };
  'draft.tree': { params: Record<string, never>; result: DshDraftTree };
  'draft.read': { params: { paths: string[] }; result: { files: DshDraftFileText[]; missing: string[] } };
  'draft.write': {
    params: { path: string; content: string; precondition?: DshDraftPrecondition };
    result: DshDraftWriteResult;
  };
  'draft.delete': {
    params: { path: string; precondition?: { kind: 'ifHash'; hash: string } };
    result: { path: string; previousHash: string; revision: number };
  };
  'draft.commit': { params: { message: string; paths?: string[] }; result: DshDraftCommitResult };
  'preview.status': { params: { afterRevision?: number; timeoutMs?: number }; result: DshPreviewStatus };
}

export type DshBridgeMethod = keyof DshBridgeRequestMap;

export interface DshPageEventMap {
  'page.hello': {
    appId: string;
    projectId: string | null;
    appToken?: string;
    source?: DshProjectSource;
    githubSha?: string | null;
  };
  'page.token': { appToken: string };
  /** The open project changed, or a GITHUB project's commit moved (bind, refresh, save). */
  'page.project': { projectId: string | null; source?: DshProjectSource; githubSha?: string | null };
  'page.saved': { revision?: string; githubSha?: string | null };
  'page.context': {
    observation?: unknown;
    clientLogs?: string[];
    diagnostics?: DshDiagnostic[];
    runtime?: DshRuntimeStatus[];
    note?: string;
  };
  'page.capture': DshScreenshotResult;
  /** Text for the agent, queued into the latest live session (or a new one). */
  'page.prompt': { text: string; mode?: 'queue' | 'steer' };
  'page.bye': Record<string, never>;
  /** The draft changed (v5); `hash: null` is a deletion. The agent's own writes are announced too. */
  'page.draftChanged': {
    revision: number;
    baseCommitSha: string | null;
    changes: Array<{ path: string; hash: string | null }>;
    source: 'player' | 'agent' | 'commit' | 'rebase' | 'reload';
  };
}

export interface DshWorkerEventMap {
  /** `modes` lists what the worker can mount and `mode` what it mounted (v5). */
  'worker.ready': { root: string; store?: string; modes?: DshStudioMode[]; mode?: DshStudioMode };
  /** Mod mode: the worker changed a project file. Game-mode writes are announced by the page. */
  'worker.fileChanged': { target: 'SERVER' | 'CLIENT'; path: string };
  'worker.warning': { message: string };
  'worker.openFile': { target: 'SERVER' | 'CLIENT' | 'REPO'; path: string; line?: number };
}

/** Messages the harness iframe posts to its parent (`source: 'crowdy-dsh'`). */
export type DshFrameMessage =
  | { source: 'crowdy-dsh'; type: 'crowdy-dsh:ready' }
  | { source: 'crowdy-dsh'; type: 'crowdy-dsh:booted'; mount: string }
  | { source: 'crowdy-dsh'; type: 'crowdy-dsh:failed'; message: string };

/** The page's answer to `crowdy-dsh:ready`. */
export interface DshBootMessage {
  type: 'crowdy-dsh:boot';
  /**
   * Home-relative files to seed (`crowdy.json`, `settings.yaml`). Never the
   * app token: that travels over the channel (`page.hello` / `page.token`) and
   * lives only in the worker's memory.
   */
  files: Record<string, string>;
  /** One-time secret every bridge frame must carry; also in `crowdy.json`. */
  nonce: string;
  /** OPFS scope for restored sessions; omit to start fresh. */
  persistScope?: string;
  mount?: string;
}

export function isDshBridgeFrame(value: unknown, nonce?: string): value is DshBridgeFrame {
  if (!value || typeof value !== 'object') return false;
  const frame = value as Partial<DshBridgeFrame>;
  if (frame.v !== CROWDY_DSH_PROTOCOL_VERSION || typeof frame.n !== 'string' || typeof frame.t !== 'string') return false;
  if (frame.from !== 'page' && frame.from !== 'worker') return false;
  return nonce === undefined || frame.n === nonce;
}

export function isDshFrameMessage(value: unknown): value is DshFrameMessage {
  return !!value && typeof value === 'object' && (value as { source?: unknown }).source === 'crowdy-dsh';
}
