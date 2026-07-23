import test from 'node:test';
import assert from 'node:assert/strict';

test('Crowdy Studio relayout follows host resize and disconnects cleanly', async () => {
  const previousObserver = globalThis.ResizeObserver;
  let callback = null;
  let observed = null;
  let disconnects = 0;
  class FakeResizeObserver {
    constructor(next) {
      callback = next;
    }

    observe(target) {
      observed = target;
    }

    disconnect() {
      disconnects += 1;
    }
  }
  globalThis.ResizeObserver = FakeResizeObserver;

  try {
    const { observeCrowdyStudioEditorLayout } = await import(
      '../../dist/crowdy-studio/mount.js'
    );
    const host = {};
    let firstLayouts = 0;
    let secondLayouts = 0;
    let editor = { layout: () => (firstLayouts += 1) };
    const stop = observeCrowdyStudioEditorLayout(host, () => editor);

    assert.equal(observed, host);
    callback([]);
    callback([]);
    await Promise.resolve();
    assert.equal(firstLayouts, 1, 'same-turn resize notifications are coalesced');

    editor = { layout: () => (secondLayouts += 1) };
    callback([]);
    await Promise.resolve();
    assert.equal(secondLayouts, 1, 'observer uses the recovered editor adapter');

    stop();
    stop();
    callback([]);
    await Promise.resolve();
    assert.equal(disconnects, 1);
    assert.equal(secondLayouts, 1, 'no relayout occurs after disconnect');
  } finally {
    if (previousObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previousObserver;
  }
});

test('Crowdy Studio styles size to their host and respond to container width', async () => {
  const { CROWDY_STUDIO_STYLES } = await import(
    '../../dist/crowdy-studio/styles.js'
  );

  assert.match(CROWDY_STUDIO_STYLES, /container-type:inline-size/);
  assert.match(CROWDY_STUDIO_STYLES, /height:100%;min-height:0/);
  assert.match(CROWDY_STUDIO_STYLES, /@container\(max-width:900px\)/);
  assert.doesNotMatch(CROWDY_STUDIO_STYLES, /min-height:680px/);
});
