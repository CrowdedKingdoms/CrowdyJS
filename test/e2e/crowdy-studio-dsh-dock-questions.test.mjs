/**
 * Click-through tests of the real Harness dock DOM.
 *
 * These mount CrowdyStudioDshDomShell (the same class Studio mounts) in
 * happy-dom and click the dropdowns. A unit test of AskUserQuestionWizard
 * can pass while the dock still renders one Continue per question — this
 * file would fail that.
 */

import { Window } from 'happy-dom';
import test from 'node:test';
import assert from 'node:assert/strict';

const window = new Window({ url: 'https://studio.test/blocks-with-friends' });
const { document } = window;
Object.assign(globalThis, {
  window,
  document,
  HTMLElement: window.HTMLElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  localStorage: window.localStorage,
});

const { CrowdyStudioDshController } = await import(
  '../../dist/crowdy-studio/dsh/controller.js'
);
const { CrowdyStudioDshDomShell } = await import(
  '../../dist/crowdy-studio/dsh/dom-shell.js'
);
const { decodeAskUserQuestionMessage } = await import(
  '../../dist/crowdy-studio/dsh/ask-user-question.js'
);

const discoCard = {
  questions: [
    {
      id: 'how',
      question: 'What should visibly change in the game environment when you test the draft?',
      options: [
        { label: 'Paint a disco floor (Recommended)', description: 'Write voxels.' },
        { label: 'HUD overlay only', description: 'Text card only.' },
      ],
    },
    {
      id: 'errors',
      question: 'When you tested the draft, did Studio report any build/runtime errors?',
      options: [
        { label: 'Builds and runs cleanly', description: 'No rustc / runtime faults.' },
        { label: 'Yes, there were errors', description: 'Compile or invoke failed.' },
      ],
    },
  ],
};

function session() {
  return {
    sessionId: 'sess-dock',
    projectId: 'proj-1',
    title: 'When I test draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

class RecordingTransport {
  sessions = [session()];
  messages = new Map([
    [
      'sess-dock',
      [
        {
          seq: 4,
          role: 'ASSISTANT',
          kind: 'assistant',
          title: null,
          text: 'Before I fix it, let me confirm what you expect to see:',
        },
        {
          seq: 11,
          role: 'SYSTEM',
          kind: 'question',
          title: 'What should visibly change in the game environment when you test the draft?',
          text: JSON.stringify(discoCard, null, 2),
        },
      ],
    ],
  ]);
  prompts = [];

  async listSessions() {
    return [...this.sessions];
  }

  async createSession() {
    return this.sessions[0];
  }

  async sendMessage(input) {
    this.prompts.push(input.content);
    const decoded = decodeAskUserQuestionMessage(input.content);
    const current = this.messages.get('sess-dock');
    current.push(
      {
        seq: 20,
        role: 'ASSISTANT',
        kind: 'assistant',
        title: null,
        text: 'Hit Test Draft: you should see the floor appear near spawn instantly and animate with the beat.',
      },
      {
        seq: 21,
        role: 'USER',
        kind: 'user',
        title: null,
        text: decoded.display,
      },
    );
    return this.sessions[0];
  }

  async history() {
    return {
      session: this.sessions[0],
      messages: [...this.messages.get('sess-dock')],
    };
  }
}

function visibleBlocks(card) {
  return [...card.querySelectorAll('.ck-crowdy-studio-dsh-question-block')].filter(
    (block) => !block.hidden,
  );
}

function changeSelect(select, value) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

async function mountDock() {
  const transport = new RecordingTransport();
  const controller = new CrowdyStudioDshController({
    transport,
    appId: '2',
    resolveProjectId: () => 'proj-1',
    pollIntervalMs: 60_000,
    quietSettleMs: 10_000,
    sessionMemory: { get: () => 'sess-dock', set: () => {} },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const shell = new CrowdyStudioDshDomShell(host, controller);
  await controller.initialize();
  return { transport, controller, shell, host };
}

test('the dock card has one Continue, not one per question', async () => {
  const { shell, host, controller } = await mountDock();
  const card = host.querySelector('.ck-crowdy-studio-dsh-question');
  assert.ok(card, 'expected the gold question card');
  const submits = card.querySelectorAll('.ck-crowdy-studio-dsh-question-submit');
  assert.equal(
    submits.length,
    1,
    `old per-question Continues leaked into the dock (found ${submits.length})`,
  );
  const kicker = card.querySelector('.ck-crowdy-studio-dsh-question-kicker');
  assert.equal(kicker?.textContent, 'Question 1 of 2');
  assert.notEqual(kicker?.textContent?.toUpperCase(), 'QUESTIONS');
  assert.equal(visibleBlocks(card).length, 1);
  assert.match(visibleBlocks(card)[0].textContent, /visibly change/);
  shell.dispose();
  controller.destroy();
  host.remove();
});

test('clicking through both prompts sends every answer once', async () => {
  const { transport, shell, host, controller } = await mountDock();
  const card = host.querySelector('.ck-crowdy-studio-dsh-question');
  const submit = card.querySelector('.ck-crowdy-studio-dsh-question-submit');
  assert.equal(submit.disabled, true);
  assert.equal(submit.textContent, 'Continue');

  changeSelect(visibleBlocks(card)[0].querySelector('select'), '0');
  assert.equal(submit.disabled, false);
  submit.click();
  assert.equal(transport.prompts.length, 0, 'first Continue must not send');
  assert.equal(
    card.querySelector('.ck-crowdy-studio-dsh-question-kicker')?.textContent,
    'Question 2 of 2',
  );
  assert.equal(submit.textContent, 'Submit answers');
  assert.match(visibleBlocks(card)[0].textContent, /build\/runtime errors/);
  assert.equal(card.querySelector('.ck-crowdy-studio-dsh-question-back')?.hidden, false);

  changeSelect(visibleBlocks(card)[0].querySelector('select'), '0');
  submit.click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(transport.prompts.length, 1);
  const decoded = decodeAskUserQuestionMessage(transport.prompts[0]);
  assert.deepEqual(decoded.answers, [
    { id: 'how', selected: ['Paint a disco floor (Recommended)'] },
    { id: 'errors', selected: ['Builds and runs cleanly'] },
  ]);
  assert.match(decoded.display, /Paint a disco floor \(Recommended\)/);
  assert.match(decoded.display, /Builds and runs cleanly/);
  shell.dispose();
  controller.destroy();
  host.remove();
});

test('submitted answers stay on the question card after a later write-up', async () => {
  const { transport, shell, host, controller } = await mountDock();
  const card = host.querySelector('.ck-crowdy-studio-dsh-question');
  const submit = card.querySelector('.ck-crowdy-studio-dsh-question-submit');
  changeSelect(visibleBlocks(card)[0].querySelector('select'), '0');
  submit.click();
  changeSelect(visibleBlocks(card)[0].querySelector('select'), '0');
  submit.click();
  await new Promise((resolve) => setTimeout(resolve, 80));

  const transcript = [...host.querySelector('.ck-crowdy-studio-dsh-transcript').children];
  const kinds = transcript.map((node) => node.dataset.kind);
  assert.deepEqual(
    kinds,
    ['assistant', 'question', 'assistant'],
    `answers drifted off the card (${kinds.join(' > ')})`,
  );
  const question = host.querySelector('.ck-crowdy-studio-dsh-question');
  assert.equal(question.dataset.answered, 'true');
  assert.match(question.textContent, /Paint a disco floor \(Recommended\)/);
  assert.match(question.textContent, /Builds and runs cleanly/);
  assert.equal(question.querySelector('.ck-crowdy-studio-dsh-question-submit'), null);
  const writeUp = transcript[2];
  assert.match(writeUp.textContent, /Hit Test Draft/);
  assert.equal(
    writeUp.querySelector('.ck-crowdy-studio-dsh-question-answer'),
    null,
    'the write-up must not swallow the answers',
  );
  const userBubbles = host.querySelectorAll('.ck-crowdy-studio-dsh-message[data-kind="user"]');
  assert.equal(
    userBubbles.length,
    0,
    'a trailing user bubble after the write-up means answers left the card',
  );
  assert.equal(transport.prompts.length, 1);
  shell.dispose();
  controller.destroy();
  host.remove();
});
