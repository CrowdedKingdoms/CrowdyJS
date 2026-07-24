/**
 * Reusable accessible pane splitter for Crowdy Studio panes. Pointer drag plus
 * Arrow/Home/End keyboard resizing, mirroring the behavior games already ship
 * for the game/studio dock separator.
 */

export interface PaneSplitterRange {
  readonly min: number;
  readonly max: number;
}

export interface PaneSplitterOptions {
  /** `vertical` separators resize widths; `horizontal` separators heights. */
  orientation: 'vertical' | 'horizontal';
  /**
   * Where the sized pane sits relative to the separator in document order:
   * `before` (explorer to its left / panel above) grows as the pointer moves
   * right/down; `after` (right-hand or bottom panes) grows in the opposite
   * direction.
   */
  pane: 'before' | 'after';
  label: string;
  range(): PaneSplitterRange;
  getSize(): number;
  /** `commit` is true for the final size of a gesture (persist it). */
  setSize(size: number, commit: boolean): void;
}

export interface PaneSplitterHandle {
  readonly element: HTMLDivElement;
  /** Re-sync ARIA values after external size or range changes. */
  refresh(): void;
  dispose(): void;
}

const KEYBOARD_STEP_PX = 16;
const KEYBOARD_LARGE_STEP_PX = 48;

export function createPaneSplitter(
  options: PaneSplitterOptions,
): PaneSplitterHandle {
  const element = document.createElement('div');
  element.className = 'ck-crowdy-studio-splitter';
  element.dataset.orientation = options.orientation;
  element.tabIndex = 0;
  element.setAttribute('role', 'separator');
  element.setAttribute(
    'aria-orientation',
    options.orientation === 'vertical' ? 'vertical' : 'horizontal',
  );
  element.setAttribute('aria-label', options.label);
  element.title =
    options.orientation === 'vertical'
      ? `${options.label} (Left/Right arrows, Home/End)`
      : `${options.label} (Up/Down arrows, Home/End)`;

  let draggingPointerId: number | null = null;
  let dragStartCoord = 0;
  let dragStartSize = 0;

  const direction = options.pane === 'before' ? 1 : -1;

  const refresh = (): void => {
    const range = options.range();
    element.setAttribute('aria-valuemin', String(range.min));
    element.setAttribute('aria-valuemax', String(range.max));
    element.setAttribute('aria-valuenow', String(Math.round(options.getSize())));
  };

  const apply = (size: number, commit: boolean): void => {
    const range = options.range();
    const next = Math.round(Math.min(range.max, Math.max(range.min, size)));
    options.setSize(next, commit);
    refresh();
  };

  const pointerCoord = (event: PointerEvent): number =>
    options.orientation === 'vertical' ? event.clientX : event.clientY;

  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    draggingPointerId = event.pointerId;
    dragStartCoord = pointerCoord(event);
    dragStartSize = options.getSize();
    element.dataset.dragging = 'true';
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser tests and older engines may not expose capture.
    }
  };

  const pointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== draggingPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = pointerCoord(event) - dragStartCoord;
    apply(dragStartSize + direction * delta, false);
  };

  const pointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== draggingPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = pointerCoord(event) - dragStartCoord;
    apply(dragStartSize + direction * delta, true);
    stopDragging();
  };

  const pointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== draggingPointerId) return;
    event.stopPropagation();
    apply(options.getSize(), true);
    stopDragging();
  };

  const stopDragging = (): void => {
    const pointerId = draggingPointerId;
    draggingPointerId = null;
    element.dataset.dragging = 'false';
    if (pointerId === null) return;
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture is an enhancement; sizing does not depend on it.
    }
  };

  const keyDown = (event: KeyboardEvent): void => {
    const range = options.range();
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP_PX : KEYBOARD_STEP_PX;
    const grow =
      options.orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
    const shrink =
      options.orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
    let next: number | null = null;
    if (event.code === grow) next = options.getSize() + direction * step;
    else if (event.code === shrink) next = options.getSize() - direction * step;
    else if (event.code === 'Home') next = range.min;
    else if (event.code === 'End') next = range.max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    apply(next, true);
  };

  element.addEventListener('pointerdown', pointerDown);
  element.addEventListener('pointermove', pointerMove);
  element.addEventListener('pointerup', pointerUp);
  element.addEventListener('pointercancel', pointerCancel);
  element.addEventListener('lostpointercapture', pointerCancel);
  element.addEventListener('keydown', keyDown);
  refresh();

  return {
    element,
    refresh,
    dispose(): void {
      stopDragging();
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerup', pointerUp);
      element.removeEventListener('pointercancel', pointerCancel);
      element.removeEventListener('lostpointercapture', pointerCancel);
      element.removeEventListener('keydown', keyDown);
      element.remove();
    },
  };
}
