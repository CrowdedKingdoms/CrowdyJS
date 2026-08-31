import {
  decodeAskUserQuestionMessage,
  looksLikeAskUserQuestion,
  parseAskUserQuestions,
} from './ask-user-question.js';

export interface PinnableDshMessage {
  seq: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'UNKNOWN';
  kind: string;
  title: string | null;
  text: string;
  answeredText?: string;
}

export function isQuestionCard(
  message: PinnableDshMessage,
): boolean {
  return message.kind === 'question' || looksLikeAskUserQuestion(message);
}

export function isAskUserAnswerBubble(
  message: PinnableDshMessage,
  messages: readonly PinnableDshMessage[] = [],
): boolean {
  if (message.kind !== 'user' || !message.text.trim()) return false;
  if (decodeAskUserQuestionMessage(message.text).answers) return true;
  return messages.some((item) => {
    if (!isQuestionCard(item)) return false;
    return answerMatchesQuestion(message, item);
  });
}

export function answerMatchesQuestion(
  answer: PinnableDshMessage,
  question: PinnableDshMessage,
): boolean {
  const display = decodeAskUserQuestionMessage(answer.text).display;
  const questions = parseAskUserQuestions(question.text) ?? [];
  if (questions.some((item) => display.includes(item.question))) return true;
  if (question.title && display.includes(question.title)) return true;
  return false;
}

/**
 * Keep submitted answers on the question card they belong to.
 * DSH often appends the Q+A as a later user line after the write-up.
 */
export function pinAskUserAnswers<T extends PinnableDshMessage>(
  messages: readonly T[],
): T[] {
  const answers = messages.filter((message) =>
    isAskUserAnswerBubble(message, messages),
  );
  if (answers.length === 0) return [...messages];

  const used = new Set<number>();
  const pinned: T[] = [];
  for (const message of messages) {
    if (isAskUserAnswerBubble(message, messages)) continue;
    if (isQuestionCard(message) && !message.answeredText) {
      const index = answers.findIndex(
        (answer, answerIndex) =>
          !used.has(answerIndex) && answerMatchesQuestion(answer, message),
      );
      if (index >= 0) {
        used.add(index);
        const answer = answers[index];
        pinned.push({
          ...message,
          answeredText: decodeAskUserQuestionMessage(answer?.text ?? '')
            .display,
        });
        continue;
      }
    }
    pinned.push(message);
  }
  answers.forEach((answer, index) => {
    if (!used.has(index)) pinned.push(answer);
  });
  return pinned;
}

function sameQuestionCard(
  left: PinnableDshMessage,
  right: PinnableDshMessage,
): boolean {
  if (left.seq === right.seq) return true;
  if (left.title && right.title && left.title === right.title) return true;
  const leftQuestions = parseAskUserQuestions(left.text) ?? [];
  const rightQuestions = parseAskUserQuestions(right.text) ?? [];
  if (leftQuestions.length === 0 || leftQuestions.length !== rightQuestions.length) {
    return false;
  }
  return leftQuestions.every(
    (question, index) => question.question === rightQuestions[index]?.question,
  );
}

/**
 * Respond answers are not DSH user/message events. After Submit, the next
 * history poll has the yellow card and later tools, but no Q+A line — keep
 * the pin from the previous transcript so the card does not reset.
 */
export function retainPinnedAnswers<T extends PinnableDshMessage>(
  incoming: readonly T[],
  previous: readonly T[] = [],
): T[] {
  const pins = previous.filter(
    (message) => isQuestionCard(message) && Boolean(message.answeredText?.trim()),
  );
  if (pins.length === 0) return [...incoming];
  return incoming.map((message) => {
    if (!isQuestionCard(message) || message.answeredText?.trim()) return message;
    const match =
      pins.find((pin) => pin.seq === message.seq) ??
      pins.find((pin) => sameQuestionCard(pin, message));
    return match?.answeredText
      ? { ...message, answeredText: match.answeredText }
      : message;
  });
}
