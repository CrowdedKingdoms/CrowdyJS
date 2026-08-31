/**
 * Question-card answers are submitted via /api/respond, not a DSH user line.
 * History polls after the next tool must keep the submitted choice visible.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  mergePendingUser,
  pinAskUserAnswers,
  retainPinnedAnswers,
} = await import('../../dist/crowdy-studio/dsh/controller.js');

const QUESTION_TEXT = JSON.stringify({
  questions: [
    {
      id: 'how',
      question: 'How is game_context supplied?',
      options: [
        { label: 'host_call' },
        { label: 'Harness tool' },
      ],
    },
  ],
});

const ANSWER_DISPLAY = [
  'How is game_context supplied?',
  'Look this up in the sidecar',
].join('\n');

function questionCard(seq = 10) {
  return {
    seq,
    role: 'SYSTEM',
    kind: 'question',
    title: 'How is game_context supplied?',
    text: QUESTION_TEXT,
  };
}

function userAnswer(seq = 11) {
  return {
    seq,
    role: 'USER',
    kind: 'user',
    title: null,
    text: ANSWER_DISPLAY,
  };
}

test('pinAskUserAnswers moves a matching Q+A onto the question card', () => {
  const pinned = pinAskUserAnswers([questionCard(), userAnswer()]);
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].kind, 'question');
  assert.match(pinned[0].answeredText ?? '', /Look this up in the sidecar/);
});

test('retainPinnedAnswers keeps Other text after history drops the user line', () => {
  const previous = mergePendingUser([questionCard()], userAnswer());
  assert.match(previous[0].answeredText ?? '', /Look this up in the sidecar/);

  const polled = [
    questionCard(),
    {
      seq: 12,
      role: 'SYSTEM',
      kind: 'tool',
      title: 'Grep try_parse_coords (*.rs)',
      text: 'server/src/lib.rs',
    },
  ];
  const withoutRetain = pinAskUserAnswers(polled);
  assert.equal(withoutRetain[0].answeredText, undefined);

  const kept = retainPinnedAnswers(polled, previous);
  assert.equal(kept[0].kind, 'question');
  assert.match(kept[0].answeredText ?? '', /Look this up in the sidecar/);
  assert.equal(kept[1].kind, 'tool');
});

test('mergePendingUser retains the pin when pending is cleared', () => {
  const submitted = mergePendingUser([questionCard()], userAnswer());
  const next = mergePendingUser(
    [
      questionCard(),
      {
        seq: 12,
        role: 'SYSTEM',
        kind: 'tool',
        title: 'Grep try_parse_coords (*.rs)',
        text: 'server/src/lib.rs',
      },
    ],
    null,
    submitted,
  );
  assert.equal(dshUnanswered(next), false);
  assert.match(next[0].answeredText ?? '', /Look this up in the sidecar/);
});

function dshUnanswered(messages) {
  return messages.some(
    (message) => message.kind === 'question' && !message.answeredText,
  );
}
