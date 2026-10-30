/**
 * Where a hosted draft lives between page loads: IndexedDB on the game's own
 * origin (each hosted game is served from an origin of its own, so its
 * storage is nobody else's). The overlay holds only what the draft changed;
 * blob text is cached by blob id, which never changes meaning.
 */

export interface StoredOverlayEntry {
  path: string;
  /** Draft content; null for a deletion. */
  content: string | null;
  hash: string | null;
  /** Base blob the edit started from; null when the draft created the path. */
  baseSha: string | null;
  updatedAt: number;
}

export interface StoredOverlay {
  baseCommitSha: string;
  revision: number;
  entries: StoredOverlayEntry[];
}

export interface DraftOverlayStorage {
  loadOverlay(key: string): Promise<StoredOverlay | null>;
  saveOverlay(key: string, overlay: StoredOverlay): Promise<void>;
  /** Text of a blob id, or null when it is known binary; undefined when not cached. */
  loadBlobText(sha: string): Promise<string | null | undefined>;
  saveBlobText(sha: string, text: string | null): Promise<void>;
}

/** Process memory only (tests, Node, or a browser without IndexedDB). */
export class MemoryDraftOverlayStorage implements DraftOverlayStorage {
  private readonly overlays = new Map<string, StoredOverlay>();
  private readonly blobs = new Map<string, string | null>();

  async loadOverlay(key: string): Promise<StoredOverlay | null> {
    const found = this.overlays.get(key);
    return found ? structuredClone(found) : null;
  }

  async saveOverlay(key: string, overlay: StoredOverlay): Promise<void> {
    this.overlays.set(key, structuredClone(overlay));
  }

  async loadBlobText(sha: string): Promise<string | null | undefined> {
    return this.blobs.has(sha) ? (this.blobs.get(sha) ?? null) : undefined;
  }

  async saveBlobText(sha: string, text: string | null): Promise<void> {
    this.blobs.set(sha, text);
  }
}

const DB_NAME = 'crowdy-studio-draft';
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** IndexedDB on this origin. Falls back to memory when IndexedDB is unavailable. */
export class IndexedDbDraftOverlayStorage implements DraftOverlayStorage {
  private db: Promise<IDBDatabase> | null = null;
  private readonly fallback = new MemoryDraftOverlayStorage();

  private open(): Promise<IDBDatabase> | null {
    if (typeof indexedDB === 'undefined') return null;
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('overlays')) db.createObjectStore('overlays');
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
    return this.db;
  }

  private async store(name: 'overlays' | 'blobs', mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
    const opened = this.open();
    if (!opened) return null;
    try {
      return (await opened).transaction(name, mode).objectStore(name);
    } catch {
      return null;
    }
  }

  async loadOverlay(key: string): Promise<StoredOverlay | null> {
    const store = await this.store('overlays', 'readonly');
    if (!store) return this.fallback.loadOverlay(key);
    return ((await request(store.get(key))) as StoredOverlay | undefined) ?? null;
  }

  async saveOverlay(key: string, overlay: StoredOverlay): Promise<void> {
    const store = await this.store('overlays', 'readwrite');
    if (!store) return this.fallback.saveOverlay(key, overlay);
    await request(store.put(overlay, key));
  }

  async loadBlobText(sha: string): Promise<string | null | undefined> {
    const store = await this.store('blobs', 'readonly');
    if (!store) return this.fallback.loadBlobText(sha);
    const found = (await request(store.get(sha))) as { text: string | null } | undefined;
    return found ? found.text : undefined;
  }

  async saveBlobText(sha: string, text: string | null): Promise<void> {
    const store = await this.store('blobs', 'readwrite');
    if (!store) return this.fallback.saveBlobText(sha, text);
    await request(store.put({ text }, sha));
  }
}
