import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom,
  setViewport,
  teardownDom,
  recorder,
} from './fixtures/embed-dom.mjs';

const {
  CROWDY_STUDIO_EMBED_DOCK_WIDTH_STORAGE_KEY,
  CrowdyStudioEmbedDock,
  clampCrowdyStudioEmbedDockWidth,
  crowdyStudioEmbedDockWidthRange,
} = await import('../../dist/crowdy-studio/embed/dock.js');

let window;

beforeEach(() => {
  window = setupDom({ width: 1_200 });
  window.localStorage.clear();
});

afterEach(() => {
  teardownDom(window);
});

test('dock starts at 52vw and exposes an accessible vertical separator', () => {
  const changed = recorder();
  const dock = new CrowdyStudioEmbedDock(changed);
  document.body.appendChild(dock.separator);

  dock.activate();

  assert.equal(dock.width, 624);
  assert.deepEqual(changed.calls.at(-1), [624]);
  assert.equal(dock.separator.hidden, false);
  assert.equal(dock.separator.getAttribute('role'), 'separator');
  assert.equal(dock.separator.getAttribute('aria-orientation'), 'vertical');
  assert.equal(dock.separator.getAttribute('aria-valuemin'), '480');
  assert.equal(dock.separator.getAttribute('aria-valuemax'), '780');
  assert.equal(dock.separator.getAttribute('aria-valuenow'), '624');
  assert.ok(
    dock.separator.getAttribute('aria-valuetext').includes('game 576 pixels'),
  );
  dock.destroy();
});

test('dock supports bounded keyboard resizing and persists the chosen width', () => {
  const dock = new CrowdyStudioEmbedDock(() => {});
  document.body.appendChild(dock.separator);
  dock.activate();

  dock.separator.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }),
  );
  assert.equal(dock.width, 640);

  dock.separator.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Home', bubbles: true }),
  );
  assert.equal(dock.width, 480);

  dock.separator.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'End', bubbles: true }),
  );
  assert.equal(dock.width, 780);
  assert.equal(
    window.localStorage.getItem(CROWDY_STUDIO_EMBED_DOCK_WIDTH_STORAGE_KEY),
    '780',
  );
  dock.destroy();

  const restored = new CrowdyStudioEmbedDock(() => {});
  restored.activate();
  assert.equal(restored.width, 780);
  restored.destroy();
});

test('dock tracks pointer drag position and clamps both pane minimums', () => {
  const changed = recorder();
  const dock = new CrowdyStudioEmbedDock(changed);
  document.body.appendChild(dock.separator);
  dock.activate();

  dock.separator.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 500,
      pointerId: 7,
    }),
  );
  assert.equal(dock.width, 700);
  assert.ok(
    document.body.className.includes('ck-crowdy-studio-embed-resizing'),
  );

  dock.separator.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 50,
      pointerId: 7,
    }),
  );
  assert.equal(dock.width, 780);

  dock.separator.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      button: 0,
      clientX: 1_100,
      pointerId: 7,
    }),
  );
  assert.equal(dock.width, 480);
  assert.ok(
    !document.body.className.includes('ck-crowdy-studio-embed-resizing'),
  );
  assert.equal(
    window.localStorage.getItem(CROWDY_STUDIO_EMBED_DOCK_WIDTH_STORAGE_KEY),
    '480',
  );
  dock.destroy();
});

test('dock re-clamps a persisted preference when the viewport changes', () => {
  window.localStorage.setItem(
    CROWDY_STUDIO_EMBED_DOCK_WIDTH_STORAGE_KEY,
    '900',
  );
  const dock = new CrowdyStudioEmbedDock(() => {});
  dock.activate();
  assert.equal(dock.width, 780);

  setViewport(window, 1_050);
  dock.refresh();
  assert.equal(dock.width, 630);
  assert.deepEqual(crowdyStudioEmbedDockWidthRange(), { min: 480, max: 630 });
  assert.equal(clampCrowdyStudioEmbedDockWidth(200), 480);
  dock.destroy();
});
