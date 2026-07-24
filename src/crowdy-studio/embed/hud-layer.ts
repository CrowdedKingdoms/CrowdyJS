import { ensureCrowdyStudioEmbedStyles } from './embed-styles.js';

/**
 * A persistent, game-owned HUD layer for player-compute CLIENT mods. A
 * running client mod never touches the game DOM; it emits `hud_set` payloads
 * that the broker forwards here. This layer lives outside the studio panel so
 * a mod's HUD survives panel re-renders and keeps rendering after the coding
 * panel closes.
 *
 * The payload is untrusted mod output: it is rendered as text/simple
 * structured values only, never as HTML, so a mod cannot inject markup.
 */
export interface CrowdyStudioHudEntry {
  /** Stable source key (module name or listing id) so each mod owns one slot. */
  source: string;
  label: string;
  payload: unknown;
}

export class CrowdyStudioTextHud {
  private root: HTMLDivElement | null = null;
  private readonly entries = new Map<string, CrowdyStudioHudEntry>();
  private readonly previews = new Map<HTMLElement, string>();

  private ensureRoot(): HTMLDivElement {
    if (this.root) return this.root;
    ensureCrowdyStudioEmbedStyles();
    const root = document.createElement('div');
    root.className = 'ck-crowdy-studio-hud-layer';
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  /** Upsert the HUD slot for one mod source and re-render it. */
  set(entry: CrowdyStudioHudEntry): void {
    this.entries.set(entry.source, entry);
    this.render();
  }

  /** Remove a mod's HUD slot (on uninstall / stop / circuit trip). */
  remove(source: string): void {
    if (this.entries.delete(source)) this.render();
  }

  clear(): void {
    this.entries.clear();
    this.render();
  }

  /**
   * Mirror one source into a game-owned studio preview. The same text-only
   * renderer is used for the persistent HUD and preview, so untrusted
   * payloads never become arbitrary overlay DOM.
   */
  mountPreview(container: HTMLElement, source: string): () => void {
    this.previews.set(container, source);
    this.renderPreview(container, source);
    return () => {
      this.previews.delete(container);
      container.replaceChildren();
    };
  }

  destroy(): void {
    this.entries.clear();
    for (const container of this.previews.keys()) container.replaceChildren();
    this.previews.clear();
    this.root?.remove();
    this.root = null;
  }

  private render(): void {
    const root = this.ensureRoot();
    root.replaceChildren();
    for (const entry of this.entries.values()) {
      root.appendChild(this.entryCard(entry));
    }
    root.hidden = this.entries.size === 0;
    for (const [container, source] of this.previews) {
      this.renderPreview(container, source);
    }
  }

  private renderPreview(container: HTMLElement, source: string): void {
    container.replaceChildren();
    const entry = this.entries.get(source);
    if (entry) {
      const card = this.entryCard(entry);
      card.className += ' ck-crowdy-studio-hud-preview-card';
      container.appendChild(card);
      return;
    }
    const empty = document.createElement('p');
    empty.className = 'ck-crowdy-studio-hud-preview-empty';
    empty.textContent = 'Run a CLIENT project to preview its HUD output here.';
    container.appendChild(empty);
  }

  private entryCard(entry: CrowdyStudioHudEntry): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'ck-crowdy-studio-hud-card';
    const title = document.createElement('div');
    title.className = 'ck-crowdy-studio-hud-title';
    title.textContent = entry.label; // text only — never innerHTML
    const body = document.createElement('div');
    body.className = 'ck-crowdy-studio-hud-payload';
    body.textContent = this.describe(entry.payload);
    card.append(title, body);
    return card;
  }

  /** Render an untrusted payload as safe text (compact, bounded). */
  private describe(payload: unknown): string {
    try {
      const s = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return s.length > 200 ? `${s.slice(0, 200)}…` : s;
    } catch {
      return '(unrenderable payload)';
    }
  }
}
