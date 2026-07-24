/**
 * User-directed Crowdy Studio layout state: which panes are visible and how
 * large they are. The editor is the only always-visible surface; the explorer,
 * project settings, agent dock, and bottom panel are toggled by the person
 * using the Studio and their choices persist locally.
 */

export type StudioPaneId = 'explorer' | 'settings' | 'agent' | 'bottom';

export interface StudioPaneSizeRange {
  readonly min: number;
  readonly max: number;
}

export interface StudioLayoutState {
  readonly visible: Readonly<Record<StudioPaneId, boolean>>;
  /** Pixel widths for side panes; pixel height for the bottom panel. */
  readonly sizes: Readonly<Record<StudioPaneId, number>>;
}

export type StudioLayoutListener = (state: StudioLayoutState) => void;

export type StudioLayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface StudioLayoutControllerOptions {
  storage?: StudioLayoutStorage | null;
  storageKey?: string;
  defaults?: Partial<StudioLayoutState>;
}

export const STUDIO_LAYOUT_STORAGE_KEY = 'ck:crowdy-studio:layout:v1';

export const STUDIO_PANE_IDS: readonly StudioPaneId[] = [
  'explorer',
  'settings',
  'agent',
  'bottom',
];

const DEFAULT_VISIBLE: Readonly<Record<StudioPaneId, boolean>> = {
  explorer: true,
  settings: false,
  agent: false,
  bottom: false,
};

const DEFAULT_SIZES: Readonly<Record<StudioPaneId, number>> = {
  explorer: 230,
  settings: 280,
  agent: 340,
  bottom: 180,
};

const SIZE_RANGES: Readonly<Record<StudioPaneId, StudioPaneSizeRange>> = {
  explorer: { min: 160, max: 480 },
  settings: { min: 220, max: 480 },
  agent: { min: 280, max: 620 },
  bottom: { min: 96, max: 480 },
};

export function studioPaneSizeRange(pane: StudioPaneId): StudioPaneSizeRange {
  return SIZE_RANGES[pane];
}

export function clampStudioPaneSize(pane: StudioPaneId, size: number): number {
  const range = SIZE_RANGES[pane];
  if (!Number.isFinite(size)) return DEFAULT_SIZES[pane];
  return Math.round(Math.min(range.max, Math.max(range.min, size)));
}

/**
 * Headless layout state machine. DOM shells subscribe and translate the state
 * into CSS variables / hidden attributes; tests drive it directly.
 */
export class StudioLayoutController {
  private readonly storage: StudioLayoutStorage | null;
  private readonly storageKey: string;
  private readonly listeners = new Set<StudioLayoutListener>();
  private visible: Record<StudioPaneId, boolean>;
  private sizes: Record<StudioPaneId, number>;

  constructor(options: StudioLayoutControllerOptions = {}) {
    this.storage =
      options.storage !== undefined ? options.storage : safeLocalStorage();
    this.storageKey = options.storageKey ?? STUDIO_LAYOUT_STORAGE_KEY;
    this.visible = { ...DEFAULT_VISIBLE, ...options.defaults?.visible };
    this.sizes = { ...DEFAULT_SIZES };
    if (options.defaults?.sizes) {
      for (const pane of STUDIO_PANE_IDS) {
        const size = options.defaults.sizes[pane];
        if (size !== undefined) this.sizes[pane] = clampStudioPaneSize(pane, size);
      }
    }
    this.loadPersisted();
  }

  getState(): StudioLayoutState {
    return { visible: { ...this.visible }, sizes: { ...this.sizes } };
  }

  isVisible(pane: StudioPaneId): boolean {
    return this.visible[pane];
  }

  paneSize(pane: StudioPaneId): number {
    return this.sizes[pane];
  }

  subscribe(listener: StudioLayoutListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setVisible(pane: StudioPaneId, visible: boolean): void {
    if (this.visible[pane] === visible) return;
    this.visible = { ...this.visible, [pane]: visible };
    this.persist();
    this.emit();
  }

  toggle(pane: StudioPaneId): void {
    this.setVisible(pane, !this.visible[pane]);
  }

  setSize(pane: StudioPaneId, size: number, persist = true): void {
    const next = clampStudioPaneSize(pane, size);
    if (this.sizes[pane] === next) {
      if (persist) this.persist();
      return;
    }
    this.sizes = { ...this.sizes, [pane]: next };
    if (persist) this.persist();
    this.emit();
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of [...this.listeners]) listener(state);
  }

  private loadPersisted(): void {
    if (!this.storage) return;
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.storageKey);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const record = parsed as {
        visible?: Record<string, unknown>;
        sizes?: Record<string, unknown>;
      };
      for (const pane of STUDIO_PANE_IDS) {
        const visible = record.visible?.[pane];
        if (typeof visible === 'boolean') this.visible[pane] = visible;
        const size = record.sizes?.[pane];
        if (typeof size === 'number' && Number.isFinite(size)) {
          this.sizes[pane] = clampStudioPaneSize(pane, size);
        }
      }
    } catch {
      // Ignore corrupt persisted layout; defaults remain in effect.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({ visible: this.visible, sizes: this.sizes }),
      );
    } catch {
      // Storage can be unavailable (private mode); layout stays session-only.
    }
  }
}

function safeLocalStorage(): StudioLayoutStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
