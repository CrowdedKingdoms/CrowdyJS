import {
  type CrowdyStudioAgentController,
  type CrowdyStudioAgentStateV1,
} from '../crowdy-agent/controller.js';
import type { CrowdyAgentMode } from '../crowdy-agent/types.js';
import type { StudioLayoutController } from './layout.js';

const PLAY_SCOPES = [
  'observe',
  'locomotion',
  'interact',
  'craft',
  'combat',
  'communicate',
  'travel',
] as const;

export interface CrowdyStudioAgentDomShellOptions {
  getPlayLeaseContext?: () => {
    controlledEntityId: string;
    hostCapabilityRevision: string;
  } | null;
  /**
   * Optional studio layout controller. When present the dock participates in
   * the shared pane layout and auto-reveals itself for safety-critical
   * moments (pending exact approvals, an activating Play lease).
   */
  layout?: StudioLayoutController;
}

/**
 * Accessible, text-only rendering for the integrated durable agent dock.
 *
 * The conversation is the primary surface. Play-control, activity, and
 * change-tracking sections are collapsible disclosures so the dock stays
 * minimal, with one deliberate exception: pending exact approvals and the
 * active Play lease countdown always render prominently.
 */
export class CrowdyStudioAgentDomShell {
  readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly budget: HTMLElement;
  private readonly lease: HTMLElement;
  private readonly messages: HTMLElement;
  private readonly stream: HTMLElement;
  private readonly timeline: HTMLOListElement;
  private readonly approvals: HTMLElement;
  private readonly checkpoints: HTMLElement;
  private readonly composer: HTMLTextAreaElement;
  private readonly send: HTMLButtonElement;
  private readonly playDisclosure: HTMLDetailsElement;
  private readonly playSummary: HTMLElement;
  private readonly activityDisclosure: HTMLDetailsElement;
  private readonly activitySummary: HTMLElement;
  private readonly changesDisclosure: HTMLDetailsElement;
  private readonly changesSummary: HTMLElement;
  private readonly modeButtons = new Map<CrowdyAgentMode, HTMLButtonElement>();
  private readonly scopeInputs = new Map<string, HTMLInputElement>();
  private readonly unsubscribe: () => void;
  private readonly countdownTimer: ReturnType<typeof setInterval>;
  private lastState: CrowdyStudioAgentStateV1;
  private lastPendingApprovals = 0;
  private lastPlayLeaseActive = false;
  private disposed = false;

  constructor(
    host: HTMLElement,
    private readonly controller: CrowdyStudioAgentController,
    private readonly options: CrowdyStudioAgentDomShellOptions = {},
  ) {
    this.lastState = controller.getState();
    this.root = document.createElement('aside');
    this.root.className = 'ck-crowdy-studio-agent-dock';
    this.root.setAttribute('aria-label', 'Crowdy Studio agent');

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Crowdy Agent';
    this.status = document.createElement('span');
    this.status.className = 'ck-crowdy-studio-agent-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    header.append(title, this.status);

    const controlsRow = document.createElement('div');
    controlsRow.className = 'ck-crowdy-studio-agent-controls-row';
    const modeGroup = document.createElement('div');
    modeGroup.className = 'ck-crowdy-studio-agent-modes';
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', 'Agent mode');
    for (const mode of ['ASK', 'BUILD', 'PLAY'] as const) {
      const control = button(titleCase(mode));
      control.addEventListener('click', () => {
        void this.run(() => this.controller.setMode(mode));
      });
      control.setAttribute('aria-pressed', 'false');
      this.modeButtons.set(mode, control);
      modeGroup.append(control);
    }

    const controls = document.createElement('div');
    controls.className = 'ck-crowdy-studio-agent-controls';
    const pause = button('Pause');
    pause.addEventListener('click', () =>
      void this.run(() => this.controller.pause()),
    );
    const resume = button('Resume');
    resume.addEventListener('click', () =>
      void this.run(() => this.controller.resume()),
    );
    const stop = button('Stop');
    stop.className = 'ck-crowdy-studio-agent-stop';
    stop.addEventListener('click', () =>
      void this.run(() => this.controller.stop()),
    );
    controls.append(pause, resume, stop);
    controlsRow.append(modeGroup, controls);

    // Safety surfaces: approvals and the active Play lease stay prominent and
    // are never hidden behind a disclosure.
    this.approvals = document.createElement('section');
    this.approvals.className = 'ck-crowdy-studio-agent-approvals';
    this.approvals.setAttribute('aria-label', 'Pending exact approvals');
    this.lease = document.createElement('div');
    this.lease.className = 'ck-crowdy-studio-agent-lease';
    this.lease.setAttribute('role', 'status');
    this.lease.setAttribute('aria-label', 'Agent control lease');

    this.messages = document.createElement('div');
    this.messages.className = 'ck-crowdy-studio-agent-messages';
    this.messages.setAttribute('role', 'log');
    this.messages.setAttribute('aria-live', 'polite');
    this.messages.setAttribute('aria-relevant', 'additions text');
    this.stream = document.createElement('div');
    this.stream.className = 'ck-crowdy-studio-agent-stream';
    this.stream.setAttribute('aria-label', 'Streaming assistant response');
    this.messages.append(this.stream);

    const form = document.createElement('form');
    form.className = 'ck-crowdy-studio-agent-composer';
    this.composer = document.createElement('textarea');
    this.composer.maxLength = 32_768;
    this.composer.rows = 3;
    this.composer.placeholder = 'Ask, build, or play…';
    this.composer.setAttribute('aria-label', 'Message Crowdy Agent');
    this.send = button('Send', 'submit');
    form.append(this.composer, this.send);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const content = this.composer.value;
      if (!content.trim()) return;
      void this.run(async () => {
        await this.controller.sendMessage(content);
        this.composer.value = '';
      });
    });
    this.composer.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    // Collapsible secondary sections.
    const playBody = document.createElement('div');
    const leaseControls = document.createElement('fieldset');
    leaseControls.className = 'ck-crowdy-studio-agent-lease-controls';
    const leaseLegend = document.createElement('legend');
    leaseLegend.textContent = 'Play lease scopes';
    leaseControls.append(leaseLegend);
    for (const scope of PLAY_SCOPES) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = scope;
      input.checked = scope === 'observe';
      this.scopeInputs.set(scope, input);
      const text = document.createElement('span');
      text.textContent = scope.replace('_', ' ');
      label.append(input, text);
      leaseControls.append(label);
    }
    const grant = button('Grant 60 second Play lease');
    grant.addEventListener('click', () => {
      const context = this.options.getPlayLeaseContext?.();
      if (!context) {
        this.status.textContent =
          'The game host must advertise a controlled entity before Play.';
        return;
      }
      const scopes = [...this.scopeInputs]
        .filter(([, input]) => input.checked)
        .map(([scope]) => scope);
      void this.run(() =>
        this.controller.grantPlayLease({
          scopes,
          durationSeconds: 60,
          ...context,
        }),
      );
    });
    leaseControls.append(grant);
    playBody.append(leaseControls);
    [this.playDisclosure, this.playSummary] = disclosure(
      'Play control',
      playBody,
    );

    this.timeline = document.createElement('ol');
    this.timeline.className = 'ck-crowdy-studio-agent-timeline';
    this.timeline.setAttribute('aria-label', 'Agent plan and tool timeline');
    [this.activityDisclosure, this.activitySummary] = disclosure(
      'Activity',
      this.timeline,
    );

    this.checkpoints = document.createElement('section');
    this.checkpoints.className = 'ck-crowdy-studio-agent-checkpoints';
    this.checkpoints.setAttribute('aria-label', 'Agent diffs and checkpoints');
    [this.changesDisclosure, this.changesSummary] = disclosure(
      'Changes',
      this.checkpoints,
    );

    this.budget = document.createElement('div');
    this.budget.className = 'ck-crowdy-studio-agent-budget';
    this.budget.setAttribute('aria-label', 'Agent budget');

    this.root.append(
      header,
      controlsRow,
      this.approvals,
      this.lease,
      this.messages,
      form,
      this.playDisclosure,
      this.activityDisclosure,
      this.changesDisclosure,
      this.budget,
    );
    host.dataset.agent = 'true';
    host.append(this.root);
    this.unsubscribe = controller.subscribe((state) => this.render(state));
    this.countdownTimer = setInterval(() => this.renderLease(this.lastState), 1_000);
    this.render(this.lastState);
  }

  render(state: CrowdyStudioAgentStateV1): void {
    if (this.disposed) return;
    this.lastState = state;
    this.status.textContent = state.lastError
      ? `${state.connection} · ${state.lastError.code}: ${state.lastError.message}`
      : state.reconnectRequired
        ? `${state.connection} · explicit resume required`
        : state.connection;
    const mode = state.session?.mode;
    for (const [candidate, control] of this.modeButtons) {
      control.setAttribute('aria-pressed', String(candidate === mode));
      control.dataset.active = String(candidate === mode);
      control.disabled = state.connection !== 'CONNECTED';
    }
    this.send.disabled =
      state.connection !== 'CONNECTED' ||
      state.session?.status !== 'ACTIVE';
    this.renderBudget(state);
    this.renderLease(state);
    this.renderMessages(state);
    this.renderTimeline(state);
    this.renderApprovals(state);
    this.renderCheckpoints(state);
    this.autoReveal(state);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.countdownTimer);
    this.unsubscribe();
    this.root.remove();
  }

  /**
   * Safety-critical auto-reveal: a newly pending exact approval or a Play
   * lease activation opens the dock and the Play disclosure so the human is
   * always shown what needs their decision or is acting on their behalf.
   */
  private autoReveal(state: CrowdyStudioAgentStateV1): void {
    const pending = state.approvals.filter(
      (approval) => approval.status === 'PENDING',
    ).length;
    const playLeaseActive = state.leases.some(
      (lease) => lease.kind === 'PLAY' && lease.status === 'ACTIVE',
    );
    if (pending > this.lastPendingApprovals) {
      this.options.layout?.setVisible('agent', true);
    }
    if (playLeaseActive && !this.lastPlayLeaseActive) {
      this.options.layout?.setVisible('agent', true);
      this.playDisclosure.open = true;
    }
    if (state.session?.mode === 'PLAY' && !playLeaseActive) {
      this.playDisclosure.open = true;
    }
    this.lastPendingApprovals = pending;
    this.lastPlayLeaseActive = playLeaseActive;
  }

  private renderBudget(state: CrowdyStudioAgentStateV1): void {
    if (!state.budget) {
      this.budget.textContent = 'Budget unavailable';
      return;
    }
    const dimensions = state.budget.dimensions.map(
      (dimension) =>
        `${dimension.name.toLowerCase().replace(/_/gu, ' ')} ${dimension.consumed}/${dimension.limit} ${dimension.unit}`,
    );
    this.budget.textContent = [
      state.budget.platformFunded ? 'Platform-funded pilot' : state.budget.payer,
      ...dimensions,
    ].join(' · ');
  }

  private renderLease(state: CrowdyStudioAgentStateV1): void {
    const lease = state.leases.find(
      (entry) => entry.kind === 'PLAY' && entry.status === 'ACTIVE',
    );
    if (!lease) {
      this.lease.textContent = 'No active Play lease';
      this.lease.dataset.active = 'false';
      this.playSummary.textContent = 'Play control';
      return;
    }
    const remaining = Math.max(
      0,
      Math.ceil((Date.parse(lease.expiresAt) - Date.now()) / 1_000),
    );
    this.lease.dataset.active = 'true';
    this.lease.textContent = [
      `Play lease: ${remaining}s`,
      `holder ${lease.holder}`,
      `entity ${lease.controlledEntityId ?? 'none'}`,
      `scopes ${lease.scopes.join(', ')}`,
    ].join(' · ');
    this.playSummary.textContent = `Play control · lease ${remaining}s`;
  }

  private renderMessages(state: CrowdyStudioAgentStateV1): void {
    const rows = state.messages.map((message) => {
      const article = document.createElement('article');
      article.className = 'ck-crowdy-studio-agent-message';
      article.dataset.role = message.role;
      const author = document.createElement('strong');
      author.textContent = message.role === 'USER' ? 'You' : 'Crowdy Agent';
      const content = document.createElement('p');
      content.textContent = message.content;
      article.append(author, content);
      return article;
    });
    this.messages.replaceChildren(...rows, this.stream);
    this.stream.textContent = state.streamingText;
    this.stream.hidden = state.streamingText.length === 0;
  }

  private renderTimeline(state: CrowdyStudioAgentStateV1): void {
    const runItems = state.events
      .filter((event) => event.type.startsWith('RUN_'))
      .map((event) => {
        const item = document.createElement('li');
        item.dataset.status = event.type;
        const title = document.createElement('strong');
        title.textContent = event.type.replace(/_/gu, ' ').toLowerCase();
        const timestamp = document.createElement('span');
        timestamp.textContent = event.createdAt;
        item.append(title, timestamp);
        const payload = event.payload as {
          code?: string;
          reason?: string;
          error?: { code: string; message: string };
        };
        if (payload.code || payload.reason || payload.error) {
          const detail = document.createElement('p');
          detail.textContent = [
            payload.code,
            payload.reason,
            payload.error
              ? `${payload.error.code}: ${payload.error.message}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ');
          item.append(detail);
        }
        return item;
      });
    const toolItems = state.tools.map((tool) => {
      const item = document.createElement('li');
      item.dataset.status = tool.status;
      const title = document.createElement('strong');
      title.textContent = `${tool.name} ${tool.version}`;
      const status = document.createElement('span');
      status.textContent = tool.status.replace(/_/gu, ' ').toLowerCase();
      item.append(title, status);
      if (tool.safeSummary) {
        const summary = document.createElement('p');
        summary.textContent = tool.safeSummary;
        item.append(summary);
      }
      if (tool.error) {
        const error = document.createElement('p');
        error.textContent = `${tool.error.code}: ${tool.error.message}`;
        item.append(error);
      }
      return item;
    });
    const items = [...runItems, ...toolItems];
    this.timeline.replaceChildren(...items);
    this.activitySummary.textContent =
      items.length > 0 ? `Activity (${items.length})` : 'Activity';
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = 'No tool activity.';
      this.timeline.append(empty);
    }
  }

  private renderApprovals(state: CrowdyStudioAgentStateV1): void {
    const pending = state.approvals.filter(
      (approval) => approval.status === 'PENDING',
    );
    const cards = pending.map((approval) => {
      const card = document.createElement('article');
      card.className = 'ck-crowdy-studio-agent-approval';
      const tool = state.tools.find(
        (entry) => entry.toolCallId === approval.toolCallId,
      );
      const title = heading(
        tool
          ? `Exact approval: ${tool.name} ${tool.version}`
          : 'Exact approval required',
        3,
      );
      const summary = document.createElement('p');
      summary.textContent = `Server-verified execution plan: ${approval.safeSummary}`;
      const call = document.createElement('p');
      call.textContent = `Tool call ${approval.toolCallId}`;
      const reasons = document.createElement('p');
      reasons.textContent = approval.reasons.join(' · ');
      const hash = document.createElement('code');
      hash.textContent = approval.argumentHash;
      const expiry = document.createElement('p');
      expiry.textContent = `Expires ${approval.expiresAt}`;
      const actions = document.createElement('div');
      const approve = button('Approve exact call');
      approve.addEventListener('click', () =>
        void this.run(() =>
          this.controller.approveTool(
            approval.toolCallId,
            approval.argumentHash,
          ),
        ),
      );
      const deny = button('Deny');
      deny.addEventListener('click', () =>
        void this.run(() => this.controller.rejectTool(approval.toolCallId)),
      );
      actions.append(approve, deny);
      card.append(title, call, summary, reasons, hash, expiry, actions);
      return card;
    });
    this.approvals.replaceChildren(...cards);
    this.approvals.hidden = cards.length === 0;
  }

  private renderCheckpoints(state: CrowdyStudioAgentStateV1): void {
    const diffTools = state.tools.filter(
      (tool) =>
        tool.name === 'workspace.file.patch' ||
        tool.name === 'workspace.conflict.resolve',
    );
    const cards: HTMLElement[] = diffTools.map((tool) => {
      const card = document.createElement('article');
      card.className = 'ck-crowdy-studio-agent-diff';
      const title = heading('Project diff', 3);
      const summary = document.createElement('p');
      summary.textContent =
        tool.safeSummary ?? `${tool.name} · ${tool.status.toLowerCase()}`;
      card.append(title, summary);
      return card;
    });
    for (const checkpoint of state.checkpoints) {
      const card = document.createElement('article');
      card.className = 'ck-crowdy-studio-agent-checkpoint';
      const title = heading('Checkpoint', 3);
      const detail = document.createElement('p');
      detail.textContent = `${checkpoint.checkpointId} · revision ${checkpoint.projectRevision} · ${checkpoint.reason.toLowerCase().replace(/_/gu, ' ')}`;
      const restore = button('Restore checkpoint');
      restore.addEventListener('click', () =>
        void this.run(() =>
          this.controller.restoreCheckpoint(checkpoint.checkpointId),
        ),
      );
      card.append(title, detail, restore);
      cards.push(card);
    }
    this.checkpoints.replaceChildren(...cards);
    this.changesSummary.textContent =
      cards.length > 0 ? `Changes (${cards.length})` : 'Changes';
    if (cards.length === 0) {
      const none = document.createElement('p');
      none.className = 'ck-crowdy-studio-empty';
      none.textContent = 'No agent edits or checkpoints yet.';
      this.checkpoints.append(none);
    }
  }

  private async run(operation: () => void | Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.status.textContent =
        error instanceof Error ? error.message : 'Agent action failed';
    }
  }
}

function disclosure(
  label: string,
  body: HTMLElement,
): [HTMLDetailsElement, HTMLElement] {
  const details = document.createElement('details');
  details.className = 'ck-crowdy-studio-agent-disclosure';
  const summary = document.createElement('summary');
  summary.textContent = label;
  details.append(summary, body);
  return [details, summary];
}

function button(
  label: string,
  type: 'button' | 'submit' = 'button',
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = type;
  control.textContent = label;
  return control;
}

function heading(
  text: string,
  level: 2 | 3 = 2,
): HTMLHeadingElement {
  const value = document.createElement(`h${level}`) as HTMLHeadingElement;
  value.textContent = text;
  return value;
}

function titleCase(value: string): string {
  return `${value[0]}${value.slice(1).toLowerCase()}`;
}
