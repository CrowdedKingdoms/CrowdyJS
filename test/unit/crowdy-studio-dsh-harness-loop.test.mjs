/**
 * Isolated Harness / question-card regression loop.
 *
 * No DSH host, no Game API, no browser. These are the Studio behaviors Ben
 * hit while playtesting the disco-skin draft.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  decodeAskUserQuestionMessage,
  encodeAskUserQuestionMessage,
  formatAskUserQuestionStructuredAnswers,
  looksLikeAskUserQuestion,
  parseAskUserQuestions,
} = await import('../../dist/crowdy-studio/dsh/ask-user-question.js');
const { AskUserQuestionWizard } = await import(
  '../../dist/crowdy-studio/dsh/question-wizard.js'
);
const { dshTranscriptRenderKey } = await import(
  '../../dist/crowdy-studio/dsh/transcript-key.js'
);
const {
  CrowdyStudioDshController,
  dshQuestionTurnContinued,
  dshShouldShowWorking,
} = await import('../../dist/crowdy-studio/dsh/controller.js');

/** The two-prompt card from the disco-skin Harness session. */
const discoCard = {
  questions: [
    {
      id: 'how',
      question: 'How should the disco skin become visible in the game environment?',
      options: [
        {
          label: 'Paint a disco floor (Recommended)',
          description: 'Write voxels on the grid so Test draft shows a world change.',
        },
        {
          label: 'HUD overlay only',
          description: 'Keep the theme on a text HUD card.',
        },
      ],
    },
    {
      id: 'where',
      question: 'If we paint the floor, where should it go?',
      options: [
        { label: 'On my builder grid', description: 'Stay inside the owned AABB.' },
        { label: 'Around the player', description: 'Follow the local avatar.' },
      ],
    },
  ],
};

function discoQuestions() {
  const questions = parseAskUserQuestions(JSON.stringify(discoCard));
  assert.ok(questions);
  assert.equal(questions.length, 2);
  return questions;
}

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

class RecordingTransport {
  sessions = [];
  messages = new Map();
  prompts = [];
  deferCommit = false;

  async listSessions() {
    return [...this.sessions];
  }

  async createSession(input) {
    const created = session({
      sessionId: `sess-${this.sessions.length + 1}`,
      projectId: input.projectId,
    });
    this.sessions.unshift(created);
    this.messages.set(created.sessionId, []);
    return created;
  }

  async sendMessage(input) {
    this.prompts.push(input.content);
    const found = this.sessions.find((item) => item.sessionId === input.sessionId);
    assert.ok(found);
    if (!this.deferCommit) {
      const existing = this.messages.get(input.sessionId) ?? [];
      existing.push({
        seq: (existing.at(-1)?.seq ?? 0) + 1,
        role: 'USER',
        kind: 'user',
        title: null,
        text: input.content,
      });
      this.messages.set(input.sessionId, existing);
    }
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

test('parses the disco-skin two-question tool payload as one card', () => {
  const questions = discoQuestions();
  assert.equal(
    questions[0].question,
    'How should the disco skin become visible in the game environment?',
  );
  assert.equal(questions[1].id, 'where');
  assert.equal(
    looksLikeAskUserQuestion({
      kind: 'question',
      text: JSON.stringify(discoCard),
    }),
    true,
  );
});

test('shows one prompt at a time and does not send on the first Continue', () => {
  const wizard = new AskUserQuestionWizard(discoQuestions());
  assert.equal(wizard.view.heading, 'Question 1 of 2');
  assert.equal(wizard.view.submitLabel, 'Continue');
  assert.equal(wizard.view.backVisible, false);
  assert.equal(wizard.view.submitEnabled, false);
  assert.equal(wizard.view.current.id, 'how');
  assert.equal(wizard.continue(), null);

  wizard.selectOption(0);
  assert.equal(wizard.view.submitEnabled, true);
  assert.equal(wizard.continue(), null);
  assert.equal(wizard.view.heading, 'Question 2 of 2');
  assert.equal(wizard.view.submitLabel, 'Submit answers');
  assert.equal(wizard.view.backVisible, true);
  assert.equal(wizard.view.current.id, 'where');
  assert.equal(wizard.view.submitEnabled, false);
});

test('submits every question with its answer in one encoded payload', () => {
  const wizard = new AskUserQuestionWizard(discoQuestions());
  wizard.selectOption(0);
  assert.equal(wizard.continue(), null);
  wizard.selectOption(0);
  const payload = wizard.continue();
  assert.ok(payload);
  const decoded = decodeAskUserQuestionMessage(payload);
  assert.equal(
    decoded.display,
    'How should the disco skin become visible in the game environment?\nPaint a disco floor (Recommended)\n\nIf we paint the floor, where should it go?\nOn my builder grid',
  );
  assert.deepEqual(decoded.answers, [
    { id: 'how', selected: ['Paint a disco floor (Recommended)'] },
    { id: 'where', selected: ['On my builder grid'] },
  ]);
  assert.match(payload, /^CK_DSH_ANSWERS:/);
});

test('Back keeps the first pick so both answers survive submit', () => {
  const wizard = new AskUserQuestionWizard(discoQuestions());
  wizard.selectOption(1);
  wizard.continue();
  wizard.selectOption(1);
  wizard.back();
  assert.equal(wizard.view.current.id, 'how');
  assert.equal(wizard.view.submitEnabled, true);
  wizard.continue();
  const payload = wizard.continue();
  const decoded = decodeAskUserQuestionMessage(payload);
  assert.deepEqual(decoded.answers, [
    { id: 'how', selected: ['HUD overlay only'] },
    { id: 'where', selected: ['Around the player'] },
  ]);
});

test('Other answers use custom text and empty selected (DSH XOR rule)', () => {
  const wizard = new AskUserQuestionWizard(discoQuestions());
  wizard.setCustom('stamp a ring of glow blocks');
  wizard.continue();
  wizard.selectOption(0);
  const decoded = decodeAskUserQuestionMessage(wizard.continue());
  assert.deepEqual(decoded.answers[0], {
    id: 'how',
    selected: [],
    custom: 'stamp a ring of glow blocks',
  });
  assert.equal(decoded.answers[1].selected[0], 'On my builder grid');
  assert.equal(
    formatAskUserQuestionStructuredAnswers([
      {
        question: discoQuestions()[0],
        option: null,
        customText: 'stamp a ring of glow blocks',
      },
    ]).answers[0].selected.length,
    0,
  );
});

test('a Writing/busy flip does not remount the question card', () => {
  const messages = [
    {
      seq: 11,
      kind: 'question',
      title: 'How should the disco skin become visible?',
      text: JSON.stringify(discoCard),
    },
  ];
  const idle = dshTranscriptRenderKey({
    activeSessionId: 'sess-1',
    messages,
  });
  const writing = dshTranscriptRenderKey({
    activeSessionId: 'sess-1',
    messages,
  });
  assert.equal(idle, writing);
  assert.equal(
    dshTranscriptRenderKey({
      activeSessionId: 'sess-1',
      messages: [
        ...messages,
        { seq: 12, kind: 'user', title: null, text: 'Paint a disco floor' },
      ],
    }) === idle,
    false,
  );
});

test('the dock stays Working on a question until the agent continues', () => {
  const question = {
    seq: 11,
    role: 'SYSTEM',
    kind: 'question',
    title: 'How should the disco skin become visible?',
    text: JSON.stringify(discoCard),
  };
  assert.equal(dshShouldShowWorking([question], false), false);
  assert.equal(dshShouldShowWorking([question], true), true);
  assert.equal(dshQuestionTurnContinued([question]), false);
  assert.equal(
    dshQuestionTurnContinued([
      question,
      {
        seq: 20,
        role: 'ASSISTANT',
        kind: 'assistant',
        title: null,
        text: 'Painting a disco floor on your grid.',
      },
    ]),
    true,
  );
});

test('controller shows the Q+A bubble and waits; the wire keeps structured answers', async () => {
  const transport = new RecordingTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
    quietSettleMs: 10_000,
  });
  await controller.initialize();
  await controller.createSession();
  const sessionId = controller.getState().activeSessionId;
  transport.messages.set(sessionId, [
    {
      seq: 11,
      role: 'SYSTEM',
      kind: 'question',
      title: 'How should the disco skin become visible?',
      text: JSON.stringify(discoCard),
    },
  ]);
  transport.deferCommit = true;

  const wizard = new AskUserQuestionWizard(discoQuestions());
  wizard.selectOption(0);
  wizard.continue();
  wizard.selectOption(0);
  const payload = wizard.continue();
  assert.ok(payload);

  const pending = controller.sendMessage(payload);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const mid = controller.getState();
  assert.equal(mid.busy, true);
  assert.equal(transport.prompts[0], payload);
  assert.equal(
    mid.messages.some(
      (message) =>
        message.kind === 'user' &&
        message.text.includes('Paint a disco floor (Recommended)') &&
        message.text.includes('On my builder grid') &&
        !message.text.startsWith('CK_DSH_ANSWERS:'),
    ),
    true,
  );

  const history = transport.messages.get(sessionId);
  history.push({
    seq: 20,
    role: 'ASSISTANT',
    kind: 'assistant',
    title: null,
    text: 'Painting a disco floor on your builder grid.',
  });
  await pending;
  assert.equal(controller.getState().busy, false);
  controller.destroy();
});

test('encode/decode round-trips a one-question Continue payload', () => {
  const [question] = discoQuestions();
  const structured = formatAskUserQuestionStructuredAnswers([
    { question, option: question.options[0] },
  ]);
  const encoded = encodeAskUserQuestionMessage(
    `${question.question}\n${question.options[0].label}`,
    structured,
  );
  const decoded = decodeAskUserQuestionMessage(encoded);
  assert.deepEqual(decoded.answers, structured.answers);
  assert.equal(decodeAskUserQuestionMessage('keep going').answers, null);
});
