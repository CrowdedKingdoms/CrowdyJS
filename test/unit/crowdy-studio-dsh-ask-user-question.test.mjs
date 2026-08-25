import test from 'node:test';
import assert from 'node:assert/strict';

const {
  decodeAskUserQuestionMessage,
  encodeAskUserQuestionMessage,
  formatAskUserQuestionBatchReply,
  formatAskUserQuestionStructuredAnswers,
  looksLikeAskUserQuestion,
  parseAskUserQuestions,
} = await import('../../dist/crowdy-studio/dsh/ask-user-question.js');

const headerShaped = {
  questions: [
    {
      header: 'crowdy::api item',
      id: 'api_name',
      options: [
        {
          label: 'present (Recommended)',
          description: "Keep the current edit — matches the 'presentation call' word",
        },
        {
          label: 'hud / set_hud',
          description: 'A HUD-style setter',
        },
      ],
    },
  ],
};

test('parses header-shaped ask_user_question JSON from the dock bubble', () => {
  const questions = parseAskUserQuestions(JSON.stringify(headerShaped, null, 2));
  assert.ok(questions);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].question, 'crowdy::api item');
  assert.equal(questions[0].options[0].label, 'present (Recommended)');
  assert.equal(questions[0].options[1].label, 'hud / set_hud');
});

test('parses fenced assistant JSON so the bubble becomes a question card', () => {
  const raw = `\`\`\`json\n${JSON.stringify(headerShaped)}\n\`\`\``;
  assert.equal(looksLikeAskUserQuestion({ kind: 'assistant', text: raw }), true);
  const questions = parseAskUserQuestions(raw);
  assert.ok(questions);
  assert.equal(questions[0].id, 'api_name');
});

test('accepts prompt as the question text', () => {
  const questions = parseAskUserQuestions(
    JSON.stringify({
      questions: [
        {
          prompt: 'Which host call?',
          options: [{ label: 'hud_set' }],
        },
      ],
    }),
  );
  assert.ok(questions);
  assert.equal(questions[0].question, 'Which host call?');
});

test('batches every question with its answer into one user reply', () => {
  const questions = parseAskUserQuestions(
    JSON.stringify({
      questions: [
        {
          id: 'where',
          question: 'Where were you expecting the effect?',
          options: [{ label: 'On the voxel world' }, { label: 'On a HUD overlay' }],
        },
        {
          id: 'next',
          question: 'How would you like me to proceed?',
          options: [{ label: 'Make it visible in the world (Recommended)' }],
        },
      ],
    }),
  );
  assert.ok(questions);
  const reply = formatAskUserQuestionBatchReply([
    { question: questions[0], option: questions[0].options[0] },
    { question: questions[1], option: questions[1].options[0] },
  ]);
  assert.equal(
    reply,
    'Where were you expecting the effect?\nOn the voxel world\n\nHow would you like me to proceed?\nMake it visible in the world (Recommended)',
  );
  const structured = formatAskUserQuestionStructuredAnswers([
    { question: questions[0], option: questions[0].options[0] },
    { question: questions[1], option: questions[1].options[0] },
  ]);
  assert.deepEqual(structured, {
    answers: [
      { id: 'where', selected: ['On the voxel world'] },
      { id: 'next', selected: ['Make it visible in the world (Recommended)'] },
    ],
  });
  const encoded = encodeAskUserQuestionMessage(reply, structured);
  const decoded = decodeAskUserQuestionMessage(encoded);
  assert.equal(decoded.display, reply);
  assert.deepEqual(decoded.answers, structured.answers);
});
