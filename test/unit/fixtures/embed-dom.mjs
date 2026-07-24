import { Window } from 'happy-dom';

/**
 * Shared happy-dom bootstrap for the Crowdy Studio embed-kit unit tests.
 * These components were ported from Blocks with Friends, whose tests ran on
 * the same happy-dom engine under vitest; here we register the globals the
 * components touch, run the test, and restore the previous globals.
 */

const GLOBAL_KEYS = [
  'window',
  'document',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLButtonElement',
  'HTMLDivElement',
  'HTMLDetailsElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'PointerEvent',
  'MouseEvent',
  'FocusEvent',
  'localStorage',
];

let previousGlobals = null;
let previousWorker = undefined;
let hadWorker = false;

export function setupDom({ width = 1_440, height = 800 } = {}) {
  if (previousGlobals) throw new Error('setupDom called twice without teardown');
  const window = new Window({
    url: 'http://localhost/',
    width,
    height,
  });
  previousGlobals = new Map();
  for (const key of GLOBAL_KEYS) {
    previousGlobals.set(key, globalThis[key]);
    globalThis[key] = window[key];
  }
  // Monaco must not be attempted in unit tests; its absence exercises the
  // documented textarea fallback path.
  hadWorker = 'Worker' in globalThis;
  previousWorker = globalThis.Worker;
  delete globalThis.Worker;
  return window;
}

export function setViewport(window, width, height = 800) {
  window.happyDOM.setViewport({ width, height });
}

export function teardownDom(window) {
  window.happyDOM.abort();
  window.close();
  if (previousGlobals) {
    for (const [key, value] of previousGlobals) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    previousGlobals = null;
  }
  if (hadWorker) globalThis.Worker = previousWorker;
  hadWorker = false;
  previousWorker = undefined;
}

/** Poll an assertion until it stops throwing (bounded, like vi.waitFor). */
export async function waitFor(assertion, timeoutMs = 2_000) {
  const start = Date.now();
  for (;;) {
    try {
      return assertion();
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

export function recorder(implementation = () => undefined) {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return implementation(...args);
  };
  fn.calls = calls;
  return fn;
}

export function sampleProject() {
  return {
    projectId: 'p1',
    appId: '1',
    gridId: '2',
    kind: 'FULL_STACK',
    metadata: {
      name: 'Example',
      serverModuleName: 'example-server',
      clientModuleName: 'example-client',
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

export function sampleProvider(project = sampleProject()) {
  return {
    listProjectsCalls: [],
    async listProjects(scope) {
      this.listProjectsCalls.push(structuredClone(scope));
      return [
        {
          projectId: project.projectId,
          name: project.metadata.name,
          kind: project.kind,
          revisionId: project.revision.id,
          serverModuleName: project.metadata.serverModuleName,
          clientModuleName: project.metadata.clientModuleName,
          updatedAt: project.updatedAt,
        },
      ];
    },
    async getProject() {
      return structuredClone(project);
    },
    async createProject() {
      return structuredClone(project);
    },
    async saveProject(input) {
      return {
        ...structuredClone(project),
        metadata: structuredClone(input.metadata),
        files: structuredClone(input.files),
        revision: { id: 'r2', savedAt: project.updatedAt },
      };
    },
    async listPersonalLibraryFiles() {
      return [];
    },
    async listCommonFiles() {
      return [];
    },
  };
}

export function sampleCompute() {
  return {
    async deploy() {
      return { versionId: 'v1' };
    },
    async versions() {
      return [];
    },
    async setEnabled() {},
    async setRequires() {},
    async artifactBytes() {
      return {
        bytes: new ArrayBuffer(1),
        artifactHash: 'a',
        fuelPerDispatch: 1n,
        versionId: 'v1',
      };
    },
    async usage() {
      return {
        hourUnitsUsed: '0',
        dayUnitsUsed: '0',
        unitsPerHour: null,
        unitsPerDay: null,
        compilesThisHour: 0,
        maxCompilesPerHour: 1,
        gateStatus: 'active',
        gateReason: null,
      };
    },
    async runs() {
      return [];
    },
    async logs() {
      return [];
    },
    async invoke() {
      return {};
    },
  };
}
