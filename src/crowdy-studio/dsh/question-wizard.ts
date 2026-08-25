/**
 * Headless question card: one prompt at a time, one encoded submit at the end.
 * The dock DOM is a view over this state.
 */

import {
  ASK_USER_CUSTOM_OPTION,
  encodeAskUserQuestionMessage,
  formatAskUserQuestionBatchReply,
  formatAskUserQuestionStructuredAnswers,
  type AskUserQuestion,
  type AskUserQuestionOption,
} from './ask-user-question.js';

export type QuestionWizardPick =
  | { kind: 'option'; option: AskUserQuestionOption }
  | { kind: 'custom'; custom: string };

export interface QuestionWizardView {
  step: number;
  total: number;
  heading: string;
  submitLabel: string;
  backVisible: boolean;
  submitEnabled: boolean;
  current: AskUserQuestion;
}

export class AskUserQuestionWizard {
  readonly questions: AskUserQuestion[];
  step = 0;
  private readonly picks: Array<QuestionWizardPick | null>;

  constructor(questions: AskUserQuestion[]) {
    if (questions.length === 0) {
      throw new Error('AskUserQuestionWizard requires at least one question');
    }
    this.questions = questions;
    this.picks = questions.map(() => null);
  }

  get view(): QuestionWizardView {
    const total = this.questions.length;
    return {
      step: this.step,
      total,
      heading: total > 1 ? `Question ${this.step + 1} of ${total}` : 'Question',
      submitLabel:
        this.step < total - 1
          ? 'Continue'
          : total > 1
            ? 'Submit answers'
            : 'Continue',
      backVisible: this.step > 0,
      submitEnabled: this.picks[this.step] != null,
      current: this.questions[this.step]!,
    };
  }

  selectOption(index: number, step = this.step): void {
    const question = this.questions[step];
    const option = question?.options[index];
    if (!option) return;
    this.picks[step] = { kind: 'option', option };
  }

  selectOther(custom = '', step = this.step): void {
    this.setCustom(custom, step);
  }

  setCustom(custom: string, step = this.step): void {
    const trimmed = custom.trim();
    this.picks[step] = trimmed ? { kind: 'custom', custom: trimmed } : null;
  }

  back(): void {
    if (this.step > 0) this.step -= 1;
  }

  /**
   * Advance to the next prompt, or return the encoded wire payload when the
   * last prompt is complete. Continue never sends a partial answer.
   */
  continue(): string | null {
    if (!this.picks[this.step]) return null;
    if (this.step < this.questions.length - 1) {
      this.step += 1;
      return null;
    }
    return this.encode();
  }

  private encode(): string | null {
    const filled = this.collect();
    if (!filled || filled.length !== this.questions.length) return null;
    const display = formatAskUserQuestionBatchReply(filled);
    if (!display) return null;
    return encodeAskUserQuestionMessage(
      display,
      formatAskUserQuestionStructuredAnswers(filled),
    );
  }

  private collect(): Array<{
    question: AskUserQuestion;
    option?: AskUserQuestionOption | null;
    customText?: string;
  }> | null {
    const filled: Array<{
      question: AskUserQuestion;
      option?: AskUserQuestionOption | null;
      customText?: string;
    }> = [];
    for (const [index, question] of this.questions.entries()) {
      const pick = this.picks[index];
      if (!pick) return null;
      if (pick.kind === 'custom') {
        if (!pick.custom.trim()) return null;
        filled.push({ question, option: null, customText: pick.custom });
        continue;
      }
      filled.push({ question, option: pick.option, customText: '' });
    }
    return filled;
  }
}

export function questionWizardFromSelectValue(
  wizard: AskUserQuestionWizard,
  value: string,
  customText = '',
): void {
  if (value === ASK_USER_CUSTOM_OPTION) {
    wizard.setCustom(customText);
    return;
  }
  if (value === '') return;
  wizard.selectOption(Number(value));
}
