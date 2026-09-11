/**
 * The Studio agent pane: a same-origin iframe hosting the DeepSeek Harness
 * web UI (running in a Web Worker) plus the Crowdy chrome around it — the
 * provider-data notice the player accepts once, a Screenshot button, the
 * payer / spend line, and the bridge status.
 *
 * The harness owns the conversation UI (chat, diffs, plan mode, approvals);
 * this pane owns what the game knows: who pays, whether the player consented,
 * and the capture button that pushes a frame into the model's `captures/`.
 */

import type { CrowdyStudioController } from '../crowdy-studio/controller.js';
import type { StudioLayoutController } from '../crowdy-studio/layout.js';
import { StudioDshBridge, type CrowdyStudioDshHost, type StudioDshBridgeStatus } from './bridge.js';
import { CrowdyStudioDshTransport, type CrowdyStudioModelUsage } from './transport.js';

export interface CrowdyStudioDshPaneOptions {
  controller: CrowdyStudioController;
  transport: CrowdyStudioDshTransport;
  appId: string;
  /** Where the packed harness page is served, e.g. `/dsh/`. */
  webBase: string;
  /** Stable per-player key for session persistence (never a token). */
  persistScope: string;
  getToken(): string | null;
  graphqlUrl: string;
  host?: CrowdyStudioDshHost;
  /** Studio origin for the wallet link; omitted hides the link. */
  studioOrigin?: string;
  layout?: StudioLayoutController;
  onWarning?(message: string): void;
}

const USAGE_REFRESH_MS = 30_000;

export class CrowdyStudioDshPane {
  readonly root: HTMLElement;
  readonly bridge: StudioDshBridge;
  private readonly frame: HTMLIFrameElement;
  private readonly status: HTMLElement;
  private readonly spend: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly captureButton: HTMLButtonElement;
  private readonly message: HTMLElement;
  private usageTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private disposed = false;

  constructor(
    parent: HTMLElement,
    private readonly options: CrowdyStudioDshPaneOptions,
  ) {
    this.root = el('section', 'ck-crowdy-studio-dsh');
    this.root.setAttribute('aria-label', 'Crowdy Studio agent');

    const header = el('header');
    const title = el('h2');
    title.textContent = 'Agent';
    this.status = el('span', 'ck-crowdy-studio-dsh-status');
    this.status.textContent = 'Starting…';
    this.captureButton = el('button', 'ck-crowdy-studio-dsh-capture');
    this.captureButton.type = 'button';
    this.captureButton.textContent = 'Screenshot';
    this.captureButton.title = 'Share what you see with the agent (saved under captures/)';
    this.captureButton.disabled = true;
    this.captureButton.addEventListener('click', () => {
      void this.run(async () => {
        const shot = await this.bridge.shareCapture('player capture');
        this.say(`Shared ${shot.name} (${shot.width}x${shot.height}) with the agent.`);
      });
    });
    header.append(title, this.status, this.captureButton);

    this.notice = el('div', 'ck-crowdy-studio-dsh-notice');
    this.notice.hidden = true;

    this.frame = document.createElement('iframe');
    this.frame.className = 'ck-crowdy-studio-dsh-frame';
    this.frame.title = 'Crowdy Studio agent';
    // Same-origin document; the harness needs scripts and its own worker.
    this.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
    this.frame.setAttribute('allow', 'clipboard-write');

    this.spend = el('div', 'ck-crowdy-studio-dsh-spend');
    this.message = el('div', 'ck-crowdy-studio-dsh-message');
    this.message.hidden = true;

    this.root.append(header, this.notice, this.frame, this.spend, this.message);
    parent.appendChild(this.root);

    this.bridge = new StudioDshBridge({
      controller: options.controller,
      transport: options.transport,
      appId: options.appId,
      persistScope: options.persistScope,
      getToken: options.getToken,
      graphqlUrl: options.graphqlUrl,
      host: options.host,
      onWarning: (text) => {
        this.say(text);
        options.onWarning?.(text);
      },
      onStatus: (status) => this.renderStatus(status),
      onFileChanged: (change) => this.say(`Agent updated ${change.target.toLowerCase()}/${change.path}.`),
    });
  }

  /** Boot once the pane is visible; the notice gates the first boot on consent. */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    try {
      const consent = await this.options.transport.consent(this.options.appId);
      if (!consent.consented) {
        this.started = false;
        this.renderNotice();
        this.status.textContent = 'Waiting for your OK';
        return;
      }
      await this.boot();
    } catch (error) {
      this.started = false;
      this.renderStatus({ phase: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.usageTimer) clearInterval(this.usageTimer);
    this.bridge.detach();
    this.root.remove();
  }

  private async boot(): Promise<void> {
    const base = this.options.webBase.endsWith('/') ? this.options.webBase : `${this.options.webBase}/`;
    this.frame.src = `${base}index.html`;
    await this.bridge.attach(this.frame);
    this.captureButton.disabled = !this.options.host?.captureFrame;
    await this.refreshUsage();
    this.usageTimer = setInterval(() => void this.refreshUsage(), USAGE_REFRESH_MS);
  }

  private renderNotice(): void {
    this.notice.hidden = false;
    this.notice.replaceChildren();
    const text = el('p');
    text.textContent =
      'The agent sends your project source, your messages and any screenshots you share to a model provider through Crowded Kingdoms (zero data retention, no training). ' +
      'Model usage is charged to your wallet at the app\'s rates unless the app pays for it.';
    const actions = el('div', 'ck-crowdy-studio-dsh-notice-actions');
    const accept = el('button');
    accept.type = 'button';
    accept.textContent = 'I understand, start the agent';
    accept.addEventListener('click', () => {
      void this.run(async () => {
        await this.options.transport.setConsent(this.options.appId, true);
        this.notice.hidden = true;
        this.started = true;
        await this.boot();
      });
    });
    actions.append(accept);
    this.notice.append(text, actions);
  }

  private renderStatus(status: StudioDshBridgeStatus): void {
    this.root.dataset.phase = status.phase;
    switch (status.phase) {
      case 'idle':
        this.status.textContent = '';
        break;
      case 'waiting-for-frame':
      case 'booting':
        this.status.textContent = 'Starting…';
        break;
      case 'ready':
        this.status.textContent = status.store ? 'Ready · GitHub' : 'Ready';
        this.status.title = status.store ?? '';
        break;
      case 'failed':
        this.status.textContent = 'Unavailable';
        this.say(status.message);
        break;
    }
  }

  private async refreshUsage(): Promise<void> {
    if (this.disposed) return;
    try {
      const usage = await this.options.transport.usage(this.options.appId, 1);
      this.renderSpend(usage);
    } catch {
      // Usage is informational; the endpoint enforces the budget.
    }
  }

  private renderSpend(usage: CrowdyStudioModelUsage): void {
    const spent = Number(usage.todayChargeMicrousd) / 1_000_000;
    const limit = Number(usage.dayLimitMicrousd) / 1_000_000;
    const payer =
      usage.payerKind === 'PLAYER' ? 'your wallet' : usage.payerKind === 'ORG' ? "the app's wallet" : 'the platform';
    this.spend.replaceChildren();
    const text = el('span');
    text.textContent = `Today: $${spent.toFixed(2)} of $${limit.toFixed(2)} · ${usage.todayRequests} requests · paid by ${payer}`;
    this.spend.append(text);
    if (usage.payerKind === 'PLAYER' && this.options.studioOrigin) {
      const link = el('a');
      link.href = `${this.options.studioOrigin.replace(/\/+$/, '')}/account/wallet`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Add funds';
      this.spend.append(' · ', link);
    }
  }

  private say(text: string): void {
    this.message.hidden = false;
    this.message.textContent = text;
  }

  private async run(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.say(error instanceof Error ? error.message : String(error));
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export const CROWDY_STUDIO_DSH_STYLES = `
.ck-crowdy-studio-dsh{flex:none;display:flex;flex-direction:column;min-width:0;min-height:0;border-left:1px solid var(--ck-line);background:#0b1220}
.ck-crowdy-studio-dsh>header{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--ck-line)}
.ck-crowdy-studio-dsh>header h2{margin:0;font-size:13px;flex:none}
.ck-crowdy-studio-dsh-status{flex:1;min-width:0;color:var(--ck-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-crowdy-studio-dsh[data-phase=failed] .ck-crowdy-studio-dsh-status{color:#fca5a5}
.ck-crowdy-studio-dsh-frame{flex:1;min-height:0;width:100%;border:0;background:#fff}
.ck-crowdy-studio-dsh-notice{padding:10px;font-size:12px;color:var(--ck-text);border-bottom:1px solid var(--ck-line)}
.ck-crowdy-studio-dsh-notice p{margin:0 0 8px}
.ck-crowdy-studio-dsh-notice-actions{display:flex;gap:6px}
.ck-crowdy-studio-dsh-spend{padding:4px 10px;font-size:11px;color:var(--ck-muted);border-top:1px solid var(--ck-line)}
.ck-crowdy-studio-dsh-spend a{color:#bae6fd}
.ck-crowdy-studio-dsh-message{padding:4px 10px;font-size:11px;color:#fde68a;border-top:1px solid var(--ck-line)}
`;
