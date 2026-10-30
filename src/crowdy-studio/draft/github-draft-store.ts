/**
 * The hosted draft: an overlay over the bound branch, kept in the browser.
 *
 * The base is the project's mirror commit (`githubSha`): its tree comes from
 * `crowdyStudioGitHubTree`, file text from `crowdyStudioGitHubFiles` (100
 * paths per call, cached by blob id). The overlay holds every path the draft
 * changed, created or deleted, with the blob it started from. Committing is
 * one `crowdyStudioGitHubCommitFiles` on top of the base; when the branch has
 * moved, the store refreshes the base, carries every edit that does not
 * collide onto it, retries once, and otherwise reports the colliding paths as
 * conflicts for the player to settle.
 */

import { CrowdyGraphQLError } from '../../errors.js';
import { gitBlobShaOfText, utf8Length } from './hash.js';
import { DraftOverlayStorage, MemoryDraftOverlayStorage, type StoredOverlayEntry } from './overlay-storage.js';
import { isLikelyBinaryPath, normalizeRepoPath } from './paths.js';
import {
  DraftError,
  type DraftChange,
  type DraftChangeEvent,
  type DraftCommitResult,
  type DraftConflict,
  type DraftDeleteResult,
  type DraftEntry,
  type DraftPrecondition,
  type DraftReadResult,
  type DraftSnapshot,
  type DraftSource,
  type DraftStore,
  type DraftWriteResult,
} from './types.js';

/** The GitHub calls the hosted draft needs; `CrowdyStudioGitHubTransport` satisfies it. */
export interface GitHubDraftTransport {
  tree(input: { appId: string; projectId: string; commitSha?: string }): Promise<{
    commitSha: string;
    entries: Array<{ path: string; type: string; sha: string | null; size: number | null }>;
  }>;
  getFiles(input: { appId: string; projectId: string; commitSha?: string; paths: string[] }): Promise<{
    commitSha: string;
    files: Array<{ path: string; sha: string; size: number; binary: boolean; content: string | null }>;
    missing: string[];
  }>;
  commitFiles(input: {
    appId: string;
    projectId: string;
    message: string;
    expectedCommitSha: string;
    changes: Array<{ path: string; content?: string; delete?: boolean }>;
  }): Promise<{ commitSha: string; parentSha: string; written: string[]; deleted: string[] }>;
  refresh(input: { appId: string; projectId: string }): Promise<{ githubSha: string | null }>;
}

export interface GitHubDraftStoreOptions {
  transport: GitHubDraftTransport;
  appId: string;
  projectId: string;
  /** The project's mirror commit when the store is created. */
  baseCommitSha: string;
  storage?: DraftOverlayStorage;
  /** Largest text file the draft serves, in bytes (default 512 KiB, the server's cap). */
  maxTextBytes?: number;
  /** Most entries the draft lists (default 5000). */
  maxEntries?: number;
}

interface BaseFile {
  sha: string;
  size: number;
}

const READ_BATCH = 100;
const COMMIT_BATCH = 100;
const PERSIST_DEBOUNCE_MS = 250;

function isStale(error: unknown): boolean {
  return error instanceof CrowdyGraphQLError && error.code === 'GITHUB_STALE_SHA';
}

export class GitHubDraftStore implements DraftStore {
  readonly kind = 'github';
  private readonly storage: DraftOverlayStorage;
  private readonly maxTextBytes: number;
  private readonly maxEntries: number;
  private readonly key: string;
  private baseCommitSha: string;
  private base = new Map<string, BaseFile>();
  private truncated = false;
  private readonly overlay = new Map<string, StoredOverlayEntry>();
  /** Blob id -> text, or null when binary or over the cap. */
  private readonly text = new Map<string, string | null>();
  private conflictList: DraftConflict[] = [];
  private revision = 0;
  private loaded = false;
  private disposed = false;
  private readonly listeners = new Set<(event: DraftChangeEvent) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: GitHubDraftStoreOptions) {
    this.storage = options.storage ?? new MemoryDraftOverlayStorage();
    this.maxTextBytes = options.maxTextBytes ?? 512 * 1024;
    this.maxEntries = options.maxEntries ?? 5000;
    this.key = `${options.appId}/${options.projectId}`;
    this.baseCommitSha = options.baseCommitSha;
  }

  // ── reads ───────────────────────────────────────────────────────────────────

  load(): Promise<DraftSnapshot> {
    return this.serial(async () => {
      await this.loadBase(this.baseCommitSha);
      const stored = await this.storage.loadOverlay(this.key);
      this.overlay.clear();
      if (stored) {
        for (const entry of stored.entries) {
          if (normalizeRepoPath(entry.path) === entry.path) this.overlay.set(entry.path, entry);
        }
        this.revision = Math.max(this.revision, stored.revision);
        if (stored.baseCommitSha !== this.baseCommitSha) this.rebaseOverlay();
      }
      this.loaded = true;
      this.revision += 1;
      this.emit({ changes: [], source: 'reload' });
      return this.snapshot();
    });
  }

  snapshot(): DraftSnapshot {
    const entries: DraftEntry[] = [];
    const deleted: string[] = [];
    const paths = new Set([...this.base.keys(), ...this.overlay.keys()]);
    for (const path of [...paths].sort()) {
      const edit = this.overlay.get(path);
      const baseFile = this.base.get(path);
      if (edit && edit.content === null) {
        if (baseFile) deleted.push(path);
        continue;
      }
      if (edit && edit.hash) {
        entries.push({
          path,
          hash: edit.hash,
          size: utf8Length(edit.content ?? ''),
          binary: false,
          dirty: edit.hash !== baseFile?.sha,
        });
        continue;
      }
      if (!baseFile) continue;
      entries.push({
        path,
        hash: baseFile.sha,
        size: baseFile.size,
        binary: this.isBinaryBase(path, baseFile),
        dirty: false,
      });
    }
    return {
      baseCommitSha: this.baseCommitSha,
      revision: this.revision,
      entries,
      deleted,
      truncated: this.truncated,
    };
  }

  async read(paths: readonly string[]): Promise<DraftReadResult> {
    this.assertLoaded();
    const files: DraftReadResult['files'] = [];
    const missing: string[] = [];
    const binary: string[] = [];
    const fetch: string[] = [];
    for (const raw of paths) {
      const path = normalizeRepoPath(raw);
      if (!path) {
        missing.push(raw);
        continue;
      }
      const edit = this.overlay.get(path);
      if (edit) {
        if (edit.content === null || !edit.hash) missing.push(path);
        else files.push({ path, hash: edit.hash, content: edit.content });
        continue;
      }
      const baseFile = this.base.get(path);
      if (!baseFile) {
        missing.push(path);
        continue;
      }
      if (baseFile.size > this.maxTextBytes) {
        binary.push(path);
        continue;
      }
      const cached = this.text.has(baseFile.sha) ? this.text.get(baseFile.sha) : await this.storage.loadBlobText(baseFile.sha);
      if (cached === undefined) {
        fetch.push(path);
        continue;
      }
      this.text.set(baseFile.sha, cached);
      if (cached === null) binary.push(path);
      else files.push({ path, hash: baseFile.sha, content: cached });
    }
    for (let i = 0; i < fetch.length; i += READ_BATCH) {
      const batch = fetch.slice(i, i + READ_BATCH);
      const got = await this.options.transport.getFiles({
        appId: this.options.appId,
        projectId: this.options.projectId,
        commitSha: this.baseCommitSha,
        paths: batch,
      });
      for (const file of got.files) {
        const text = file.binary || file.content === null ? null : file.content;
        this.text.set(file.sha, text);
        void this.storage.saveBlobText(file.sha, text).catch(() => undefined);
        if (text === null) binary.push(file.path);
        else files.push({ path: file.path, hash: file.sha, content: text });
      }
      missing.push(...got.missing);
    }
    return { files, missing, binary };
  }

  conflicts(): readonly DraftConflict[] {
    return this.conflictList;
  }

  // ── writes ──────────────────────────────────────────────────────────────────

  write(
    rawPath: string,
    content: string,
    options: { source: 'player' | 'agent'; precondition?: DraftPrecondition },
  ): Promise<DraftWriteResult> {
    return this.serial(async () => {
      this.assertLoaded();
      const path = this.writablePath(rawPath);
      if (utf8Length(content) > this.maxTextBytes) {
        throw new DraftError('DRAFT_TOO_LARGE', `${path} is larger than ${this.maxTextBytes} bytes.`);
      }
      const current = this.currentHash(path);
      this.checkPrecondition(path, current, options.precondition);
      const hash = await gitBlobShaOfText(content);
      const baseFile = this.base.get(path);
      const existing = this.overlay.get(path);
      if (baseFile?.sha === hash) {
        this.overlay.delete(path);
      } else {
        this.overlay.set(path, {
          path,
          content,
          hash,
          baseSha: existing ? existing.baseSha : (baseFile?.sha ?? null),
          updatedAt: Date.now(),
        });
      }
      this.text.set(hash, content);
      this.revision += 1;
      this.persist();
      this.emit({ changes: [{ path, hash }], source: options.source });
      return { path, hash, previousHash: current, revision: this.revision };
    });
  }

  remove(
    rawPath: string,
    options: { source: 'player' | 'agent'; precondition?: { kind: 'ifHash'; hash: string } },
  ): Promise<DraftDeleteResult> {
    return this.serial(async () => {
      this.assertLoaded();
      const path = this.writablePath(rawPath);
      const current = this.currentHash(path);
      if (current === null) throw new DraftError('DRAFT_NOT_FOUND', `${path} is not in the draft.`);
      this.checkPrecondition(path, current, options.precondition);
      const baseFile = this.base.get(path);
      const existing = this.overlay.get(path);
      if (baseFile) {
        this.overlay.set(path, {
          path,
          content: null,
          hash: null,
          baseSha: existing ? existing.baseSha : baseFile.sha,
          updatedAt: Date.now(),
        });
      } else {
        this.overlay.delete(path);
      }
      this.revision += 1;
      this.persist();
      this.emit({ changes: [{ path, hash: null }], source: options.source });
      return { path, previousHash: current, revision: this.revision };
    });
  }

  discard(paths?: readonly string[]): Promise<void> {
    return this.serial(async () => {
      this.assertLoaded();
      const targets = paths ? paths.map((p) => normalizeRepoPath(p)).filter((p): p is string => !!p) : [...this.overlay.keys()];
      const changes: DraftChange[] = [];
      for (const path of targets) {
        if (!this.overlay.delete(path)) continue;
        changes.push({ path, hash: this.base.get(path)?.sha ?? null });
      }
      this.conflictList = this.conflictList.filter((c) => !targets.includes(c.path));
      if (changes.length === 0) return;
      this.revision += 1;
      this.persist();
      this.emit({ changes, source: 'player' });
    });
  }

  resolveConflict(rawPath: string, keep: 'mine' | 'theirs'): Promise<void> {
    return this.serial(async () => {
      const path = normalizeRepoPath(rawPath);
      const conflict = this.conflictList.find((c) => c.path === path);
      if (!path || !conflict) return;
      this.conflictList = this.conflictList.filter((c) => c.path !== path);
      if (keep === 'theirs') {
        this.overlay.delete(path);
        this.revision += 1;
        this.persist();
        this.emit({ changes: [{ path, hash: this.base.get(path)?.sha ?? null }], source: 'player' });
        return;
      }
      const edit = this.overlay.get(path);
      if (edit) this.overlay.set(path, { ...edit, baseSha: this.base.get(path)?.sha ?? null });
      this.persist();
    });
  }

  commit(request: { message: string; paths?: readonly string[] }): Promise<DraftCommitResult> {
    return this.serial(async () => {
      this.assertLoaded();
      try {
        return await this.commitOnce(request);
      } catch (error) {
        if (!isStale(error)) throw error;
      }
      // The branch moved: bring the base forward, carry what does not collide, retry once.
      const refreshed = await this.options.transport.refresh({
        appId: this.options.appId,
        projectId: this.options.projectId,
      });
      if (!refreshed.githubSha) throw new DraftError('DRAFT_UNAVAILABLE', 'The project is no longer bound to GitHub.');
      await this.loadBase(refreshed.githubSha);
      this.rebaseOverlay();
      this.revision += 1;
      this.persist();
      this.emit({ changes: [], source: 'rebase' });
      const blocking = this.conflictList.filter((c) => !request.paths || request.paths.includes(c.path));
      if (blocking.length > 0) {
        throw new DraftError(
          'DRAFT_CONFLICT',
          `The branch moved and changed ${blocking.map((c) => c.path).join(', ')} too. Keep the draft or take the branch's version, then commit again.`,
          blocking,
        );
      }
      return this.commitOnce(request);
    });
  }

  subscribe(listener: (event: DraftChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      void this.flush();
    }
    this.disposed = true;
    this.listeners.clear();
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async commitOnce(request: { message: string; paths?: readonly string[] }): Promise<DraftCommitResult> {
    const wanted = request.paths?.map((p) => normalizeRepoPath(p)).filter((p): p is string => !!p);
    const dirty = [...this.overlay.values()].filter((edit) => {
      if (wanted && !wanted.includes(edit.path)) return false;
      return edit.content === null ? this.base.has(edit.path) : edit.hash !== this.base.get(edit.path)?.sha;
    });
    if (dirty.length === 0) throw new DraftError('DRAFT_NOT_FOUND', 'The draft has nothing to commit.');
    const conflicted = this.conflictList.filter((c) => dirty.some((d) => d.path === c.path));
    if (conflicted.length > 0) {
      throw new DraftError(
        'DRAFT_CONFLICT',
        `Settle ${conflicted.map((c) => c.path).join(', ')} before committing.`,
        conflicted,
      );
    }
    const message = request.message.trim().slice(0, 200) || `Update ${dirty.length} file${dirty.length === 1 ? '' : 's'}`;
    let commitSha = this.baseCommitSha;
    const committed: string[] = [];
    // One commit when the draft fits a call; larger drafts stack commits on each other.
    for (let i = 0; i < dirty.length; i += COMMIT_BATCH) {
      const batch = dirty.slice(i, i + COMMIT_BATCH);
      const result = await this.options.transport.commitFiles({
        appId: this.options.appId,
        projectId: this.options.projectId,
        message: dirty.length > COMMIT_BATCH ? `${message} (${i / COMMIT_BATCH + 1})` : message,
        expectedCommitSha: commitSha,
        changes: batch.map((edit) =>
          edit.content === null ? { path: edit.path, delete: true } : { path: edit.path, content: edit.content },
        ),
      });
      commitSha = result.commitSha;
      for (const edit of batch) {
        committed.push(edit.path);
        if (edit.content === null) this.base.delete(edit.path);
        else this.base.set(edit.path, { sha: edit.hash!, size: utf8Length(edit.content) });
        const now = this.overlay.get(edit.path);
        if (now && now.updatedAt === edit.updatedAt) this.overlay.delete(edit.path);
        else if (now) this.overlay.set(edit.path, { ...now, baseSha: this.base.get(edit.path)?.sha ?? null });
      }
      this.baseCommitSha = commitSha;
    }
    this.revision += 1;
    this.persist();
    this.emit({
      changes: committed.map((path) => ({ path, hash: this.base.get(path)?.sha ?? null })),
      source: 'commit',
    });
    return { commitSha, committed, baseCommitSha: commitSha };
  }

  private async loadBase(commitSha: string): Promise<void> {
    const tree = await this.options.transport.tree({
      appId: this.options.appId,
      projectId: this.options.projectId,
      commitSha,
    });
    const next = new Map<string, BaseFile>();
    let count = 0;
    let dropped = false;
    for (const entry of tree.entries) {
      if (entry.type !== 'blob' || !entry.sha) continue;
      if (normalizeRepoPath(entry.path) !== entry.path) continue;
      if (count >= this.maxEntries) {
        dropped = true;
        continue;
      }
      next.set(entry.path, { sha: entry.sha, size: entry.size ?? 0 });
      count += 1;
    }
    this.base = next;
    this.truncated = dropped;
    this.baseCommitSha = tree.commitSha;
  }

  /**
   * After the base moved: an edit whose starting blob is still the base blob
   * carries over unchanged; one where the branch also changed the path becomes
   * a conflict, unless both sides ended at the same content.
   */
  private rebaseOverlay(): void {
    const conflicts: DraftConflict[] = [];
    for (const [path, edit] of this.overlay) {
      const theirs = this.base.get(path)?.sha ?? null;
      if (theirs === edit.baseSha) continue;
      if (theirs === edit.hash) {
        this.overlay.delete(path);
        continue;
      }
      conflicts.push({ path, base: edit.baseSha, theirs, ours: edit.hash });
    }
    this.conflictList = conflicts;
  }

  private currentHash(path: string): string | null {
    const edit = this.overlay.get(path);
    if (edit) return edit.content === null ? null : edit.hash;
    return this.base.get(path)?.sha ?? null;
  }

  private checkPrecondition(path: string, current: string | null, precondition?: DraftPrecondition): void {
    if (!precondition) return;
    if (precondition.kind === 'createIfAbsent' && current !== null) {
      throw new DraftError('DRAFT_STALE', `${path} already exists in the draft; read it before replacing it.`);
    }
    if (precondition.kind === 'ifHash' && current !== precondition.hash) {
      throw new DraftError(
        'DRAFT_STALE',
        current === null ? `${path} is no longer in the draft.` : `${path} changed in the draft since it was read; read it again.`,
      );
    }
  }

  private writablePath(raw: string): string {
    const path = normalizeRepoPath(raw);
    if (!path) throw new DraftError('DRAFT_PATH_REFUSED', `${raw} is not a file the game editor may write.`);
    return path;
  }

  private isBinaryBase(path: string, file: BaseFile): boolean {
    if (file.size > this.maxTextBytes) return true;
    const known = this.text.get(file.sha);
    if (known !== undefined) return known === null;
    return isLikelyBinaryPath(path);
  }

  private assertLoaded(): void {
    if (this.disposed) throw new DraftError('DRAFT_UNAVAILABLE', 'The draft was closed.');
    if (!this.loaded) throw new DraftError('DRAFT_UNAVAILABLE', 'The draft is still loading.');
  }

  private emit(event: { changes: DraftChange[]; source: DraftSource }): void {
    const full: DraftChangeEvent = { ...event, revision: this.revision, baseCommitSha: this.baseCommitSha };
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch {
        // A listener's failure is its own.
      }
    }
  }

  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flush();
    }, PERSIST_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    try {
      await this.storage.saveOverlay(this.key, {
        baseCommitSha: this.baseCommitSha,
        revision: this.revision,
        entries: [...this.overlay.values()],
      });
    } catch {
      // The draft stays in memory; the next change tries again.
    }
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
