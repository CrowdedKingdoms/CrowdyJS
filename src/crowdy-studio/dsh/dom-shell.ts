import {
  dshShouldShowWorking,
  dshWorkingLabel,
  type CrowdyStudioDshController,
  type CrowdyStudioDshMessage,
  type CrowdyStudioDshState,
} from './controller.js';
import type { StudioLayoutController } from '../layout.js';
import {
  ASK_USER_CUSTOM_OPTION,
  formatAskUserQuestionReply,
  looksLikeAskUserQuestion,
  parseAskUserQuestions,
} from './ask-user-question.js';
import { fillMarkdown } from './markdown.js';

export interface CrowdyStudioDshDomShellOptions {
  layout?: StudioLayoutController;
}

/**
 * DeepSeek Harness chat dock: transcript-first layout matching dsh web
 * (user bubbles, tool cards, working indicator, Ask-anything composer).
 */
export class CrowdyStudioDshDomShell {
  readonly root: HTMLElement;
  private readonly connection: HTMLElement;
  private readonly sessionSelect: HTMLSelectElement;
  private readonly transcript: HTMLElement;
  private readonly working: HTMLElement;
  private readonly workingLabelEl: HTMLElement;
  private readonly live: HTMLElement;
  private readonly liveLabelEl: HTMLElement;
  private readonly errorBanner: HTMLElement;
  private readonly composer: HTMLTextAreaElement;
  private readonly send: HTMLButtonElement;
  private readonly stop: HTMLButtonElement;
  private readonly newSession: HTMLButtonElement;
  private readonly unsubscribe: () => void;
  private readonly options: CrowdyStudioDshDomShellOptions;
  private disposed = false;
  private lastTranscriptKey = '';

  constructor(
    host: HTMLElement,
    private readonly controller: CrowdyStudioDshController,
    options: CrowdyStudioDshDomShellOptions = {},
  ) {
    this.options = options;
    this.root = document.createElement('aside');
    this.root.className = 'ck-crowdy-studio-dsh-dock';
    this.root.setAttribute('aria-label', 'DeepSeek Harness chat');

    const header = document.createElement('header');
    header.className = 'ck-crowdy-studio-dsh-header';

    const brand = document.createElement('div');
    brand.className = 'ck-crowdy-studio-dsh-brand';
    this.connection = document.createElement('span');
    this.connection.className = 'ck-crowdy-studio-dsh-connection';
    this.connection.setAttribute('role', 'status');
    this.connection.setAttribute('aria-live', 'polite');
    const wordmark = document.createElement('h2');
    wordmark.textContent = 'Harness';
    brand.append(this.connection, wordmark);

    this.newSession = button('New');
    this.newSession.className = 'ck-crowdy-studio-dsh-new';
    this.newSession.title = 'New session';
    this.newSession.addEventListener('click', () => {
      void this.run(() => this.controller.createSession());
      options.layout?.setVisible('dsh', true);
    });
    this.sessionSelect = document.createElement('select');
    this.sessionSelect.className = 'ck-crowdy-studio-dsh-session-select';
    this.sessionSelect.setAttribute('aria-label', 'Harness session');
    this.sessionSelect.hidden = true;
    this.sessionSelect.addEventListener('change', () => {
      const sessionId = this.sessionSelect.value;
      if (!sessionId) return;
      void this.run(() => this.controller.selectSession(sessionId));
    });
    this.live = renderWorking('Working');
    this.live.className = 'ck-crowdy-studio-dsh-live';
    this.live.hidden = true;
    this.liveLabelEl = this.live.querySelector(
      '.ck-crowdy-studio-dsh-working-label',
    ) as HTMLElement;
    header.append(brand, this.sessionSelect, this.live, this.newSession);

    this.transcript = document.createElement('div');
    this.transcript.className = 'ck-crowdy-studio-dsh-transcript';
    this.transcript.setAttribute('role', 'log');
    this.transcript.setAttribute('aria-live', 'polite');
    this.transcript.setAttribute('aria-relevant', 'additions text');

    this.working = renderWorking('Working');
    this.working.hidden = true;
    this.workingLabelEl = this.working.querySelector(
      '.ck-crowdy-studio-dsh-working-label',
    ) as HTMLElement;

    this.errorBanner = document.createElement('p');
    this.errorBanner.className = 'ck-crowdy-studio-dsh-error';
    this.errorBanner.hidden = true;

    const form = document.createElement('form');
    form.className = 'ck-crowdy-studio-dsh-composer';
    this.composer = document.createElement('textarea');
    this.composer.rows = 1;
    this.composer.maxLength = 32_768;
    this.composer.placeholder = 'Ask anything…';
    this.composer.setAttribute('aria-label', 'Message DeepSeek Harness');
    const actions = document.createElement('div');
    actions.className = 'ck-crowdy-studio-dsh-composer-actions';
    this.stop = button('Stop');
    this.stop.className = 'ck-crowdy-studio-dsh-stop';
    this.stop.hidden = true;
    this.stop.addEventListener('click', (event) => {
      event.preventDefault();
      void this.run(() => this.controller.cancel());
    });
    this.send = button('', 'submit');
    this.send.className = 'ck-crowdy-studio-dsh-send';
    this.send.append(sendIcon());
    this.send.setAttribute('aria-label', 'Send');
    actions.append(this.stop, this.send);
    form.append(this.composer, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const content = this.composer.value;
      if (!content.trim()) return;
      this.composer.value = '';
      resizeComposer(this.composer);
      void this.run(async () => {
        await this.controller.sendMessage(content);
        options.layout?.setVisible('dsh', true);
      });
    });
    this.composer.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    this.composer.addEventListener('input', () => resizeComposer(this.composer));

    this.root.append(
      header,
      this.transcript,
      this.working,
      this.errorBanner,
      form,
    );
    host.appendChild(this.root);

    this.unsubscribe = this.controller.subscribe((state) => this.render(state));
    this.render(this.controller.getState());
  }

  /**
   * Prefill the composer and reveal Harness. Does not send — the human
   * edits or hits Send. Used by Problems / Invoke "Add to chat".
   */
  prefillComposer(content: string): void {
    this.options.layout?.setVisible('dsh', true);
    const clipped = content.slice(0, this.composer.maxLength);
    this.composer.value = clipped;
    resizeComposer(this.composer);
    this.composer.focus();
    const caret = clipped.length;
    this.composer.setSelectionRange(caret, caret);
  }

  /** Current composer text (for appending into an existing draft). */
  getComposerValue(): string {
    return this.composer.value;
  }

  /** Reveal Harness and send immediately. */
  async askWithMessage(content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) return;
    this.options.layout?.setVisible('dsh', true);
    this.composer.value = '';
    resizeComposer(this.composer);
    await this.controller.sendMessage(trimmed);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.root.remove();
  }

  private render(state: CrowdyStudioDshState): void {
    if (this.disposed) return;

    const working = dshShouldShowWorking(state.messages, state.busy);
    const workingLabel = dshWorkingLabel(state.messages);
    this.connection.dataset.connection = state.connection;
    this.connection.dataset.busy = String(working);
    this.connection.title = statusTitle(state, working);
    this.connection.textContent = '';
    this.root.dataset.busy = String(working);
    this.working.hidden = !working;
    this.live.hidden = !working;
    if (this.workingLabelEl.textContent !== workingLabel) {
      this.workingLabelEl.textContent = workingLabel;
    }
    if (this.liveLabelEl.textContent !== workingLabel) {
      this.liveLabelEl.textContent = workingLabel;
    }
    const liveLabel = working
      ? `Harness is working: ${workingLabel}`
      : 'Harness is idle';
    this.working.setAttribute('aria-label', liveLabel);
    this.live.setAttribute('aria-label', liveLabel);

    this.sessionSelect.replaceChildren();
    this.sessionSelect.hidden = state.sessions.length === 0;
    for (const session of state.sessions) {
      const option = document.createElement('option');
      option.value = session.sessionId;
      option.textContent = session.title || 'Untitled';
      option.selected = session.sessionId === state.activeSessionId;
      this.sessionSelect.append(option);
    }

    const transcriptKey = transcriptRenderKey(state);
    if (transcriptKey !== this.lastTranscriptKey) {
      const pinnedToBottom =
        this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight <
        48;
      const scrollTop = this.transcript.scrollTop;
      const openCards = new Set(
        Array.from(this.transcript.querySelectorAll('details[open]')).map(
          (card) => (card as HTMLElement).dataset.seq ?? '',
        ),
      );
      this.lastTranscriptKey = transcriptKey;
      this.transcript.replaceChildren();
      if (state.messages.length === 0 && !state.busy) {
        const empty = document.createElement('div');
        empty.className = 'ck-crowdy-studio-dsh-empty';
        const heading = document.createElement('p');
        heading.className = 'ck-crowdy-studio-dsh-empty-title';
        heading.textContent = state.activeSessionId
          ? 'What can I help you with?'
          : 'Start a Harness session';
        const hint = document.createElement('p');
        hint.textContent = state.activeSessionId
          ? 'Ask anything about this workspace.'
          : 'New starts a session for the open Studio project.';
        empty.append(heading, hint);
        this.transcript.append(empty);
      } else {
        for (const message of state.messages) {
          if (message.kind === 'turn-end') continue;
          this.transcript.append(
            renderMessage(message, {
              busy: state.busy,
              open: openCards.has(String(message.seq)),
              onAnswer: (text) => {
                void this.run(async () => {
                  await this.controller.sendMessage(text);
                  this.options.layout?.setVisible('dsh', true);
                });
              },
            }),
          );
        }
        if (pinnedToBottom) {
          this.transcript.scrollTop = this.transcript.scrollHeight;
        } else {
          this.transcript.scrollTop = scrollTop;
        }
      }
    }

    this.errorBanner.hidden = !state.lastError;
    this.errorBanner.textContent = state.lastError ?? '';

    const blocked = state.connection === 'error';
    this.send.disabled = blocked;
    this.newSession.disabled = blocked;
    this.stop.hidden = !working;
    this.composer.disabled = blocked;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      console.warn('Crowdy Studio Harness dock action failed', error);
    }
  }
}

function renderMessage(
  message: CrowdyStudioDshMessage,
  options: {
    busy: boolean;
    open: boolean;
    onAnswer: (text: string) => void;
  },
): HTMLElement {
  const questions = questionsFromMessage(message);
  if (questions) {
    return renderQuestion(message, questions, options);
  }

  if (message.kind === 'tool' || message.kind === 'todo' || message.kind === 'thinking') {
    const details = document.createElement('details');
    details.className = 'ck-crowdy-studio-dsh-card';
    details.dataset.kind = message.kind;
    details.dataset.seq = String(message.seq);
    if (options.open || /^Error\b/i.test(message.text) || message.title === 'Error') {
      details.open = true;
    }
    const summary = document.createElement('summary');
    summary.textContent = message.title || labelForKind(message.kind);
    const body = document.createElement('pre');
    body.textContent = message.text;
    details.append(summary, body);
    return details;
  }

  const row = document.createElement('article');
  row.className = 'ck-crowdy-studio-dsh-message';
  row.dataset.kind = message.kind;
  row.dataset.role = message.role;
  if (message.kind === 'error') {
    const setup = /OPENROUTER_API_KEY|DEEPSEEK_API_KEY/.test(message.text);
    if (setup) row.dataset.setup = 'true';
    const title = document.createElement('strong');
    title.textContent =
      message.title || (setup ? 'Add an OpenRouter API key' : 'Error');
    const body = document.createElement('p');
    body.textContent = message.text;
    row.append(title, body);
    return row;
  }

  const bubble = document.createElement('div');
  bubble.className = 'ck-crowdy-studio-dsh-bubble';
  if (message.kind === 'assistant') {
    fillMarkdown(bubble, message.text);
  } else {
    fillBody(bubble, message.text);
  }
  row.append(bubble);
  return row;
}

function questionsFromMessage(message: CrowdyStudioDshMessage) {
  if (!looksLikeAskUserQuestion(message)) return null;
  return parseAskUserQuestions(message.text) ?? [];
}

function renderQuestion(
  message: CrowdyStudioDshMessage,
  questions: NonNullable<ReturnType<typeof parseAskUserQuestions>> | [],
  options: {
    busy: boolean;
    onAnswer: (text: string) => void;
  },
): HTMLElement {
  const card = document.createElement('article');
  card.className = 'ck-crowdy-studio-dsh-question';
  card.dataset.kind = 'question';
  card.dataset.seq = String(message.seq);

  const heading = document.createElement('header');
  heading.className = 'ck-crowdy-studio-dsh-question-kicker';
  heading.textContent = questions.length > 1 ? 'Questions' : 'Question';
  card.append(heading);

  const items =
    questions.length > 0
      ? questions
      : [
          {
            id: 'custom',
            question: message.title?.trim() || 'The agent needs a decision from you.',
            options: [],
          },
        ];

  for (const question of items) {
    card.append(renderQuestionPrompt(question, options));
  }
  return card;
}

function renderQuestionPrompt(
  question: {
    id: string;
    question: string;
    options: Array<{ label: string; description: string }>;
  },
  options: {
    busy: boolean;
    onAnswer: (text: string) => void;
  },
): HTMLElement {
  const block = document.createElement('div');
  block.className = 'ck-crowdy-studio-dsh-question-block';

  const prompt = document.createElement('p');
  prompt.className = 'ck-crowdy-studio-dsh-question-prompt';
  prompt.textContent = question.question;

  const select = document.createElement('select');
  select.className = 'ck-crowdy-studio-dsh-question-select';
  select.setAttribute('aria-label', question.question);
  // The turn is often still "busy" while the tool waits for this answer.
  select.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose an option…';
  select.append(placeholder);
  question.options.forEach((option, index) => {
    const choice = document.createElement('option');
    choice.value = String(index);
    choice.textContent = option.description
      ? `${option.label} — ${option.description}`
      : option.label;
    select.append(choice);
  });
  const other = document.createElement('option');
  other.value = ASK_USER_CUSTOM_OPTION;
  other.textContent = 'Other…';
  select.append(other);

  const custom = document.createElement('textarea');
  custom.className = 'ck-crowdy-studio-dsh-question-custom';
  custom.rows = 2;
  custom.placeholder = 'Type your own answer…';
  custom.hidden = true;
  custom.disabled = false;

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'ck-crowdy-studio-dsh-question-submit';
  submit.textContent = 'Continue';
  submit.disabled = true;

  const syncSubmit = (): void => {
    const usingCustom = select.value === ASK_USER_CUSTOM_OPTION;
    custom.hidden = !usingCustom;
    submit.disabled =
      !select.value || (usingCustom && !custom.value.trim());
  };
  select.addEventListener('change', syncSubmit);
  custom.addEventListener('input', syncSubmit);
  custom.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit.click();
    }
  });
  submit.addEventListener('click', () => {
    if (submit.disabled) return;
    const usingCustom = select.value === ASK_USER_CUSTOM_OPTION;
    const picked =
      !usingCustom && select.value !== ''
        ? (question.options[Number(select.value)] ?? null)
        : null;
    const reply = formatAskUserQuestionReply({
      question,
      option: picked,
      customText: usingCustom ? custom.value : '',
    });
    if (!reply) return;
    options.onAnswer(reply);
  });

  block.append(prompt, select, custom, submit);
  return block;
}

function transcriptRenderKey(state: CrowdyStudioDshState): string {
  return JSON.stringify({
    busy: state.busy,
    sessionId: state.activeSessionId,
    empty: state.messages.length === 0,
    messages: state.messages.map((message) => [
      message.seq,
      message.kind,
      message.title,
      message.text,
    ]),
  });
}

function renderWorking(label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ck-crowdy-studio-dsh-working';
  row.setAttribute('aria-live', 'polite');
  const dots = document.createElement('span');
  dots.className = 'ck-crowdy-studio-dsh-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) {
    dots.append(document.createElement('i'));
  }
  const text = document.createElement('span');
  text.className = 'ck-crowdy-studio-dsh-working-label';
  text.textContent = label;
  row.append(dots, text);
  return row;
}

function fillBody(target: HTMLElement, text: string): void {
  const parts = text.split(/```/);
  if (parts.length === 1) {
    const body = document.createElement('p');
    body.textContent = text;
    target.append(body);
    return;
  }
  parts.forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 1) {
      const pre = document.createElement('pre');
      const fence = part.replace(/^[a-zA-Z0-9_-]+\n/, '');
      pre.textContent = fence;
      target.append(pre);
    } else {
      const body = document.createElement('p');
      body.textContent = part.replace(/^\n+|\n+$/g, '');
      if (body.textContent) target.append(body);
    }
  });
}

function statusTitle(state: CrowdyStudioDshState, working: boolean): string {
  const parts: string[] = [state.connection];
  if (working) parts.push(`working · ${dshWorkingLabel(state.messages)}`);
  if (state.projectId) parts.push(`project ${state.projectId}`);
  if (state.lastError) parts.push(state.lastError);
  return parts.join(' · ');
}

function labelForKind(kind: CrowdyStudioDshMessage['kind']): string {
  if (kind === 'thinking') return 'Thought';
  if (kind === 'todo') return 'Todos';
  return 'Tool';
}

function resizeComposer(composer: HTMLTextAreaElement): void {
  composer.style.height = 'auto';
  composer.style.height = `${Math.min(Math.max(composer.scrollHeight, 24), 160)}px`;
}

function button(label: string, type: 'button' | 'submit' = 'button'): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = type;
  control.textContent = label;
  return control;
}

function sendIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M3.4 20.6 21 12 3.4 3.4l.1 6.8L15 12l-11.5 1.8z',
  );
  svg.append(path);
  return svg;
}
