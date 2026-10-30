/**
 * The draft of a bound game repository: what the game editor, the agent and
 * the running world read before anything is committed.
 *
 * The page owns one store per open project. Two backends implement it: the
 * hosted one here ({@link GitHubDraftStore}: an overlay over the bound branch,
 * kept in the browser on the game's own origin) and the dev-server one a game
 * provides for a local checkout. Both report versions as git blob ids, so a
 * file the draft has not changed carries its GitHub blob id and `dirty` is a
 * comparison.
 */

/** Who changed the draft. `player` is the editor; `agent` the harness. */
export type DraftSource = 'player' | 'agent' | 'commit' | 'rebase' | 'reload';

export interface DraftEntry {
  path: string;
  /** Git blob id of the draft content. */
  hash: string;
  size: number;
  /** Not UTF-8 text (or over the text cap): listed, never readable as text. */
  binary: boolean;
  /** Differs from the base commit. */
  dirty: boolean;
}

export interface DraftSnapshot {
  /** Commit the draft builds on; null when the store has no remote base. */
  baseCommitSha: string | null;
  /** Bumps on every change. */
  revision: number;
  entries: DraftEntry[];
  /** Paths the draft deletes that exist at the base. */
  deleted: string[];
  /** The tree was larger than the store serves; entries were dropped. */
  truncated: boolean;
}

export interface DraftChange {
  path: string;
  /** New hash, or null for a deletion. */
  hash: string | null;
}

export interface DraftChangeEvent {
  revision: number;
  baseCommitSha: string | null;
  changes: DraftChange[];
  source: DraftSource;
}

export type DraftPrecondition = { kind: 'createIfAbsent' } | { kind: 'ifHash'; hash: string };

export interface DraftReadResult {
  files: Array<{ path: string; hash: string; content: string }>;
  missing: string[];
  binary: string[];
}

export interface DraftWriteResult {
  path: string;
  hash: string;
  /** Hash before the write; null when the write created the file. */
  previousHash: string | null;
  revision: number;
}

export interface DraftDeleteResult {
  path: string;
  previousHash: string;
  revision: number;
}

export interface DraftCommitResult {
  commitSha: string;
  /** Paths written or deleted by the commit. */
  committed: string[];
  baseCommitSha: string;
}

/** A path the branch and the draft both changed since the draft's base. */
export interface DraftConflict {
  path: string;
  /** Blob the draft edit started from (null: the draft created the path). */
  base: string | null;
  /** Blob on the branch now (null: deleted there). */
  theirs: string | null;
  /** The draft's content hash (null: deleted in the draft). */
  ours: string | null;
}

export const DRAFT_ERROR_CODES = {
  stale: 'DRAFT_STALE',
  notFound: 'DRAFT_NOT_FOUND',
  refused: 'DRAFT_PATH_REFUSED',
  tooLarge: 'DRAFT_TOO_LARGE',
  conflict: 'DRAFT_CONFLICT',
  declined: 'DRAFT_DECLINED',
  unavailable: 'DRAFT_UNAVAILABLE',
} as const;

export type DraftErrorCode = (typeof DRAFT_ERROR_CODES)[keyof typeof DRAFT_ERROR_CODES];

/** A draft operation that failed for a reason the caller can act on. `code` crosses the bridge. */
export class DraftError extends Error {
  constructor(
    readonly code: DraftErrorCode,
    message: string,
    readonly conflicts: readonly DraftConflict[] = [],
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

export interface DraftStore {
  /** Backend name, for the status line (`github`, `dev-server`). */
  readonly kind: string;
  /** Load (or reload) the base and the stored draft. */
  load(): Promise<DraftSnapshot>;
  /** The current snapshot; call after `load`. */
  snapshot(): DraftSnapshot;
  read(paths: readonly string[]): Promise<DraftReadResult>;
  write(
    path: string,
    content: string,
    options: { source: 'player' | 'agent'; precondition?: DraftPrecondition },
  ): Promise<DraftWriteResult>;
  remove(
    path: string,
    options: { source: 'player' | 'agent'; precondition?: { kind: 'ifHash'; hash: string } },
  ): Promise<DraftDeleteResult>;
  /** Drop draft changes (all of them when `paths` is omitted). */
  discard(paths?: readonly string[]): Promise<void>;
  /** Publish the dirty paths (or the named ones) as one commit. */
  commit(request: { message: string; paths?: readonly string[] }): Promise<DraftCommitResult>;
  conflicts(): readonly DraftConflict[];
  /** `mine` keeps the draft and commits over the branch; `theirs` drops the draft edit. */
  resolveConflict(path: string, keep: 'mine' | 'theirs'): Promise<void>;
  subscribe(listener: (event: DraftChangeEvent) => void): () => void;
  dispose(): void;
}
