/**
 * DeepSeek Harness `ask_user_question` is a structured multiple-choice tool.
 * Studio used to dump the raw arguments JSON into a collapsed tool card.
 */

export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestion {
  id: string;
  question: string;
  options: AskUserQuestionOption[];
}

export function isAskUserQuestionTool(name: string | null | undefined): boolean {
  const normalized = (name ?? '').trim().toLowerCase();
  return (
    normalized === 'ask_user_question' ||
    normalized === 'ask-user-question' ||
    normalized === 'question'
  );
}

export function parseAskUserQuestions(raw: string): AskUserQuestion[] | null {
  const parsed = parseJson(raw);
  if (!parsed) return null;
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.questions)
      ? parsed.questions
      : questionText(parsed)
        ? [parsed]
        : null;
  if (!list || list.length === 0) return null;
  const questions: AskUserQuestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const question = questionText(record);
    const options = parseOptions(record.options);
    if (!question || options.length === 0) continue;
    questions.push({
      id: String(record.id ?? `q${questions.length + 1}`),
      question,
      options,
    });
  }
  return questions.length > 0 ? questions : null;
}

export const ASK_USER_CUSTOM_OPTION = '__ck_dsh_other__';

export function formatAskUserQuestionAnswer(
  question: AskUserQuestion,
  option: AskUserQuestionOption,
): string {
  return option.label.trim() || question.question;
}

export function formatAskUserQuestionReply(input: {
  question: AskUserQuestion;
  option?: AskUserQuestionOption | null;
  customText?: string;
}): string {
  const custom = input.customText?.trim() ?? '';
  if (custom) {
    return input.option
      ? `${input.option.label}: ${custom}`
      : custom;
  }
  if (input.option) return formatAskUserQuestionAnswer(input.question, input.option);
  return '';
}

export const ASK_USER_ANSWERS_PREFIX = 'CK_DSH_ANSWERS:';

export interface AskUserQuestionStructuredAnswer {
  id: string;
  selected: string[];
  custom?: string;
}

/** Wire answers `ctx.userQuestions` / `/api/respond` expect. */
export function formatAskUserQuestionStructuredAnswers(
  answers: Array<{
    question: AskUserQuestion;
    option?: AskUserQuestionOption | null;
    customText?: string;
  }>,
): { answers: AskUserQuestionStructuredAnswer[] } {
  return {
    answers: answers.map((input) => {
      const custom = input.customText?.trim() ?? '';
      if (custom) {
        return { id: input.question.id, selected: [], custom };
      }
      const label = input.option?.label.trim() ?? '';
      return { id: input.question.id, selected: label ? [label] : [] };
    }),
  };
}

/** Encode display text plus structured answers for the game-api DSH bridge. */
export function encodeAskUserQuestionMessage(
  display: string,
  structured: { answers: AskUserQuestionStructuredAnswer[] },
): string {
  return `${ASK_USER_ANSWERS_PREFIX}${JSON.stringify(structured)}\n\n${display.trim()}`;
}

export function decodeAskUserQuestionMessage(content: string): {
  display: string;
  answers: AskUserQuestionStructuredAnswer[] | null;
} {
  const trimmed = content.trim();
  if (trimmed.startsWith(ASK_USER_ANSWERS_PREFIX)) {
    const rest = trimmed.slice(ASK_USER_ANSWERS_PREFIX.length);
    const split = rest.indexOf('\n');
    const jsonPart = (split === -1 ? rest : rest.slice(0, split)).trim();
    const display = (split === -1 ? '' : rest.slice(split + 1)).trim();
    const answers = parseStructuredAnswers(jsonPart);
    return { display: display || content, answers };
  }
  return { display: trimmed, answers: parseStructuredAnswers(trimmed) };
}

function parseStructuredAnswers(
  raw: string,
): AskUserQuestionStructuredAnswer[] | null {
  try {
    const parsed = JSON.parse(raw) as { answers?: unknown };
    if (!Array.isArray(parsed.answers) || parsed.answers.length === 0) {
      return null;
    }
    const answers: AskUserQuestionStructuredAnswer[] = [];
    for (const item of parsed.answers) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const id = String(record.id ?? '').trim();
      const selected = Array.isArray(record.selected)
        ? record.selected.map((value) => String(value).trim()).filter(Boolean)
        : [];
      const custom =
        typeof record.custom === 'string' && record.custom.trim()
          ? record.custom.trim()
          : undefined;
      if (!id || (selected.length === 0 && !custom)) continue;
      answers.push(custom ? { id, selected, custom } : { id, selected });
    }
    return answers.length > 0 ? answers : null;
  } catch {
    return null;
  }
}

/** One user message for every answered prompt on a question card. */
export function formatAskUserQuestionBatchReply(
  answers: Array<{
    question: AskUserQuestion;
    option?: AskUserQuestionOption | null;
    customText?: string;
  }>,
): string {
  return answers
    .map((input) => {
      const answer = formatAskUserQuestionReply(input);
      if (!answer) return '';
      return `${input.question.question}\n${answer}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function looksLikeAskUserQuestion(message: {
  kind?: string | null;
  title?: string | null;
  text?: string | null;
}): boolean {
  return (
    message.kind === 'question' ||
    isAskUserQuestionTool(message.title) ||
    parseAskUserQuestions(message.text ?? '') !== null
  );
}

function parseOptions(value: unknown): AskUserQuestionOption[] {
  if (!Array.isArray(value)) return [];
  const options: AskUserQuestionOption[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      options.push({ label: item.trim(), description: '' });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const label = String(
      record.label ?? record.title ?? record.id ?? '',
    ).trim();
    if (!label) continue;
    options.push({
      label,
      description: String(record.description ?? '').trim(),
    });
  }
  return options;
}

function questionText(record: Record<string, unknown>): string {
  return String(
    record.question ?? record.header ?? record.prompt ?? '',
  ).trim();
}

function parseJson(raw: string): Record<string, unknown> | unknown[] | null {
  const candidates = jsonCandidates(raw);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (value && typeof value === 'object') {
        return value as Record<string, unknown> | unknown[];
      }
    } catch {
      // Try the next extracted candidate.
    }
  }
  return null;
}

/** Bare JSON, fenced ```json, or a `{ "questions": ... }` object inside prose. */
function jsonCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]?.trim()) out.push(fenced[1].trim());
  out.push(trimmed);
  const embedded = trimmed.match(/\{[\s\S]*"questions"\s*:[\s\S]*\}/u);
  if (embedded?.[0] && !out.includes(embedded[0])) out.push(embedded[0]);
  return out;
}
