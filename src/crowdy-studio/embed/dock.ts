/**
 * Accessible splitter and persisted width state for the game/studio embed
 * dock. Layout ownership stays with the embed panel through the width
 * callback: the dock only decides "how wide", never "where".
 *
 * Ported from the proven Blocks with Friends dock so every game embedding
 * Crowdy Studio gets the same keyboard/pointer resize semantics.
 */

export const CROWDY_STUDIO_EMBED_NARROW_BREAKPOINT_PX = 1_000;
export const CROWDY_STUDIO_EMBED_DEFAULT_DOCK_RATIO = 0.52;
export const CROWDY_STUDIO_EMBED_MIN_DOCK_WIDTH_PX = 480;
export const CROWDY_STUDIO_EMBED_MIN_GAME_WIDTH_PX = 420;
export const CROWDY_STUDIO_EMBED_SPLITTER_WIDTH_PX = 10;
export const CROWDY_STUDIO_EMBED_DOCK_WIDTH_STORAGE_KEY =
  'ck:crowdy-studio:embed:dock-width:v1';

const KEYBOARD_STEP_PX = 16;
const KEYBOARD_LARGE_STEP_PX = 48;

export interface CrowdyStudioEmbedDockWidthRange {
  min: number;
  max: number;
}

export type CrowdyStudioEmbedDockStorage = Pick<
  Storage,
  'getItem' | 'setItem'
>;

/**
 * Width bounds for the right-hand studio dock. The desktop breakpoint ensures
 * these minimums do not conflict in normal use; the defensive Math.min keeps
 * direct callers safe in unusually small test or embedded viewports.
 */
export function crowdyStudioEmbedDockWidthRange(
  viewportWidth = window.innerWidth,
): CrowdyStudioEmbedDockWidthRange {
  const max = Math.max(
    CROWDY_STUDIO_EMBED_SPLITTER_WIDTH_PX,
    Math.floor(viewportWidth - CROWDY_STUDIO_EMBED_MIN_GAME_WIDTH_PX),
  );
  return {
    min: Math.min(CROWDY_STUDIO_EMBED_MIN_DOCK_WIDTH_PX, max),
    max,
  };
}

export function clampCrowdyStudioEmbedDockWidth(
  width: number,
  viewportWidth = window.innerWidth,
): number {
  const range = crowdyStudioEmbedDockWidthRange(viewportWidth);
  return Math.round(Math.min(range.max, Math.max(range.min, width)));
}

export class CrowdyStudioEmbedDock {
  readonly separator: HTMLDivElement;
  private preferredWidth: number;
  private currentWidth = 0;
  private active = false;
  private draggingPointerId: number | null = null;

  constructor(
    private readonly onWidthChange: (width: number) => void,
    private readonly storage: CrowdyStudioEmbedDockStorage | null = safeLocalStorage(),
  ) {
    this.preferredWidth =
      this.loadPersistedWidth() ??
      Math.round(window.innerWidth * CROWDY_STUDIO_EMBED_DEFAULT_DOCK_RATIO);

    const separator = document.createElement('div');
    separator.className = 'ck-crowdy-studio-embed-separator';
    separator.hidden = true;
    separator.tabIndex = 0;
    separator.setAttribute('role', 'separator');
    separator.setAttribute('aria-orientation', 'vertical');
    separator.setAttribute('aria-label', 'Resize Crowdy Studio dock');
    separator.title = 'Resize Crowdy Studio (Left/Right arrows, Home/End)';
    separator.addEventListener('keydown', this.keyDown);
    separator.addEventListener('pointerdown', this.pointerDown);
    separator.addEventListener('pointermove', this.pointerMove);
    separator.addEventListener('pointerup', this.pointerUp);
    separator.addEventListener('pointercancel', this.pointerCancel);
    separator.addEventListener('lostpointercapture', this.pointerCancel);
    this.separator = separator;
    this.updateAria();
  }

  get width(): number {
    return this.currentWidth;
  }

  activate(): void {
    this.active = true;
    this.separator.hidden = false;
    this.applyPreferredWidth(true);
  }

  deactivate(): void {
    this.active = false;
    this.separator.hidden = true;
    this.stopDragging();
  }

  /** Re-clamp the preferred width after a viewport resize. */
  refresh(): void {
    if (!this.active) {
      this.updateAria();
      return;
    }
    this.applyPreferredWidth(false);
  }

  destroy(): void {
    this.deactivate();
    this.separator.removeEventListener('keydown', this.keyDown);
    this.separator.removeEventListener('pointerdown', this.pointerDown);
    this.separator.removeEventListener('pointermove', this.pointerMove);
    this.separator.removeEventListener('pointerup', this.pointerUp);
    this.separator.removeEventListener('pointercancel', this.pointerCancel);
    this.separator.removeEventListener(
      'lostpointercapture',
      this.pointerCancel,
    );
    this.separator.remove();
  }

  private applyPreferredWidth(force: boolean): void {
    const next = clampCrowdyStudioEmbedDockWidth(this.preferredWidth);
    const changed = next !== this.currentWidth;
    this.currentWidth = next;
    this.updateAria();
    if (changed || force) this.onWidthChange(next);
  }

  private setPreferredWidth(width: number, persist: boolean): void {
    this.preferredWidth = clampCrowdyStudioEmbedDockWidth(width);
    this.applyPreferredWidth(false);
    if (persist) this.persistWidth();
  }

  private updateAria(): void {
    const range = crowdyStudioEmbedDockWidthRange();
    const width =
      this.currentWidth ||
      clampCrowdyStudioEmbedDockWidth(this.preferredWidth);
    const gameWidth = Math.max(0, window.innerWidth - width);
    this.separator.setAttribute('aria-valuemin', String(range.min));
    this.separator.setAttribute('aria-valuemax', String(range.max));
    this.separator.setAttribute('aria-valuenow', String(width));
    this.separator.setAttribute(
      'aria-valuetext',
      `Crowdy Studio ${width} pixels; game ${gameWidth} pixels`,
    );
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (!this.active) return;
    const range = crowdyStudioEmbedDockWidthRange();
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP_PX : KEYBOARD_STEP_PX;
    let next: number | null = null;
    if (event.code === 'ArrowLeft') next = this.currentWidth + step;
    else if (event.code === 'ArrowRight') next = this.currentWidth - step;
    else if (event.code === 'Home') next = range.min;
    else if (event.code === 'End') next = range.max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.setPreferredWidth(next, true);
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.active || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.draggingPointerId = event.pointerId;
    this.separator.dataset.dragging = 'true';
    addBodyClass('ck-crowdy-studio-embed-resizing');
    try {
      this.separator.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser tests and older engines may not expose capture.
    }
    this.setPreferredWidth(window.innerWidth - event.clientX, false);
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.draggingPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.setPreferredWidth(window.innerWidth - event.clientX, false);
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.draggingPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.setPreferredWidth(window.innerWidth - event.clientX, true);
    this.stopDragging();
  };

  private readonly pointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.draggingPointerId) return;
    event.stopPropagation();
    this.persistWidth();
    this.stopDragging();
  };

  private stopDragging(): void {
    const pointerId = this.draggingPointerId;
    this.draggingPointerId = null;
    this.separator.dataset.dragging = 'false';
    removeBodyClass('ck-crowdy-studio-embed-resizing');
    if (pointerId === null) return;
    try {
      if (this.separator.hasPointerCapture(pointerId)) {
        this.separator.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture is an enhancement; width and persistence do not depend on it.
    }
  }

  private loadPersistedWidth(): number | null {
    if (!this.storage) return null;
    try {
      const parsed = Number(
        this.storage.getItem(CROWDY_STUDIO_EMBED_DOCK_WIDTH_STORAGE_KEY),
      );
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private persistWidth(): void {
    if (!this.storage || this.currentWidth <= 0) return;
    try {
      this.storage.setItem(
        CROWDY_STUDIO_EMBED_DOCK_WIDTH_STORAGE_KEY,
        String(this.currentWidth),
      );
    } catch {
      // Storage can be unavailable in private/embedded contexts; resizing
      // remains fully functional for the current session.
    }
  }
}

export function addBodyClass(name: string): void {
  const classes = new Set(
    document.body.className.split(/\s+/u).filter(Boolean),
  );
  classes.add(name);
  document.body.className = [...classes].join(' ');
}

export function removeBodyClass(...names: readonly string[]): void {
  const remove = new Set(names);
  document.body.className = document.body.className
    .split(/\s+/u)
    .filter((value) => value && !remove.has(value))
    .join(' ');
}

function safeLocalStorage(): CrowdyStudioEmbedDockStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
