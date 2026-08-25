/**
 * Answers must stay on the question card they were submitted from,
 * even when DSH later appends the same Q+A after a long write-up.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { pinAskUserAnswers, mergePendingUser } = await import(
  '../../dist/crowdy-studio/dsh/controller.js'
);

const discoQuestions = {
  questions: [
    {
      id: 'how',
      question: 'What did you expect to see in the game environment when testing the draft?',
      options: [{ label: 'Colored blocks in the world (Recommended)', description: '' }],
    },
    {
      id: 'errors',
      question: 'When you hit Test Draft, did Studio report any build errors or warnings?',
      options: [{ label: 'Build succeeded, no errors', description: '' }],
    },
  ],
};

const answeredText = [
  'What did you expect to see in the game environment when testing the draft?',
  'Colored blocks in the world (Recommended)',
  '',
  'When you hit Test Draft, did Studio report any build errors or warnings?',
  'Build succeeded, no errors',
].join('\n');

function questionCard(seq = 11) {
  return {
    seq,
    role: 'SYSTEM',
    kind: 'question',
    title: discoQuestions.questions[0].question,
    text: JSON.stringify(discoQuestions, null, 2),
  };
}

function userAnswer(seq = 40) {
  return {
    seq,
    role: 'USER',
    kind: 'user',
    title: null,
    text: answeredText,
  };
}

test('pins a trailing Q+A bubble back onto the question it answered', () => {
  const intro = {
    seq: 4,
    role: 'ASSISTANT',
    kind: 'assistant',
    title: null,
    text: 'Before I fix it, let me confirm what you expect to see:',
  };
  const writeUp = {
    seq: 30,
    role: 'ASSISTANT',
    kind: 'assistant',
    title: null,
    text: 'Hit Test Draft: you should see the floor appear near spawn instantly.',
  };
  const pinned = pinAskUserAnswers([
    intro,
    questionCard(),
    writeUp,
    userAnswer(),
  ]);

  assert.equal(pinned.length, 3, 'the trailing user bubble must not stay at the end');
  assert.equal(pinned[0].kind, 'assistant');
  assert.equal(pinned[1].kind, 'question');
  assert.equal(pinned[1].answeredText, answeredText);
  assert.equal(pinned[2].kind, 'assistant');
  assert.match(pinned[2].text, /Hit Test Draft/);
  assert.equal(
    pinned.some((message) => message.kind === 'user'),
    false,
    'answers must not remain a separate user line after the write-up',
  );
});

test('mergePendingUser pins optimistic answers after the question, not after later text', () => {
  const history = [
    {
      seq: 4,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'Confirm what you expect:',
    },
    questionCard(),
    {
      seq: 20,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'server/src/lib.rs is intentionally untouched.',
    },
  ];
  const pending = userAnswer(21);
  const merged = mergePendingUser(history, pending);
  const kinds = merged.map((message) => message.kind);
  assert.deepEqual(kinds, ['assistant', 'question', 'assistant']);
  assert.equal(merged[1].answeredText, answeredText);
  assert.ok(
    merged.indexOf(merged[1]) <
      merged.findIndex((message) => message.text.includes('intentionally untouched')),
  );
});

test('leaves ordinary chat bubbles at the end of the transcript', () => {
  const history = [
    {
      seq: 1,
      role: 'USER',
      kind: 'user',
      title: null,
      text: 'keep going',
    },
    {
      seq: 2,
      role: 'ASSISTANT',
      kind: 'assistant',
      title: null,
      text: 'Working on it.',
    },
  ];
  const pending = {
    seq: 3,
    role: 'USER',
    kind: 'user',
    title: null,
    text: 'also paint the ceiling',
  };
  const merged = mergePendingUser(history, pending);
  assert.equal(merged.at(-1)?.text, 'also paint the ceiling');
  assert.equal(merged.at(-1)?.kind, 'user');
});
