import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom } from './fixtures/embed-dom.mjs';

const { CrowdyStudioDomShell } = await import(
  '../../dist/crowdy-studio/dom-shell.js'
);

let window;

beforeEach(() => {
  window = setupDom({ width: 1_400, height: 900 });
});

afterEach(() => {
  teardownDom(window);
});

function sampleProject() {
  return {
    projectId: 'project-1',
    appId: '42',
    gridId: '500',
    kind: 'FULL_STACK',
    metadata: {
      name: 'Weather tools',
      serverModuleName: 'weather-server',
      clientModuleName: 'weather-client',
      pairingPreference: 'REQUIRED',
    },
    files: [
      { target: 'SERVER', path: 'src/lib.rs', content: 'fn server() {}' },
      { target: 'CLIENT', path: 'src/lib.rs', content: 'fn client() {}' },
    ],
    revision: { id: 'r1', savedAt: '2026-07-23T00:00:00Z' },
    createdAt: '2026-07-23T00:00:00Z',
    updatedAt: '2026-07-23T00:00:00Z',
  };
}

function baseState(overrides = {}) {
  return {
    projects: [],
    project: sampleProject(),
    personalLibraryFiles: [],
    commonFiles: [],
    openFiles: [],
    activeFile: null,
    saveState: 'SAVED',
    runtime: { phase: 'IDLE' },
    runtimeSync: { state: 'NEVER_RUN' },
    agentActivity: 'IDLE',
    checkpoints: [],
    buildOutput: '',
    authoritativeDiagnostics: [],
    localDiagnostics: [],
    runs: [],
    logs: [],
    usage: null,
    wallet: null,
    invokeResult: null,
    clientLogs: [],
    github: null,
    ...overrides,
  };
}

function stubController() {
  return {
    requiresGitHubConnect: () => false,
    canTarget: () => true,
    setSurfaceVisible() {},
    getState: () => baseState(),
    connectGitHub: async () => {},
    bindGitHubRepo: async () => {},
    refreshGitHubStatus: async () => {},
    createProject: async () => {},
    switchProject: async () => {},
    testDraft: async () => {},
    deployLive: async () => {},
    stopProject: async () => {},
    overwriteConflict: async () => {},
    retrySave: async () => {},
    acceptRemoteConflict: async () => {},
    updateSettings() {},
    setPairingPreference() {},
    invoke: async () => {},
    openFile() {},
    closeFile() {},
    addFile() {},
    importReferenceFile: async () => {},
  };
}

function mountShell() {
  const host = document.createElement('div');
  document.body.append(host);
  const shell = new CrowdyStudioDomShell(host, stubController());
  return { host, shell };
}

function githubSection(root) {
  return root.querySelector('.ck-crowdy-studio-github');
}

test('disconnected GitHub card stacks Connect GitHub and Refresh', () => {
  const { shell } = mountShell();
  shell.render(
    baseState({
      github: { configured: true, connected: false },
    }),
  );
  const section = githubSection(shell.root);
  const labels = [...section.querySelectorAll('button')].map(
    (button) => button.textContent,
  );
  assert.deepEqual(labels, ['Connect GitHub', 'Refresh']);
  assert.match(section.textContent, /Connect GitHub first/);
  shell.dispose();
});

test('bound GitHub card shows identity, slug, status badge, and stacked actions', () => {
  const { shell } = mountShell();
  shell.render(
    baseState({
      github: {
        configured: true,
        connected: true,
        accountLogin: 'studio-dev',
        repositorySelection: 'selected',
        owner: 'studio-dev',
        repo: 'crowdy-mod-example',
        branch: 'main',
      },
      githubMessage: 'GitHub is in sync.',
    }),
  );
  const section = githubSection(shell.root);
  const slug = section.querySelector('input[data-explorer-field="true"]');
  const badge = section.querySelector('.ck-crowdy-studio-github-badge');
  const status = section.querySelector('.ck-crowdy-studio-github-status');
  const labels = [...section.querySelectorAll('button')].map(
    (button) => button.textContent,
  );
  assert.equal(slug.value, 'studio-dev/crowdy-mod-example@main');
  assert.equal(badge.textContent, 'In sync');
  assert.equal(badge.title, 'GitHub is in sync.');
  assert.equal(status.textContent, 'GitHub is in sync.');
  assert.equal(status.dataset.tone, 'ok');
  assert.ok(section.querySelector('.ck-crowdy-studio-github-title svg'));
  assert.match(section.textContent, /@studio-dev/);
  assert.deepEqual(labels, ['Bind repo', 'Pull from GitHub']);
  shell.dispose();
});

test('push and pull githubMessages stay in the DOM with short badges', () => {
  const { shell } = mountShell();
  const github = {
    configured: true,
    connected: true,
    accountLogin: 'studio-dev',
    repositorySelection: 'all',
    owner: 'studio-dev',
    repo: 'crowdy-mod-example',
    branch: 'main',
  };
  shell.render(baseState({ github, githubMessage: 'Pushed 2 files to GitHub.' }));
  let section = githubSection(shell.root);
  assert.equal(
    section.querySelector('.ck-crowdy-studio-github-badge').textContent,
    'Pushed',
  );
  assert.equal(
    section.querySelector('.ck-crowdy-studio-github-status').textContent,
    'Pushed 2 files to GitHub.',
  );

  shell.render(baseState({ github, githubMessage: 'Pulled from GitHub.' }));
  section = githubSection(shell.root);
  assert.equal(
    section.querySelector('.ck-crowdy-studio-github-badge').textContent,
    'Pulled',
  );
  assert.equal(
    section.querySelector('.ck-crowdy-studio-github-status').textContent,
    'Pulled from GitHub.',
  );

  shell.render(
    baseState({
      github,
      githubMessage: 'Save Studio edits before pulling from GitHub.',
    }),
  );
  section = githubSection(shell.root);
  assert.equal(
    section.querySelector('.ck-crowdy-studio-github-badge').textContent,
    'Save first',
  );
  assert.equal(
    section.querySelector('.ck-crowdy-studio-github-status').dataset.tone,
    'warn',
  );
  shell.dispose();
});
