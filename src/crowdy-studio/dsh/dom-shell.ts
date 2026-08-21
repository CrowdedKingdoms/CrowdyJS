import {
  type CrowdyStudioDshController,
  type CrowdyStudioDshState,
} from './controller.js';
import type { StudioLayoutController } from '../layout.js';

export interface CrowdyStudioDshDomShellOptions {
  layout?: StudioLayoutController;
}

/**
 * Secondary Studio dock for the local DeepSeek Harness bridge.
 *
 * Independent of {@link CrowdyStudioAgentDomShell}: session list + history +
 * composer only. The existing Crowdy Agent dock stays untouched.
 */
export class CrowdyStudioDshDomShell {
  readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly sessions: HTMLElement;
  private readonly messages: HTMLElement;
  private readonly composer: HTMLTextAreaElement;
  private readonly send: HTMLButtonElement;
  private readonly newSession: HTMLButtonElement;
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(
    host: HTMLElement,
    private readonly controller: CrowdyStudioDshController,
    options: CrowdyStudioDshDomShellOptions = {},
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'ck-crowdy-studio-dsh-dock';
    this.root.setAttribute('aria-label', 'DeepSeek Harness chat');

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Harness';
    this.status = document.createElement('span');
    this.status.className = 'ck-crowdy-studio-dsh-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    header.append(title, this.status);

    const toolbar = document.createElement('div');
    toolbar.className = 'ck-crowdy-studio-dsh-toolbar';
    this.newSession = button('New session');
    this.newSession.addEventListener('click', () => {
      void this.run(() => this.controller.createSession());
      options.layout?.setVisible('dsh', true);
    });
    toolbar.append(this.newSession);

    this.sessions = document.createElement('div');
    this.sessions.className = 'ck-crowdy-studio-dsh-sessions';
    this.sessions.setAttribute('role', 'listbox');
    this.sessions.setAttribute('aria-label', 'Harness sessions');

    this.messages = document.createElement('div');
    this.messages.className = 'ck-crowdy-studio-dsh-messages';
    this.messages.setAttribute('role', 'log');
    this.messages.setAttribute('aria-live', 'polite');

    const form = document.createElement('form');
    form.className = 'ck-crowdy-studio-dsh-composer';
    this.composer = document.createElement('textarea');
    this.composer.rows = 3;
    this.composer.maxLength = 32_768;
    this.composer.placeholder = 'Message the DeepSeek Harness…';
    this.composer.setAttribute('aria-label', 'Message DeepSeek Harness');
    this.send = button('Send', 'submit');
    form.append(this.composer, this.send);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const content = this.composer.value;
      if (!content.trim()) return;
      void this.run(async () => {
        await this.controller.sendMessage(content);
        this.composer.value = '';
        options.layout?.setVisible('dsh', true);
      });
    });

    this.root.append(
      header,
      toolbar,
      this.sessions,
      this.messages,
      form,
    );
    host.appendChild(this.root);

    this.unsubscribe = this.controller.subscribe((state) => this.render(state));
    this.render(this.controller.getState());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.root.remove();
  }

  private render(state: CrowdyStudioDshState): void {
    if (this.disposed) return;
    const statusParts: string[] = [state.connection];
    if (state.busy) statusParts.push('working');
    if (state.projectId) statusParts.push(`project ${state.projectId.slice(0, 8)}…`);
    if (state.lastError) statusParts.push(state.lastError);
    this.status.textContent = statusParts.join(' · ');
    this.status.dataset.connection = state.connection;
    this.status.dataset.error = state.lastError ? 'true' : 'false';

    this.sessions.replaceChildren();
    if (state.sessions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ck-crowdy-studio-dsh-empty';
      empty.textContent = 'No Harness sessions yet. Start one for this project.';
      this.sessions.append(empty);
    } else {
      for (const session of state.sessions) {
        const item = button(session.title || session.sessionId.slice(0, 8));
        item.className = 'ck-crowdy-studio-dsh-session';
        item.setAttribute('role', 'option');
        item.setAttribute(
          'aria-selected',
          String(session.sessionId === state.activeSessionId),
        );
        item.dataset.active = String(session.sessionId === state.activeSessionId);
        item.title = session.sessionId;
        item.addEventListener('click', () => {
          void this.run(() => this.controller.selectSession(session.sessionId));
        });
        this.sessions.append(item);
      }
    }

    this.messages.replaceChildren();
    if (state.messages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ck-crowdy-studio-dsh-empty';
      empty.textContent = state.activeSessionId
        ? 'Send a message to start this Harness turn.'
        : 'Select or create a session.';
      this.messages.append(empty);
    } else {
      for (const message of state.messages) {
        const bubble = document.createElement('article');
        bubble.className = 'ck-crowdy-studio-dsh-message';
        bubble.dataset.role = message.role;
        const label = document.createElement('strong');
        label.textContent = message.role;
        const body = document.createElement('p');
        body.textContent = message.text;
        bubble.append(label, body);
        this.messages.append(bubble);
      }
      this.messages.scrollTop = this.messages.scrollHeight;
    }

    this.send.disabled = state.busy || state.connection === 'error';
    this.newSession.disabled = state.busy || state.connection === 'error';
    this.composer.disabled = state.busy;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      console.warn('Crowdy Studio Harness dock action failed', error);
    }
  }
}

function button(label: string, type: 'button' | 'submit' = 'button'): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = type;
  control.textContent = label;
  return control;
}
