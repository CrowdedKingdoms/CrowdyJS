/**
 * Headless controller tests for the parallel Harness Studio dock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  CrowdyStudioDshController,
} = await import('../../dist/crowdy-studio/dsh/controller.js');

function session(overrides = {}) {
  return {
    sessionId: 'sess-1',
    projectId: 'proj-1',
    title: 'Harness 1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

class FakeTransport {
  sessions = [];
  messages = new Map();
  prompts = [];

  async listSessions() {
    return [...this.sessions];
  }

  async createSession(input) {
    const created = session({
      sessionId: `sess-${this.sessions.length + 1}`,
      projectId: input.projectId,
      title: `Harness ${this.sessions.length + 1}`,
    });
    this.sessions.unshift(created);
    this.messages.set(created.sessionId, []);
    return created;
  }

  async sendMessage(input) {
    this.prompts.push(input.content);
    const existing = this.messages.get(input.sessionId) ?? [];
    const nextSeq = (existing.at(-1)?.seq ?? 0) + 1;
    existing.push({ seq: nextSeq, role: 'USER', text: input.content });
    existing.push({
      seq: nextSeq + 1,
      role: 'ASSISTANT',
      text: `echo:${input.content}`,
    });
    this.messages.set(input.sessionId, existing);
    const found = this.sessions.find((item) => item.sessionId === input.sessionId);
    assert.ok(found);
    return found;
  }

  async history(input) {
    const found = this.sessions.find((item) => item.sessionId === input.sessionId);
    assert.ok(found);
    return {
      session: found,
      messages: [...(this.messages.get(input.sessionId) ?? [])],
    };
  }
}

test('creates a session for the open project and exchanges a message', async () => {
  const transport = new FakeTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
  });

  await controller.initialize();
  assert.equal(controller.getState().connection, 'ready');
  assert.equal(controller.getState().sessions.length, 0);

  await controller.createSession();
  assert.equal(controller.getState().sessions.length, 1);
  assert.ok(controller.getState().activeSessionId);

  await controller.sendMessage('hello harness');
  const messages = controller.getState().messages;
  assert.equal(messages.some((m) => m.role === 'USER' && m.text === 'hello harness'), true);
  assert.equal(
    messages.some((m) => m.role === 'ASSISTANT' && m.text === 'echo:hello harness'),
    true,
  );
  assert.deepEqual(transport.prompts, ['hello harness']);
  controller.destroy();
});

test('refuses work without an open project', async () => {
  const transport = new FakeTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => null,
  });
  await controller.initialize();
  assert.equal(controller.getState().connection, 'error');
  assert.match(controller.getState().lastError ?? '', /Open a Crowdy Studio project/);
  controller.destroy();
});
