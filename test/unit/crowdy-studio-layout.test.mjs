import test from 'node:test';
import assert from 'node:assert/strict';

const {
  StudioLayoutController,
  STUDIO_LAYOUT_STORAGE_KEY,
  STUDIO_PANE_IDS,
  clampStudioPaneSize,
  studioPaneSizeRange,
} = await import('../../dist/crowdy-studio/layout.js');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test('defaults are editor-first: only the explorer is visible', () => {
  const layout = new StudioLayoutController({ storage: null });
  assert.equal(layout.isVisible('explorer'), true);
  assert.equal(layout.isVisible('settings'), false);
  assert.equal(layout.isVisible('agent'), false);
  assert.equal(layout.isVisible('bottom'), false);
});

test('toggle flips visibility and notifies subscribers once per change', () => {
  const layout = new StudioLayoutController({ storage: null });
  const seen = [];
  const unsubscribe = layout.subscribe((state) => seen.push(state));
  layout.toggle('settings');
  assert.equal(layout.isVisible('settings'), true);
  layout.setVisible('settings', true); // no-op must not emit
  layout.toggle('settings');
  assert.equal(layout.isVisible('settings'), false);
  assert.equal(seen.length, 2);
  unsubscribe();
  layout.toggle('settings');
  assert.equal(seen.length, 2);
});

test('sizes clamp to the pane range', () => {
  const layout = new StudioLayoutController({ storage: null });
  for (const pane of STUDIO_PANE_IDS) {
    const range = studioPaneSizeRange(pane);
    layout.setSize(pane, range.max + 1000);
    assert.equal(layout.paneSize(pane), range.max);
    layout.setSize(pane, range.min - 1000);
    assert.equal(layout.paneSize(pane), range.min);
    assert.equal(clampStudioPaneSize(pane, Number.NaN) >= range.min, true);
  }
});

test('visibility and sizes persist and restore through storage', () => {
  const storage = memoryStorage();
  const first = new StudioLayoutController({ storage });
  first.setVisible('bottom', true);
  first.setSize('explorer', 300);
  assert.equal(storage.values.has(STUDIO_LAYOUT_STORAGE_KEY), true);

  const second = new StudioLayoutController({ storage });
  assert.equal(second.isVisible('bottom'), true);
  assert.equal(second.paneSize('explorer'), 300);
});

test('uncommitted resizes update state without persisting', () => {
  const storage = memoryStorage();
  const layout = new StudioLayoutController({ storage });
  layout.setSize('agent', 400, false);
  assert.equal(layout.paneSize('agent'), 400);
  assert.equal(storage.values.has(STUDIO_LAYOUT_STORAGE_KEY), false);
  layout.setSize('agent', 400, true);
  assert.equal(storage.values.has(STUDIO_LAYOUT_STORAGE_KEY), true);
});

test('corrupt or foreign persisted layout falls back to defaults', () => {
  for (const raw of ['not json', '42', JSON.stringify({ visible: { explorer: 'yes' }, sizes: { explorer: 'wide' } })]) {
    const storage = memoryStorage({ [STUDIO_LAYOUT_STORAGE_KEY]: raw });
    const layout = new StudioLayoutController({ storage });
    assert.equal(layout.isVisible('explorer'), true);
    assert.equal(layout.paneSize('explorer'), 230);
  }
});

test('persisted out-of-range sizes are clamped on load', () => {
  const storage = memoryStorage({
    [STUDIO_LAYOUT_STORAGE_KEY]: JSON.stringify({
      visible: { settings: true },
      sizes: { settings: 10_000, bottom: 1 },
    }),
  });
  const layout = new StudioLayoutController({ storage });
  assert.equal(layout.isVisible('settings'), true);
  assert.equal(layout.paneSize('settings'), studioPaneSizeRange('settings').max);
  assert.equal(layout.paneSize('bottom'), studioPaneSizeRange('bottom').min);
});
