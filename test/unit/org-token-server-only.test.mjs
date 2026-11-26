/**
 * A call that takes an organization's org token (the fleet session calls and
 * `execConnectAsServer`) is made only where the runtime says it is a server. An org token
 * never goes into a browser page, a page's worker or a game client; a server-side worker an
 * organization runs is a server.
 *
 * The first test describes each runtime by the globals it has. The second runs the real
 * calls in a process made to look like a browser's worker, and checks that the org token was
 * put on no request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const { organizationServerRefusal, assertOrganizationServer } = await import('../../dist/server-only.js');
const { CrowdyError } = await import('../../dist/index.js');

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sdkUrl = pathToFileURL(join(repo, 'dist', 'index.js')).href;
const run = promisify(execFile);

const page = { window: {}, document: {} };
const browserNavigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36' };

test('each runtime is a server or it is not, by what it says of itself', () => {
  const allowed = {
    'Node': { process: { versions: { node: '20.20.2' } } },
    'a Node worker thread': { process: { versions: { node: '22.11.0' } }, navigator: { userAgent: 'Node.js/22' } },
    'Bun': { Bun: { version: '1.2.0' }, process: { versions: { node: '22.6.0', bun: '1.2.0' } } },
    'Bun, by its own global alone': { Bun: { version: '1.2.0' } },
    'Deno 2': { Deno: { version: { deno: '2.1.4' } }, process: { versions: { node: '22.11.0' } }, navigator: { userAgent: 'Deno/2.1.4' } },
    'Deno 1, which has no process global': { Deno: { version: { deno: '1.46.3' } }, navigator: { userAgent: 'Deno/1.46.3' } },
    'the Cloudflare Workers runtime': { navigator: { userAgent: 'Cloudflare-Workers' } },
    'the Cloudflare Workers runtime with Node compatibility': {
      navigator: { userAgent: 'Cloudflare-Workers' },
      process: { versions: { node: '22.0.0' } },
    },
    'Vercel\u2019s Edge Runtime': { EdgeRuntime: 'edge-runtime' },
  };
  for (const [name, scope] of Object.entries(allowed)) {
    assert.equal(organizationServerRefusal(scope), null, name);
  }

  const refused = {
    'a browser page': { ...page, navigator: browserNavigator },
    // A page stays a page whatever else it defines: a bundler's process, a desktop shell's.
    'a page with a bundler\u2019s process stand-in': { ...page, process: { env: {}, browser: true, versions: {} } },
    'a desktop shell\u2019s page with Node switched on': { ...page, process: { versions: { node: '22.0.0', electron: '33.0.0' } } },
    'a page simulated inside Node (a test\u2019s DOM)': { ...page, process: { versions: { node: '20.20.2' } } },
    'a page that claims to be a server-side worker': { ...page, navigator: { userAgent: 'Cloudflare-Workers' }, EdgeRuntime: 'edge-runtime' },
    // A page's worker has no window and no document, so their absence proves nothing.
    'a browser\u2019s web worker': { navigator: browserNavigator },
    'a browser\u2019s service worker': { navigator: browserNavigator, process: undefined },
    'a web worker with a bundler\u2019s process stand-in': { navigator: browserNavigator, process: { env: {}, versions: {} } },
    'a runtime that says nothing of itself': {},
    'a runtime whose marks are the wrong type': {
      process: { versions: { node: 22 } },
      Deno: { version: {} },
      Bun: {},
      EdgeRuntime: true,
      navigator: { userAgent: 'cloudflare-workers' },
    },
  };
  for (const [name, scope] of Object.entries(refused)) {
    const why = organizationServerRefusal(scope);
    assert.equal(typeof why, 'string', name);
    assert.match(why, 'window' in scope ? /browser page/ : /does not say it is a server/, name);
  }
  // This process is Node: the calls run here.
  assert.equal(organizationServerRefusal(), null);
  assert.doesNotThrow(() => assertOrganizationServer('fleetSessions.open'));
});

test('in a browser\u2019s worker every org-token call is refused before any request', async () => {
  const script = `
    const sdk = await import(${JSON.stringify(sdkUrl)});
    const requests = [];
    const client = sdk.createCrowdyClient({
      httpUrl: 'https://ck.example.test',
      wsUrl: 'wss://ck.example.test',
      fetch: async (url, init) => {
        requests.push(new Headers(init.headers).get('authorization'));
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      },
    });
    client.setToken('cko_' + 'k'.repeat(64));
    // A dedicated worker of a page: no window, no document, no Node process, a browser's navigator.
    const real = globalThis.process;
    globalThis.process = undefined;
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 Chrome/142.0' }, configurable: true });
    globalThis.self = globalThis;
    const calls = {
      'fleetSessions.open': () => client.fleetSessions.open('7'),
      'fleetSessions.refresh': () => client.fleetSessions.refresh({ appId: '7', gameTokenId: '9001' }),
      'fleetSessions.close': () => client.fleetSessions.close({ appId: '7', gameTokenId: '9001' }),
      'exec.serverEndpoint': () => client.exec.serverEndpoint('7'),
      'exec.connectAsServer': () => client.exec.connectAsServer('7'),
    };
    const out = {};
    for (const [name, call] of Object.entries(calls)) {
      out[name] = await call().then(() => 'RAN', (e) => e.name + ': ' + e.message);
    }
    // The same worker, on a server that says what it is.
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true });
    out.serverWorker = await client.fleetSessions.close({ appId: '7', gameTokenId: '9001' }).then(() => 'RAN', (e) => e.name);
    globalThis.process = real;
    console.log(JSON.stringify({ out, requests }));
  `;
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script]);
  const { out, requests } = JSON.parse(stdout);
  for (const name of ['fleetSessions.open', 'fleetSessions.refresh', 'fleetSessions.close', 'exec.serverEndpoint', 'exec.connectAsServer']) {
    assert.match(out[name], /^CrowdyError: /, name);
    assert.match(out[name], new RegExp(`^CrowdyError: ${name.replace('.', '\\.')} takes your organization's org token`), name);
    assert.match(out[name], /never goes into a browser page or a game client/, name);
    assert.match(out[name], /does not say it is a server/, name);
  }
  // Only the call made as a server-side worker reached the network.
  assert.equal(out.serverWorker, 'RAN');
  assert.deepEqual(requests, [`Bearer cko_${'k'.repeat(64)}`]);
});

test('the refusal is a CrowdyError that names the call and why', () => {
  globalThis.window = globalThis;
  globalThis.document = {};
  try {
    assert.throws(
      () => assertOrganizationServer('exec.connectAsServer'),
      (error) => {
        assert.ok(error instanceof CrowdyError);
        assert.match(error.message, /^exec\.connectAsServer takes your organization's org token/);
        assert.match(error.message, /this is a browser page/);
        assert.match(error.message, /Call it from a server your organization runs\.$/);
        return true;
      },
    );
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
