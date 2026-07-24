import type { CrowdyAgentLeaseV1 } from '../crowdy-agent/types.js';
import type { CrowdyStudioAgentStateV1 } from '../crowdy-agent/controller.js';
import type {
  PlayerControlGate,
  PlayerControlGateSnapshot,
} from './control-gate.js';

export interface AgentControlBannerController {
  getState(): CrowdyStudioAgentStateV1;
  subscribe(listener: (state: CrowdyStudioAgentStateV1) => void): () => void;
}

/**
 * Always-visible-on-control safety surface outside the Studio dock. Text,
 * status, Pause, and Stop remain keyboard/screen-reader accessible over the
 * game canvas; Stop clears locally before any transport promise is attempted.
 */
export class AgentControlBanner {
  readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly expiry: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private controller: AgentControlBannerController | null = null;
  private agentState: CrowdyStudioAgentStateV1 | null = null;
  private gateState: PlayerControlGateSnapshot;
  private unsubscribeAgent: (() => void) | null = null;
  private unsubscribeGate: (() => void) | null = null;
  private readonly countdown: ReturnType<typeof setInterval>;

  constructor(
    parent: HTMLElement,
    private readonly gate: PlayerControlGate,
  ) {
    ensureAgentControlBannerStyles(parent.ownerDocument);
    const root = document.createElement('aside');
    root.className = 'ck-agent-control-banner';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Agent player control');
    root.hidden = true;

    const title = document.createElement('strong');
    title.textContent = 'Crowdy Agent';
    this.summary = document.createElement('span');
    this.summary.className = 'ck-agent-control-summary';
    this.summary.setAttribute('role', 'status');
    this.summary.setAttribute('aria-live', 'polite');
    this.expiry = document.createElement('span');
    this.expiry.className = 'ck-agent-control-expiry';

    const controls = document.createElement('div');
    controls.className = 'ck-agent-control-actions';
    this.pauseButton = button('Pause agent');
    this.pauseButton.addEventListener('click', () => this.gate.pause());
    this.stopButton = button('Stop agent');
    this.stopButton.className = 'ck-agent-control-stop';
    this.stopButton.addEventListener('click', () => this.gate.stop());
    controls.append(this.pauseButton, this.stopButton);
    root.append(title, this.summary, this.expiry, controls);
    parent.append(root);
    this.root = root;
    this.gateState = gate.snapshot();
    this.unsubscribeGate = gate.subscribe((state) => {
      this.gateState = state;
      this.render();
    });
    this.countdown = setInterval(() => this.render(), 500);
  }

  bind(controller: AgentControlBannerController): () => void {
    this.unbind();
    this.controller = controller;
    this.agentState = controller.getState();
    this.unsubscribeAgent = controller.subscribe((state) => {
      this.agentState = state;
      this.render();
    });
    this.render();
    return () => {
      if (this.controller === controller) this.unbind();
    };
  }

  showUnavailable(message: string): void {
    this.unbind();
    this.root.hidden = false;
    this.root.dataset.state = 'unavailable';
    this.summary.textContent = `Agent unavailable · ${message.slice(0, 240)}`;
    this.expiry.textContent = 'Gameplay remains under human control.';
    this.pauseButton.disabled = true;
    this.stopButton.disabled = false;
  }

  unbind(): void {
    this.unsubscribeAgent?.();
    this.unsubscribeAgent = null;
    this.controller = null;
    this.agentState = null;
    this.root.hidden = true;
    this.root.removeAttribute('data-state');
  }

  destroy(): void {
    this.unbind();
    this.unsubscribeGate?.();
    this.unsubscribeGate = null;
    clearInterval(this.countdown);
    this.root.remove();
  }

  private render(): void {
    const state = this.agentState;
    if (!state || !this.controller) return;
    this.gateState = this.gate.snapshot();
    const lease = activePlayLease(
      state.leases,
      this.gateState.activeLease,
      this.gateState.bound,
    );
    const mode = state.session?.mode ?? 'ASK';
    const unavailable =
      state.connection === 'ERROR' ||
      (state.lastError !== null && state.connection !== 'CONNECTED');
    this.root.hidden =
      !unavailable &&
      !lease &&
      mode !== 'PLAY' &&
      state.connection === 'DISCONNECTED';
    this.root.dataset.state = unavailable
      ? 'unavailable'
      : lease
        ? 'active'
        : 'idle';
    this.summary.textContent = unavailable
      ? `Agent disabled · ${state.lastError?.code ?? 'backend unavailable'}`
      : [
          `Mode ${mode}`,
          lease
            ? `entity ${lease.controlledEntityId ?? 'unknown'}`
            : 'human control',
          lease
            ? `scopes ${lease.scopes.join(', ') || 'none'}`
            : 'no Play lease',
        ].join(' · ');
    if (lease) {
      const remaining = Math.max(
        0,
        Math.ceil((Date.parse(lease.expiresAt) - Date.now()) / 1_000),
      );
      this.expiry.textContent = `Control expires in ${remaining} seconds`;
    } else if (this.gateState.offlineStop) {
      this.expiry.textContent =
        'Stopped locally; server acknowledgement is not required.';
    } else if (state.reconnectRequired) {
      this.expiry.textContent =
        'Explicit resume and a new Play lease are required.';
    } else {
      this.expiry.textContent = state.connection
        .toLowerCase()
        .replace(/_/gu, ' ');
    }
    this.pauseButton.disabled = !lease && state.session?.status !== 'ACTIVE';
    // Stop is a local safety action and intentionally never disabled.
    this.stopButton.disabled = false;
  }
}

function activePlayLease(
  leases: readonly CrowdyAgentLeaseV1[],
  localLease: CrowdyAgentLeaseV1 | null,
  gateBound: boolean,
): CrowdyAgentLeaseV1 | null {
  if (localLease?.kind === 'PLAY' && localLease.status === 'ACTIVE') {
    return localLease;
  }
  if (gateBound) return null;
  return (
    leases.find(
      (lease) => lease.kind === 'PLAY' && lease.status === 'ACTIVE',
    ) ?? null
  );
}

function button(label: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  return control;
}

const STYLE_ELEMENT_ID = 'ck-agent-control-banner-styles';

export function ensureAgentControlBannerStyles(
  doc: Document | null = typeof document === 'undefined' ? null : document,
): void {
  if (!doc || doc.getElementById(STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = AGENT_CONTROL_BANNER_STYLES;
  doc.head.appendChild(style);
}

/**
 * Injected presentation for the visible lease safety surface. Games that
 * dock a studio can set `--ck-game-right-inset` on `document.body` so the
 * banner keeps clear of the dock (the Crowdy Studio embed kit does this
 * automatically).
 */
export const AGENT_CONTROL_BANNER_STYLES = `
.ck-agent-control-banner {
  position: fixed;
  top: 12px;
  right: calc(12px + var(--ck-game-right-inset, 0px));
  z-index: 65;
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  max-width: min(760px, calc(100vw - var(--ck-game-right-inset, 0px) - 24px));
  padding: 9px 10px;
  border: 1px solid rgba(110, 231, 183, 0.65);
  border-radius: 10px;
  color: #ecfdf5;
  background: rgba(2, 44, 34, 0.94);
  box-shadow: 0 12px 30px rgba(2, 6, 23, 0.45);
  pointer-events: auto;
}

.ck-agent-control-banner[hidden] {
  display: none;
}

.ck-agent-control-banner[data-state="unavailable"] {
  border-color: rgba(251, 191, 36, 0.65);
  background: rgba(69, 26, 3, 0.94);
}

.ck-agent-control-summary,
.ck-agent-control-expiry {
  overflow: hidden;
  color: #d1fae5;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ck-agent-control-expiry {
  color: #a7f3d0;
}

.ck-agent-control-actions {
  display: flex;
  gap: 6px;
}

.ck-agent-control-actions button {
  padding: 6px 9px;
  border: 1px solid rgba(167, 243, 208, 0.5);
  border-radius: 7px;
  color: #ecfdf5;
  background: rgba(6, 78, 59, 0.85);
  cursor: pointer;
}

.ck-agent-control-actions .ck-agent-control-stop {
  border-color: rgba(254, 202, 202, 0.75);
  background: rgba(153, 27, 27, 0.9);
}

.ck-agent-control-actions button:focus-visible {
  outline: 2px solid #fef3c7;
  outline-offset: 2px;
}

@media (max-width: 900px) {
  .ck-agent-control-banner {
    right: 8px;
    left: 8px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    max-width: none;
  }

  .ck-agent-control-expiry {
    display: none;
  }
}

@media (max-width: 620px) {
  .ck-agent-control-banner {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ck-agent-control-banner > strong {
    display: none;
  }
}
`;
