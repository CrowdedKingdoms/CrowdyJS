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
