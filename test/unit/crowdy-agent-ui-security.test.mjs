import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('agent UI renders hostile content as text and includes accessible controls', async () => {
  const source = await readFile(
    new URL('../../src/crowdy-studio/agent-dom-shell.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(/);
  assert.match(source, /\.textContent\s*=/);
  assert.match(source, /aria-label', 'Crowdy Studio agent/);
  assert.match(source, /aria-label', 'Agent mode/);
  assert.match(source, /setAttribute\('aria-pressed'/);
  assert.match(source, /setAttribute\('role', 'log'/);
  assert.match(source, /aria-live', 'polite/);
  assert.match(source, /Message Crowdy Agent/);
  assert.match(source, /Approve exact call/);
  assert.match(source, /approval\.argumentHash/);
  assert.match(source, /Server-verified execution plan/);
  assert.match(source, /Pause/);
  assert.match(source, /Stop/);
  assert.match(source, /Restore checkpoint/);
});

test('agent browser modules contain no provider key, raw request, or ambient executor', async () => {
  const paths = [
    '../../src/crowdy-agent/browser-dispatcher.ts',
    '../../src/crowdy-agent/studio-tools.ts',
    '../../src/player-host/tools.ts',
    '../../src/crowdy-studio/agent-dom-shell.ts',
  ];
  const source = (
    await Promise.all(
      paths.map((path) =>
        readFile(new URL(path, import.meta.url), 'utf8'),
      ),
    )
  ).join('\n');
  assert.doesNotMatch(source, /OPENROUTER_API_KEY|openrouter\.ai/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/);
  assert.doesNotMatch(source, /\bhost_call\b|PlayerCodeBroker/);
  assert.doesNotMatch(source, /\bgraphql\s*\(/i);
  assert.doesNotMatch(source, /\bexec(?:File|Sync)?\s*\(|child_process/);
});

test('responsive agent dock uses container queries and visible focus treatment', async () => {
  const { CROWDY_STUDIO_STYLES } = await import(
    '../../dist/crowdy-studio/styles.js'
  );
  assert.match(CROWDY_STUDIO_STYLES, /ck-crowdy-studio-agent-dock/);
  assert.match(CROWDY_STUDIO_STYLES, /@container\(max-width:760px\)/);
  assert.match(CROWDY_STUDIO_STYLES, /:focus-visible/);
  assert.match(CROWDY_STUDIO_STYLES, /ck-crowdy-studio-agent-stop/);
});

test('v12 exports first-class agent, player-host, and Crowdy Studio surfaces', async () => {
  const [agent, host, studio, root] = await Promise.all([
    import('../../dist/crowdy-agent/index.js'),
    import('../../dist/player-host/index.js'),
    import('../../dist/crowdy-studio/index.js'),
    import('../../dist/index.js'),
  ]);
  assert.equal(root.VERSION, '13.0.0');
  assert.equal(typeof agent.CrowdyStudioAgentController, 'function');
  assert.equal(typeof agent.CrowdyAgentToolRegistry, 'function');
  assert.equal(typeof host.AgentControlLeaseManager, 'function');
  assert.equal(typeof host.createPlayerHostAgentTools, 'function');
  assert.equal(studio.CrowdyStudioAgentController, agent.CrowdyStudioAgentController);
  assert.equal(studio.AgentControlLeaseManager, host.AgentControlLeaseManager);
});
