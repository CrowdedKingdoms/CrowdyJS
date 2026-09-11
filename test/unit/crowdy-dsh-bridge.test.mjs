import assert from 'node:assert/strict';
import { test } from 'node:test';

const { StudioDshBridge, renderSettingsYaml } = await import('../../dist/crowdy-dsh/bridge.js');
const { isDshBridgeFrame, isDshFrameMessage } = await import('../../dist/crowdy-dsh/protocol.js');

const frame = (t, extra) => ({ v: 1, from: 'worker', t, ...extra });

function fakeController(overrides = {}) {
  let state = {
    projects: [{ projectId: 'p1', name: 'One', kind: 'FULL_STACK', revisionId: 'r1', updatedAt: 't' }],
    project: {
      projectId: 'p1',
      kind: 'FULL_STACK',
      metadata: { name: 'One', serverModuleName: 'one_server', clientModuleName: 'one_client' },
      files: [
        { target: 'SERVER', path: 'src/lib.rs', content: '' },
        { target: 'CLIENT', path: 'src/lib.rs', content: '' },
      ],
      revision: { id: 'r1', savedAt: 't' },
    },
    saveState: 'SAVED',
    runtime: { phase: 'IDLE' },
    runtimeSync: { state: 'NEVER_RUN', savedRevisionId: 'r1' },
    buildOutput: '',
    authoritativeDiagnostics: [],
    localDiagnostics: [],
    logs: [],
  };
  const listeners = new Set();
  return {
    calls: [],
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(next) {
      state = { ...state, ...next };
      for (const listener of listeners) listener(state);
    },
    setSurfaceVisible() {},
    async testDraft() {
      this.calls.push('testDraft');
      state = {
        ...state,
        runtime: { phase: 'RUNNING' },
        runtimeSync: { state: 'RUNNING_SAVED', savedRevisionId: 'r1' },
        buildOutput: 'Compiling one v0.1.0\nFinished',
        authoritativeDiagnostics: [
          { target: 'SERVER', path: 'src/lib.rs', line: 3, column: 5, severity: 'warning', message: 'unused variable', source: 'rustc' },
        ],
      };
      return { deployment: 'DRAFT', status: 'RUNNING', projectRevisionId: 'r1', targets: ['SERVER', 'CLIENT'], message: 'Draft running' };
    },
    async switchProject(projectId) {
      this.calls.push(`switch:${projectId}`);
      state = { ...state, project: { ...state.project, projectId, metadata: { ...state.project.metadata, name: 'Two' } } };
    },
    async reloadProject() {
      this.calls.push('reload');
    },
    openFile() {},
    ...overrides,
  };
}

function bridgeFor(controller, host) {
  return new StudioDshBridge({
    controller,
    transport: { modelBaseUrl: 'http://api.test/v1/model', models: async () => [] },
    appId: '42',
    persistScope: '42/7',
    getToken: () => 'tok-1',
    graphqlUrl: 'http://api.test/graphql',
    host,
  });
}

/** Ask the bridge over the channel like the worker does and await the reply. */
function ask(channel, method, params) {
  const id = `q${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data;
      if (!data || data.from !== 'page' || (data.t !== 'res' && data.t !== 'err') || data.id !== id) return;
      channel.removeEventListener('message', onMessage);
      if (data.t === 'res') resolve(data.result);
      else reject(new Error(`${data.code}: ${data.message}`));
    };
    channel.addEventListener('message', onMessage);
    channel.postMessage(frame('req', { id, method, params }));
  });
}

test('protocol guards accept page/worker frames and iframe messages only', () => {
  assert.equal(isDshBridgeFrame(frame('event', { event: 'worker.ready', payload: {} })), true);
  assert.equal(isDshBridgeFrame({ v: 2, from: 'worker', t: 'event' }), false);
  assert.equal(isDshBridgeFrame({ v: 1, from: 'stranger', t: 'req' }), false);
  assert.equal(isDshFrameMessage({ source: 'crowdy-dsh', type: 'crowdy-dsh:ready' }), true);
  assert.equal(isDshFrameMessage({ type: 'crowdy-dsh:ready' }), false);
});

test('settings.yaml points the native adapter at the metered endpoint and defaults to the first model', () => {
  const yaml = renderSettingsYaml('http://api.test/v1/model', [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', contextWindow: 128000, inputModalities: ['text', 'image'], pricingMicrousdPerMillion: { input: 1, output: 2, reasoning: 2, cachedInput: 1 } },
    { id: 'anthropic/claude', name: 'Claude', contextWindow: null, inputModalities: ['text'], pricingMicrousdPerMillion: { input: 1, output: 2, reasoning: 2, cachedInput: 1 } },
  ]);
  assert.match(yaml, /^llm-deepseek:\n  apiKeyEnv: CROWDY_APP_TOKEN\n  baseURL: "http:\/\/api.test\/v1\/model"\n  thinking: disabled/m);
  assert.match(yaml, /inputModalities: \["text", "image"\]/);
  assert.match(yaml, /agent-default-model:\n  provider: deepseek-official\n  model: "openai\/gpt-oss-120b"\n$/);
});

test('bridge answers worker requests through the controller and mirrors state changes', async () => {
  const controller = fakeController();
  const bridge = bridgeFor(controller, {
    clientLogs: () => ['[client] a', '[client] b', '[client] c'],
    playerHost: { contractVersion: 'crowdy.player-host/1', async observe() { return { position: { x: '1', y: '2', z: '3' } }; } },
  });
  bridge.connect();
  const worker = new BroadcastChannel(bridge.channelName);
  const events = [];
  worker.addEventListener('message', (event) => {
    if (event.data?.from === 'page' && event.data.t === 'event') events.push(event.data);
  });
  try {
    // The worker announces itself; the page says hello with the app scope and token.
    worker.postMessage(frame('event', { event: 'worker.ready', payload: { root: '/dsh/workspace' } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const hello = events.find((event) => event.event === 'page.hello');
    assert.deepEqual(hello.payload, { appId: '42', projectId: 'p1', appToken: 'tok-1' });

    const list = await ask(worker, 'studio.projectList', {});
    assert.deepEqual(list, { projects: [{ projectId: 'p1', name: 'One', kind: 'FULL_STACK', updatedAt: 't' }], currentProjectId: 'p1' });

    const build = await ask(worker, 'studio.draftTest', {});
    assert.equal(build.ok, true);
    assert.equal(build.mode, 'draft');
    assert.deepEqual(build.diagnostics, [{ target: 'SERVER', path: 'src/lib.rs', line: 3, column: 5, severity: 'warning', message: 'unused variable' }]);
    assert.deepEqual(build.runtime.map((entry) => [entry.target, entry.phase, entry.runningRevision]), [
      ['SERVER', 'RUNNING', 'r1'],
      ['CLIENT', 'RUNNING', 'r1'],
    ]);
    assert.equal(build.screenshot, undefined, 'no capture hook, no screenshot');
    assert.ok(events.some((event) => event.event === 'page.context' && event.payload.diagnostics?.length === 1));

    const logs = await ask(worker, 'studio.clientLogs', { limit: 2 });
    assert.deepEqual(logs, { lines: ['[client] b', '[client] c'], truncated: true });

    const observed = await ask(worker, 'game.observe', {});
    assert.deepEqual(observed.observation, { position: { x: '1', y: '2', z: '3' } });

    const opened = await ask(worker, 'studio.projectOpen', { projectId: 'p2' });
    assert.equal(opened.project.projectId, 'p2');
    assert.ok(controller.calls.includes('switch:p2'));
    assert.ok(events.some((event) => event.event === 'page.project' && event.payload.projectId === 'p2'));

    await assert.rejects(ask(worker, 'studio.screenshot', {}), /does not provide screenshots/);

    // A worker write reloads the editor's copy of the project.
    worker.postMessage(frame('event', { event: 'worker.fileChanged', payload: { target: 'SERVER', path: 'src/lib.rs' } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(controller.calls.includes('reload'));

    // Fix with AI queues a prompt for the worker.
    bridge.prompt('Fix the warning');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(events.at(-1).payload, { text: 'Fix the warning', mode: 'queue' });
  } finally {
    bridge.detach();
    worker.close();
  }
});
