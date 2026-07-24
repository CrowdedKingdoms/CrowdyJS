import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom,
  setViewport,
  teardownDom,
  waitFor,
  recorder,
  sampleProvider,
  sampleCompute,
} from './fixtures/embed-dom.mjs';

const { CrowdyStudioEmbed, createCrowdyStudioEmbed } = await import(
  '../../dist/crowdy-studio/embed/panel.js'
);
const { CrowdyStudioTextHud } = await import(
  '../../dist/crowdy-studio/embed/hud-layer.js'
);

let window;

beforeEach(() => {
  window = setupDom({ width: 1_440 });
  window.localStorage.clear();
});

afterEach(() => {
  teardownDom(window);
});

function makeEmbed(overrides = {}) {
  const provider = overrides.provider ?? sampleProvider();
  const restore = recorder();
  const suppress = recorder(() => restore);
  const layout = recorder();
  const agentMounted = recorder();
  const agentUnavailable = recorder();
  const agentUnmounted = recorder();
  const embed = new CrowdyStudioEmbed({
    client: {
      crowdyStudio: provider,
      playerCompute: sampleCompute(),
    },
    appId: () => '2',
    gameName: 'Example Game',
    suppressGameplayInput: suppress,
    onLayoutChange: layout,
    onAgentMounted: agentMounted,
    onAgentUnavailable: agentUnavailable,
    onAgentUnmounted: agentUnmounted,
    ...overrides.options,
  });
  return {
    embed,
    provider,
    restore,
    suppress,
    layout,
    agentMounted,
    agentUnavailable,
    agentUnmounted,
  };
}

function embedContext(overrides = {}) {
  return {
    gridId: '9001',
    grid: {
      low: { x: 2n, y: 1n, z: 2n },
      high: { x: 5n, y: 3n, z: 7n },
    },
    targetPermissions: {
      SERVER: { canWrite: true, canRun: true },
      CLIENT: { canWrite: true, canRun: false },
    },
    permissionsNote: 'Authoritative effective grid keys',
    ...overrides,
  };
}

async function waitForMounted() {
  await waitFor(() => {
    const status = document.querySelector('.ck-crowdy-studio-embed-status');
    assert.ok(status, 'status element missing');
    assert.ok(status.className.includes('hidden'), 'studio still loading');
  });
}

/**
 * Let an in-flight studio mount finish (and be destroyed by the panel's
 * generation check) before the test tears the DOM down; otherwise its late
 * async completion runs against a dead window and leaks timers.
 */
async function settleLateMount() {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

test('opens the desktop studio as a non-modal dock with explicit runtime copy', async () => {
  const previous = document.createElement('button');
  previous.textContent = 'Resume game';
  document.body.appendChild(previous);
  previous.focus();
  const { embed, provider, suppress, restore, layout, agentMounted } =
    makeEmbed();

  embed.toggle(embedContext());

  const dialog = document.querySelector('.ck-crowdy-studio-embed');
  assert.equal(embed.mode, 'docked');
  assert.equal(embed.modal, false);
  assert.equal(dialog.getAttribute('role'), 'complementary');
  assert.equal(dialog.hasAttribute('aria-modal'), false);
  assert.ok(dialog.className.includes('is-docked'));
  assert.equal(
    dialog.getAttribute('aria-labelledby'),
    'ck-crowdy-studio-embed-title',
  );
  assert.equal(
    dialog.getAttribute('aria-describedby'),
    'ck-crowdy-studio-embed-description',
  );
  assert.equal(
    document.activeElement,
    document.querySelector('.ck-crowdy-studio-embed-close'),
  );
  assert.ok(
    document
      .querySelector('.ck-crowdy-studio-embed-status')
      .textContent.includes('Opening your projects'),
  );
  assert.ok(
    document.body.textContent.includes(
      'Edits autosave; Test draft or Deploy live applies them.',
    ),
  );
  assert.ok(document.body.textContent.includes('Example Game'));
  // Context details live in an on-demand drawer, hidden by default.
  const drawer = document.querySelector('.ck-crowdy-studio-embed-drawer');
  assert.equal(drawer.hidden, true);
  const contextToggle = document.querySelector(
    '.ck-crowdy-studio-embed-context-toggle',
  );
  assert.equal(contextToggle.getAttribute('aria-expanded'), 'false');
  contextToggle.click();
  assert.equal(drawer.hidden, false);
  assert.equal(contextToggle.getAttribute('aria-expanded'), 'true');
  assert.ok(drawer.textContent.includes('Effective permissions'));
  assert.ok(drawer.textContent.includes('Authoritative effective grid keys'));
  assert.ok(drawer.textContent.includes('2, 1, 2'));
  contextToggle.click();
  assert.equal(drawer.hidden, true);
  assert.equal(
    document
      .querySelector('.ck-crowdy-studio-embed-separator')
      .getAttribute('role'),
    'separator',
  );
  assert.ok(document.body.className.includes('ck-crowdy-studio-embed-docked'));
  assert.equal(
    document.body.style.getPropertyValue('--ck-game-right-inset'),
    '749px',
  );
  assert.equal(suppress.calls.length, 0);
  assert.ok(layout.calls.length > 0);

  await waitForMounted();
  // The real SDK studio mounted inside the panel with the game client wired
  // through: project data must be visible and scoped to the app/grid.
  assert.ok(document.querySelector('.ck-crowdy-studio'));
  assert.deepEqual(provider.listProjectsCalls.at(0), {
    appId: '2',
    gridId: '9001',
  });
  assert.equal(agentMounted.calls.length, 1);
  const handle = agentMounted.calls[0][0];
  assert.equal(handle.api, 'crowdy-studio');
  assert.equal(dialog.dataset.crowdyStudioApi, 'crowdy-studio');

  embed.close();
  assert.equal(restore.calls.length, 0);
  assert.equal(document.activeElement, previous);
  assert.ok(!document.body.className.includes('ck-crowdy-studio-embed-open'));
  assert.equal(
    document.body.style.getPropertyValue('--ck-game-right-inset'),
    '',
  );
  assert.equal(document.querySelector('.ck-crowdy-studio'), null);
});

test('shows a recoverable mount error and retries without losing the panel', async () => {
  const provider = sampleProvider();
  let failures = 1;
  const failingProvider = {
    ...provider,
    listProjectsCalls: provider.listProjectsCalls,
    async listProjects(scope) {
      if (failures > 0) {
        failures--;
        throw new Error('projects service unavailable');
      }
      return provider.listProjects(scope);
    },
  };
  const { embed, agentUnavailable } = makeEmbed({
    provider: failingProvider,
  });

  embed.toggle(embedContext());

  await waitFor(() => {
    assert.ok(
      document
        .querySelector('.ck-crowdy-studio-embed-status')
        .textContent.includes('projects service unavailable'),
    );
  });
  assert.ok(
    document.body.textContent.includes('Your grid access is unchanged'),
  );
  assert.equal(agentUnavailable.calls.length, 1);
  document.querySelector('.ck-crowdy-studio-embed-retry').click();
  await waitForMounted();
  assert.equal(embed.open, true);
  embed.close();
});

test('keeps editor close-key input, closes from chrome, and closes with Escape', async () => {
  const { embed } = makeEmbed();
  const gameplayKey = recorder();
  window.addEventListener('keydown', gameplayKey);
  embed.toggle(embedContext());
  await waitForMounted();
  const mount = document.querySelector('.ck-crowdy-studio-embed-mount');
  const editor = document.createElement('div');
  editor.className = 'ck-crowdy-studio-editor monaco-editor';
  const textbox = document.createElement('textarea');
  editor.appendChild(textbox);
  mount.appendChild(editor);

  textbox.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }),
  );
  assert.equal(embed.open, true);
  assert.equal(gameplayKey.calls.length, 0);

  document
    .querySelector('.ck-crowdy-studio-embed-header')
    .dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
  assert.equal(embed.open, false);

  embed.toggle(embedContext());
  await waitForMounted();
  document
    .querySelector('.ck-crowdy-studio-embed')
    .dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }),
    );
  assert.equal(embed.open, false);
  window.removeEventListener('keydown', gameplayKey);
});

test('a custom close key replaces the default KeyM binding', async () => {
  const { embed } = makeEmbed({ options: { closeKeyCode: 'KeyJ' } });
  embed.toggle(embedContext());
  await waitForMounted();

  document
    .querySelector('.ck-crowdy-studio-embed-header')
    .dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
  assert.equal(embed.open, true);
  document
    .querySelector('.ck-crowdy-studio-embed-header')
    .dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', bubbles: true }));
  assert.equal(embed.open, false);
});

test('lets game-focused Escape and the close key reach gameplay while docked', async () => {
  const gameCanvas = document.createElement('canvas');
  gameCanvas.tabIndex = 0;
  document.body.appendChild(gameCanvas);
  const gameplayKey = recorder();
  window.addEventListener('keydown', gameplayKey);
  const { embed } = makeEmbed();
  embed.toggle(embedContext());
  await waitForMounted();

  gameCanvas.focus();
  gameCanvas.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }),
  );
  gameCanvas.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }),
  );

  assert.equal(embed.open, true);
  assert.equal(gameplayKey.calls.length, 2);
  embed.close();
  window.removeEventListener('keydown', gameplayKey);
});

test('applies splitter bounds to the game inset and restores persisted width', async () => {
  setViewport(window, 1_200);
  const { embed, layout } = makeEmbed();
  embed.toggle(embedContext());
  await waitForMounted();
  const separator = document.querySelector(
    '.ck-crowdy-studio-embed-separator',
  );

  separator.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Home', bubbles: true }),
  );
  assert.equal(
    document.body.style.getPropertyValue('--ck-game-right-inset'),
    '480px',
  );
  separator.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'End', bubbles: true }),
  );
  assert.equal(
    document.body.style.getPropertyValue('--ck-game-right-inset'),
    '780px',
  );
  assert.ok(layout.calls.length >= 3);

  embed.close();
  embed.toggle(embedContext());
  await waitForMounted();
  assert.equal(
    document.body.style.getPropertyValue('--ck-game-right-inset'),
    '780px',
  );
  embed.close();
});

test('switches safely between docked and fullscreen modes without remounting', async () => {
  const { embed, provider, suppress, restore, layout } = makeEmbed();
  embed.toggle(embedContext());
  await waitForMounted();
  assert.equal(provider.listProjectsCalls.length, 1);

  setViewport(window, 900);
  window.dispatchEvent(new Event('resize'));
  assert.equal(embed.mode, 'fullscreen');
  assert.equal(embed.modal, true);
  assert.equal(suppress.calls.length, 1);
  assert.ok(
    document.body.className.includes('ck-crowdy-studio-embed-fullscreen'),
  );
  assert.equal(
    document.querySelector('.ck-crowdy-studio-embed-separator').hidden,
    true,
  );

  setViewport(window, 1_300);
  window.dispatchEvent(new Event('resize'));
  assert.equal(embed.mode, 'docked');
  assert.equal(embed.modal, false);
  assert.equal(restore.calls.length, 1);
  assert.ok(document.body.className.includes('ck-crowdy-studio-embed-docked'));
  // The studio itself must not have remounted across the mode change.
  assert.equal(provider.listProjectsCalls.length, 1);
  assert.ok(layout.calls.length >= 3);

  embed.close();
  assert.equal(restore.calls.length, 1);
  assert.equal(document.querySelector('.ck-crowdy-studio'), null);
});

test('traps focus inside the dialog and restores it on close', async () => {
  setViewport(window, 900);
  const outside = document.createElement('button');
  document.body.appendChild(outside);
  outside.focus();
  const { embed, suppress, restore } = makeEmbed();
  embed.toggle(embedContext());
  await waitForMounted();
  assert.equal(embed.mode, 'fullscreen');
  const dialog = document.querySelector('.ck-crowdy-studio-embed');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(suppress.calls.length, 1);
  const mount = document.querySelector('.ck-crowdy-studio-embed-mount');
  const last = document.createElement('button');
  last.textContent = 'Last project action';
  mount.appendChild(last);
  last.focus();

  last.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }),
  );
  assert.equal(
    document.activeElement,
    document.querySelector('.ck-crowdy-studio-embed-context-toggle'),
  );

  outside.focus();
  assert.equal(dialog.contains(document.activeElement), true);
  embed.close();
  assert.equal(document.activeElement, outside);
  assert.equal(restore.calls.length, 1);
});

test('exits pointer lock, suppresses gameplay, and destroys a late mount', async () => {
  setViewport(window, 900);
  let resolveProjects;
  const provider = sampleProvider();
  const deferredProvider = {
    ...provider,
    listProjectsCalls: provider.listProjectsCalls,
    listProjects(scope) {
      return new Promise((resolve) => {
        resolveProjects = () => resolve(provider.listProjects(scope));
      });
    },
  };
  const locked = document.createElement('canvas');
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    value: locked,
  });
  const exitPointerLock = recorder();
  Object.defineProperty(document, 'exitPointerLock', {
    configurable: true,
    value: exitPointerLock,
  });
  const { embed, restore, agentMounted } = makeEmbed({
    provider: deferredProvider,
  });

  embed.toggle(embedContext());
  assert.equal(exitPointerLock.calls.length, 1);
  embed.close();
  resolveProjects();
  await settleLateMount();
  // The late-resolving studio must be destroyed, never surfaced.
  assert.equal(document.querySelector('.ck-crowdy-studio'), null);
  assert.equal(agentMounted.calls.length, 0);
  assert.equal(restore.calls.length, 1);
});

test('routes host calls and mirrors untrusted HUD payloads as text-only preview', async () => {
  const hud = new CrowdyStudioTextHud();
  const hostCall = recorder(async () => ({ actors: [{ uuid: 'player-1' }] }));
  const { embed } = makeEmbed();
  const context = embedContext({
    hud,
    workerUrl: '/assets/glue-worker.js',
    onHostCall: hostCall,
  });
  embed.toggle(context);
  await waitForMounted();

  // Simulate an untrusted CLIENT-mod HUD payload arriving through the sink.
  hud.set({
    source: 'crowdy-studio:9001',
    label: 'Crowdy Studio preview',
    payload: '<img src=x onerror="alert(1)">',
  });

  // The HUD preview mounts lazily: open the Context drawer, then expand the
  // preview disclosure. Existing HUD state must replay into it.
  document.querySelector('.ck-crowdy-studio-embed-context-toggle').click();
  const disclosure = document.querySelector(
    '.ck-crowdy-studio-embed-hud-preview-disclosure',
  );
  disclosure.open = true;
  disclosure.dispatchEvent(new Event('toggle'));
  const preview = document.querySelector('.ck-crowdy-studio-embed-hud-preview');
  assert.ok(preview.textContent.includes('<img src=x'));
  assert.equal(preview.querySelector('img'), null);
  assert.ok(
    document
      .querySelector('.ck-crowdy-studio-hud-layer')
      .textContent.includes('<img src=x'),
  );

  embed.close();
  assert.equal(preview.childElementCount, 0);
  // The persistent HUD layer survives the studio closing.
  assert.ok(
    document
      .querySelector('.ck-crowdy-studio-hud-layer')
      .textContent.includes('<img src=x'),
  );
  hud.destroy();
  assert.equal(document.querySelector('.ck-crowdy-studio-hud-layer'), null);
});

test('createCrowdyStudioEmbed returns a working embed instance', () => {
  const embed = createCrowdyStudioEmbed({
    client: {
      crowdyStudio: sampleProvider(),
      playerCompute: sampleCompute(),
    },
    appId: '2',
  });
  assert.ok(embed instanceof CrowdyStudioEmbed);
  assert.equal(embed.open, false);
});
