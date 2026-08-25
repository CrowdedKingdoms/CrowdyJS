/**
 * Headless controller tests for the parallel Harness Studio dock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  CrowdyStudioDshController,
  mergePendingUser,
  turnSettledAfter,
  dshQuestionTurnContinued,
  dshMessageLooksLikeMutation,
  dshShouldShowWorking,
  dshTranscriptLooksActive,
  dshTurnInProgress,
  dshWorkingLabel,
  pickLastDshSession,
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

function userMessage(text, seq = 1) {
  return { seq, role: 'USER', kind: 'user', title: null, text };
}

class FakeTransport {
  sessions = [];
  messages = new Map();
  prompts = [];
  holdHistory = false;
  historyWaiters = [];
  /** When true, sendMessage records the prompt but does not append history yet. */
  deferCommit = false;
  deferred = [];

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
    const found = this.sessions.find((item) => item.sessionId === input.sessionId);
    assert.ok(found);
    if (this.deferCommit) {
      this.deferred.push(input);
      return found;
    }
    this.commitPrompt(input.sessionId, input.content);
    return found;
  }

  commitPrompt(sessionId, content) {
    const existing = this.messages.get(sessionId) ?? [];
    const nextSeq = (existing.at(-1)?.seq ?? 6) + 1;
    existing.push(userMessage(content, nextSeq));
    existing.push({
      seq: nextSeq + 8,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: `echo:${content}`,
    });
    existing.push({
      seq: nextSeq + 9,
      role: 'SYSTEM',
      kind: 'turn-end',
      title: null,
      text: 'Done.',
    });
    this.messages.set(sessionId, existing);
  }

  commitDeferred() {
    for (const input of this.deferred) {
      this.commitPrompt(input.sessionId, input.content);
    }
    this.deferred.length = 0;
    this.deferCommit = false;
  }

  async history(input) {
    if (this.holdHistory) {
      await new Promise((resolve) => this.historyWaiters.push(resolve));
    }
    const found = this.sessions.find((item) => item.sessionId === input.sessionId);
    assert.ok(found);
    return {
      session: found,
      messages: [...(this.messages.get(input.sessionId) ?? [])],
    };
  }

  releaseHistory() {
    this.holdHistory = false;
    for (const resolve of this.historyWaiters) resolve();
    this.historyWaiters.length = 0;
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
  assert.equal(messages.some((m) => m.kind === 'user' && m.text === 'hello harness'), true);
  assert.equal(
    messages.some((m) => m.kind === 'assistant' && m.text === 'echo:hello harness'),
    true,
  );
  assert.deepEqual(transport.prompts, ['hello harness']);
  controller.destroy();
});

test('keeps the optimistic user bubble while history is still empty', async () => {
  const transport = new FakeTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
  });
  await controller.initialize();
  await controller.createSession();
  transport.holdHistory = true;

  const pending = controller.sendMessage('generate a house');
  await new Promise((resolve) => setTimeout(resolve, 40));
  const state = controller.getState();
  assert.equal(state.busy, true);
  assert.equal(
    state.messages.some((m) => m.kind === 'user' && m.text === 'generate a house'),
    true,
  );

  transport.releaseHistory();
  await pending;
  assert.equal(controller.getState().busy, false);
  controller.destroy();
});

test('mergePendingUser does not duplicate once history contains the prompt', () => {
  const pending = userMessage('generate a house', 1);
  const history = [userMessage('generate a house', 7)];
  assert.deepEqual(mergePendingUser(history, pending), history);
  assert.equal(mergePendingUser([], pending).length, 1);
});

test('turnSettledAfter ignores prior tool errors until this prompt is answered', () => {
  const prior = [
    userMessage('What is the script currently capable of?', 1),
    {
      seq: 2,
      role: 'SYSTEM',
      kind: 'error',
      title: 'Error',
      text: 'cannot read "/home/ubuntu/crowdy-mount": not a regular file',
    },
  ];
  assert.equal(turnSettledAfter(prior, 'Fix ONLY this one Crowdy Studio problem'), false);
  const landed = [
    ...prior,
    userMessage('Fix ONLY this one Crowdy Studio problem', 10),
  ];
  assert.equal(turnSettledAfter(landed, 'Fix ONLY this one Crowdy Studio problem'), false);
  const midTurn = [
    ...landed,
    {
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'I will patch client/src/lib.rs',
    },
  ];
  assert.equal(
    turnSettledAfter(midTurn, 'Fix ONLY this one Crowdy Studio problem'),
    false,
  );
  const done = [
    ...midTurn,
    { seq: 12, role: 'SYSTEM', kind: 'turn-end', title: null, text: 'Done.' },
  ];
  assert.equal(turnSettledAfter(done, 'Fix ONLY this one Crowdy Studio problem'), true);
  const asked = [
    ...landed,
    {
      seq: 11,
      role: 'SYSTEM',
      kind: 'question',
      title: 'How should I handle the missing host calls?',
      text: '{}',
    },
  ];
  assert.equal(
    turnSettledAfter(asked, 'Fix ONLY this one Crowdy Studio problem'),
    true,
  );
  const dumped = [
    ...landed,
    {
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: JSON.stringify({
        questions: [
          {
            header: 'crowdy::api item',
            options: [{ label: 'present (Recommended)' }],
          },
        ],
      }),
    },
  ];
  assert.equal(
    turnSettledAfter(dumped, 'Fix ONLY this one Crowdy Studio problem'),
    true,
  );
});

test('dshQuestionTurnContinued waits until the agent leaves the question card', () => {
  const question = {
    seq: 11,
    role: 'SYSTEM',
    kind: 'question',
    title: 'How should the disco skin become visible?',
    text: '{"questions":[]}',
  };
  assert.equal(dshQuestionTurnContinued([question]), false);
  assert.equal(
    dshQuestionTurnContinued([
      question,
      { seq: 20, role: 'ASSISTANT', kind: 'assistant', title: null, text: 'Painting the floor.' },
    ]),
    true,
  );
});

test('finished assistant reply is idle unless this tab is waiting', () => {
  const messages = [
    userMessage('Fix ONLY this one Crowdy Studio problem', 10),
    {
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'Go ahead and Test draft.',
    },
  ];
  assert.equal(dshTranscriptLooksActive(messages), false);
  assert.equal(dshShouldShowWorking(messages, false), false);
  assert.equal(dshShouldShowWorking(messages, true), true);
  assert.equal(dshWorkingLabel(messages), 'Writing');
});

test('working strip stays up after a dumped question if later tools arrive', () => {
  const messages = [
    userMessage('Fix ONLY this one Crowdy Studio problem', 10),
    {
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: JSON.stringify({
        questions: [
          { header: 'crowdy::api item', options: [{ label: 'present' }] },
        ],
      }),
    },
    {
      seq: 12,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Read /home/ubuntu/crowdy-mount/client/src/lib.rs',
      text: '',
    },
    {
      seq: 13,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Result',
      text: '',
    },
  ];
  assert.equal(dshTurnInProgress(messages), false);
  assert.equal(dshShouldShowWorking(messages, false), true);
  assert.equal(
    dshWorkingLabel(messages),
    'Read /home/ubuntu/crowdy-mount/client/src/lib.rs',
  );
});

test('dshTurnInProgress stays true through tool cards until turn-end', () => {
  const mid = [
    userMessage('Fix ONLY this one Crowdy Studio problem', 10),
    {
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'Let me read the server source.',
    },
    {
      seq: 12,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Read server/src/lib.rs',
      text: '',
    },
    {
      seq: 13,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Result',
      text: 'ok',
    },
  ];
  assert.equal(dshTurnInProgress(mid), true);
  assert.equal(dshWorkingLabel(mid), 'Read server/src/lib.rs');
  mid.push({
    seq: 14,
    role: 'SYSTEM',
    kind: 'turn-end',
    title: null,
    text: 'Done.',
  });
  assert.equal(dshTurnInProgress(mid), false);
});

test('restored mid-turn history turns busy back on', async () => {
  const transport = new FakeTransport();
  const existing = session({ sessionId: 'sess-live', title: 'Fix ONLY this one Crow' });
  transport.sessions = [existing];
  transport.messages.set(existing.sessionId, [
    userMessage('Fix ONLY this one Crowdy Studio problem', 10),
    {
      seq: 11,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Glob **/*',
      text: '',
    },
    {
      seq: 12,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Result',
      text: 'client/src/lib.rs',
    },
  ]);
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
    sessionMemory: {
      get: () => existing.sessionId,
      set: () => {},
    },
  });
  await controller.initialize();
  assert.equal(controller.getState().busy, true);
  assert.equal(dshWorkingLabel(controller.getState().messages), 'Glob **/*');
  controller.destroy();
});

test('restored finished assistant reply is not busy Writing', async () => {
  const transport = new FakeTransport();
  const existing = session({ sessionId: 'sess-done', title: 'Fix ONLY this one Crow' });
  transport.sessions = [existing];
  transport.messages.set(existing.sessionId, [
    userMessage('Fix ONLY this one Crowdy Studio problem', 10),
    {
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'Go ahead and Test draft — if Problems still flags this line I will swap it.',
    },
  ]);
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
    sessionMemory: {
      get: () => existing.sessionId,
      set: () => {},
    },
  });
  await controller.initialize();
  const state = controller.getState();
  assert.equal(state.busy, false);
  assert.equal(dshShouldShowWorking(state.messages, state.busy), false);
  controller.destroy();
});

test('sendMessage network failure clears Writing', async () => {
  const transport = new FakeTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
  });
  await controller.initialize();
  await controller.createSession();
  transport.sendMessage = async () => {
    throw new Error('Network error: TypeError: Failed to fetch');
  };
  await controller.sendMessage('keep going');
  const state = controller.getState();
  assert.equal(state.busy, false);
  assert.match(state.lastError ?? '', /Failed to fetch/);
  assert.equal(dshShouldShowWorking(state.messages, state.busy), false);
  controller.destroy();
});

test('quiet finished assistant reply drops Writing without turn-end', async () => {
  const transport = new FakeTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
    quietSettleMs: 40,
  });
  await controller.initialize();
  await controller.createSession();
  transport.commitPrompt = function commitPrompt(sessionId, content) {
    const existing = this.messages.get(sessionId) ?? [];
    existing.push(userMessage(content, 10));
    existing.push({
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'Go ahead and Test draft.',
    });
    this.messages.set(sessionId, existing);
  };
  await controller.sendMessage('fix the client');
  assert.equal(controller.getState().busy, false);
  assert.equal(
    dshShouldShowWorking(controller.getState().messages, controller.getState().busy),
    false,
  );
  controller.destroy();
});

test('keeps busy after the first assistant sentence until turn-end', async () => {
  const transport = new FakeTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
  });
  await controller.initialize();
  await controller.createSession();
  transport.commitPrompt = function commitPrompt(sessionId, content) {
    const existing = this.messages.get(sessionId) ?? [];
    existing.push(userMessage(content, 10));
    existing.push({
      seq: 11,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'Looking around.',
    });
    this.messages.set(sessionId, existing);
  };

  const pending = controller.sendMessage('disco skin');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(controller.getState().busy, true);
  const sessionId = controller.getState().activeSessionId;
  transport.messages.get(sessionId).push({
    seq: 12,
    role: 'SYSTEM',
    kind: 'turn-end',
    title: null,
    text: 'Done.',
  });
  await pending;
  assert.equal(controller.getState().busy, false);
  controller.destroy();
});

test('keeps a follow-up prompt visible while prior history still looks settled', async () => {
  const transport = new FakeTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
  });
  await controller.initialize();
  await controller.createSession();
  const sessionId = controller.getState().activeSessionId;
  transport.messages.set(sessionId, [
    userMessage('What is the script currently capable of?', 1),
    {
      seq: 2,
      role: 'SYSTEM',
      kind: 'error',
      title: 'Error',
      text: 'cannot read "/home/ubuntu/crowdy-mount": not a regular file',
    },
  ]);
  await controller.selectSession(sessionId);

  transport.deferCommit = true;
  const pending = controller.sendMessage('Fix these Crowdy Studio Problems.');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const mid = controller.getState();
  assert.equal(mid.busy, true);
  assert.equal(
    mid.messages.some((m) => m.kind === 'user' && m.text === 'Fix these Crowdy Studio Problems.'),
    true,
  );

  transport.commitDeferred();
  await pending;
  assert.equal(controller.getState().busy, false);
  assert.equal(
    controller.getState().messages.some(
      (m) => m.kind === 'user' && m.text === 'Fix these Crowdy Studio Problems.',
    ),
    true,
  );
  controller.destroy();
});

test('dshMessageLooksLikeMutation recognizes stock write and edit cards', () => {
  assert.equal(
    dshMessageLooksLikeMutation({
      seq: 3,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Write',
      text: '/home/ubuntu/crowdy-mount/client/src/lib.rs',
    }),
    true,
  );
  assert.equal(
    dshMessageLooksLikeMutation({
      seq: 4,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Read',
      text: '/home/ubuntu/crowdy-mount/client/src/lib.rs',
    }),
    false,
  );
});

test('pickLastDshSession prefers the remembered id then the newest listed', () => {
  const older = session({ sessionId: 'sess-old', title: 'Older' });
  const newer = session({ sessionId: 'sess-new', title: 'Newer' });
  assert.equal(pickLastDshSession([newer, older])?.sessionId, 'sess-new');
  assert.equal(
    pickLastDshSession([newer, older], 'sess-old')?.sessionId,
    'sess-old',
  );
  assert.equal(pickLastDshSession([], 'sess-old'), null);
});

test('initialize reopens the last Harness session and loads its history', async () => {
  const transport = new FakeTransport();
  const remembered = session({
    sessionId: 'sess-remembered',
    title: 'House chat',
    updatedAt: '2026-08-21T12:00:00Z',
  });
  const newerEmpty = session({
    sessionId: 'sess-new',
    title: 'Untitled',
    updatedAt: '2026-08-21T13:00:00Z',
  });
  transport.sessions = [newerEmpty, remembered];
  transport.messages.set(remembered.sessionId, [
    userMessage('generate a house', 1),
    {
      seq: 2,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'I will write client/src/lib.rs',
    },
  ]);
  const memory = new Map([
    ['ck-crowdy-studio-dsh-session:2:proj-1', remembered.sessionId],
  ]);
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
    sessionMemory: {
      get: (key) => memory.get(key) ?? null,
      set: (key, value) => {
        memory.set(key, value);
      },
    },
  });

  await controller.initialize();
  assert.equal(controller.getState().connection, 'ready');
  assert.equal(controller.getState().activeSessionId, remembered.sessionId);
  assert.equal(
    controller.getState().messages.some(
      (message) => message.kind === 'user' && message.text === 'generate a house',
    ),
    true,
  );
  controller.destroy();
});

test('initialize attaches the newest listed Harness session when none is remembered', async () => {
  const transport = new FakeTransport();
  const older = session({ sessionId: 'sess-old', title: 'Older' });
  const newer = session({ sessionId: 'sess-new', title: 'Newer' });
  transport.sessions = [newer, older];
  transport.messages.set(newer.sessionId, [
    userMessage('continue this chat', 1),
  ]);
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
    sessionMemory: {
      get: () => null,
      set: () => {},
    },
  });

  await controller.initialize();
  assert.equal(controller.getState().activeSessionId, newer.sessionId);
  assert.equal(
    controller.getState().messages.some(
      (message) => message.text === 'continue this chat',
    ),
    true,
  );
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
