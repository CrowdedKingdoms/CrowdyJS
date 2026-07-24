/**
 * Injected presentation for the Crowdy Studio embed shell (panel, dock
 * separator, context drawer, text HUD). Ported from the proven Blocks with
 * Friends chrome so every embedding game starts from the same accessible
 * baseline; games restyle by overriding these classes.
 *
 * Games that dock the studio can consume `--ck-game-right-inset` (set on
 * `document.body` while docked) to inset their own canvas/HUD.
 */

const STYLE_ELEMENT_ID = 'ck-crowdy-studio-embed-styles';

export function ensureCrowdyStudioEmbedStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CROWDY_STUDIO_EMBED_STYLES;
  doc.head.appendChild(style);
}

export const CROWDY_STUDIO_EMBED_STYLES = `
body.ck-crowdy-studio-embed-open {
  overscroll-behavior: none;
}

body.ck-crowdy-studio-embed-resizing,
body.ck-crowdy-studio-embed-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}

.ck-crowdy-studio-embed {
  position: fixed;
  inset: 0;
  z-index: 100;
  padding: clamp(8px, 1.5vw, 22px);
  color: #e2e8f0;
  background:
    radial-gradient(circle at 12% 4%, rgba(16, 185, 129, 0.2), transparent 30%),
    radial-gradient(circle at 92% 98%, rgba(5, 150, 105, 0.13), transparent 34%),
    rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(18px) saturate(120%);
  pointer-events: auto;
  animation: ck-crowdy-studio-embed-enter 160ms ease-out;
}

.ck-crowdy-studio-embed.is-docked {
  inset: 0 0 0 auto;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  width: var(--ck-crowdy-studio-embed-dock-width);
  padding: 0;
  background: #020617;
  backdrop-filter: none;
  box-shadow: -18px 0 50px rgba(0, 0, 0, 0.32);
}

.ck-crowdy-studio-embed-separator {
  position: relative;
  z-index: 3;
  width: 10px;
  min-width: 10px;
  height: 100%;
  padding: 0;
  border: 0;
  background: rgba(15, 23, 42, 0.98);
  cursor: col-resize;
  touch-action: none;
}

.ck-crowdy-studio-embed-separator::after {
  position: absolute;
  inset: 0 3px;
  border-radius: 999px;
  background: rgba(110, 231, 183, 0.34);
  content: "";
  transition:
    inset 120ms ease,
    background 120ms ease;
}

.ck-crowdy-studio-embed-separator:hover::after,
.ck-crowdy-studio-embed-separator:focus-visible::after,
.ck-crowdy-studio-embed-separator[data-dragging="true"]::after {
  inset-inline: 2px;
  background: #6ee7b7;
}

.ck-crowdy-studio-embed-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(110, 231, 183, 0.24);
  border-radius: 20px;
  background:
    linear-gradient(145deg, rgba(15, 23, 42, 0.97), rgba(2, 6, 23, 0.96));
  box-shadow:
    0 32px 100px rgba(0, 0, 0, 0.62),
    inset 0 1px rgba(255, 255, 255, 0.04);
}

.ck-crowdy-studio-embed.is-docked .ck-crowdy-studio-embed-shell {
  grid-column: 2;
  border-block: 0;
  border-right: 0;
  border-radius: 0;
  box-shadow: none;
}

/* Single compact header row: title · context pill · Context toggle · Close. */
.ck-crowdy-studio-embed-header {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 46px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.78);
}

.ck-crowdy-studio-embed-header h1 {
  overflow: hidden;
  margin: 0;
  margin-right: auto;
  color: #f8fafc;
  font-size: 16px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ck-crowdy-studio-embed-visually-hidden {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  margin: -1px;
  clip-path: inset(50%);
  white-space: nowrap;
}

.ck-crowdy-studio-embed-context-toggle {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 9px;
  padding: 8px 13px;
  color: #cbd5e1;
  background: rgba(2, 6, 23, 0.48);
  cursor: pointer;
}

.ck-crowdy-studio-embed-context-toggle:hover,
.ck-crowdy-studio-embed-context-toggle[aria-expanded="true"] {
  border-color: #6ee7b7;
  color: #d1fae5;
}

.ck-crowdy-studio-embed-context-pill {
  display: grid;
  gap: 2px;
  max-width: 310px;
  padding: 7px 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 9px;
  background: rgba(2, 6, 23, 0.48);
}

.ck-crowdy-studio-embed-context-pill small {
  color: #64748b;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.ck-crowdy-studio-embed-context-pill strong {
  overflow: hidden;
  color: #cbd5e1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ck-crowdy-studio-embed-close,
.ck-crowdy-studio-embed-retry {
  border: 1px solid rgba(110, 231, 183, 0.38);
  border-radius: 9px;
  padding: 8px 13px;
  color: #d1fae5;
  background: rgba(6, 78, 59, 0.52);
  cursor: pointer;
}

.ck-crowdy-studio-embed-close:hover,
.ck-crowdy-studio-embed-retry:hover {
  border-color: #6ee7b7;
  background: rgba(5, 150, 105, 0.42);
}

.ck-crowdy-studio-embed.is-docked .ck-crowdy-studio-embed-header {
  min-height: 40px;
  padding: 5px 8px;
}

.ck-crowdy-studio-embed.is-docked .ck-crowdy-studio-embed-close,
.ck-crowdy-studio-embed.is-docked .ck-crowdy-studio-embed-context-toggle {
  padding: 6px 9px;
}

.ck-crowdy-studio-embed-workspace {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}

/* On-demand context drawer overlays the studio from the right. */
.ck-crowdy-studio-embed-drawer {
  position: absolute;
  inset: 0 0 0 auto;
  z-index: 6;
  width: min(320px, 88%);
  min-height: 0;
  padding: 16px;
  overflow: auto;
  border-left: 1px solid rgba(148, 163, 184, 0.16);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.97), rgba(2, 6, 23, 0.96));
  box-shadow: -18px 0 44px rgba(0, 0, 0, 0.4);
}

.ck-crowdy-studio-embed-drawer[hidden] {
  display: none;
}

.ck-crowdy-studio-embed-drawer h2 {
  margin: 0 0 8px;
  color: #a7f3d0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.ck-crowdy-studio-embed-drawer h2:not(:first-child) {
  margin-top: 22px;
}

.ck-crowdy-studio-embed-drawer > p {
  margin: 0 0 8px;
  color: #94a3b8;
  font-size: 11px;
}

.ck-crowdy-studio-embed-hud-preview-disclosure {
  margin-top: 22px;
}

.ck-crowdy-studio-embed-hud-preview-disclosure summary {
  color: #a7f3d0;
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.ck-crowdy-studio-embed-hud-preview-disclosure[open] summary {
  margin-bottom: 8px;
}

.ck-crowdy-studio-embed-grid-context {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  margin: 0;
  padding: 11px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 11px;
  background: rgba(2, 6, 23, 0.42);
}

.ck-crowdy-studio-embed-grid-context dt {
  color: #64748b;
  font-size: 11px;
}

.ck-crowdy-studio-embed-grid-context dd {
  overflow: hidden;
  margin: 0;
  color: #cbd5e1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ck-crowdy-studio-embed-permissions {
  display: grid;
  gap: 8px;
}

.ck-crowdy-studio-embed-permission {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
  padding: 10px;
  border: 1px solid rgba(52, 211, 153, 0.25);
  border-radius: 10px;
  background: rgba(6, 78, 59, 0.16);
}

.ck-crowdy-studio-embed-permission.is-disabled {
  border-color: rgba(148, 163, 184, 0.15);
  background: rgba(30, 41, 59, 0.36);
}

.ck-crowdy-studio-embed-permission strong {
  color: #e2e8f0;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.ck-crowdy-studio-embed-permission span {
  font-size: 10px;
}

.ck-crowdy-studio-embed-permission .is-allowed {
  color: #6ee7b7;
}

.ck-crowdy-studio-embed-permission .is-denied {
  color: #94a3b8;
}

.ck-crowdy-studio-embed-permission-source,
.ck-crowdy-studio-embed-shortcuts {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 10px;
  line-height: 1.45;
}

.ck-crowdy-studio-embed-hud-preview {
  min-height: 80px;
  padding: 8px;
  border: 1px dashed rgba(110, 231, 183, 0.26);
  border-radius: 11px;
  background: rgba(2, 6, 23, 0.5);
}

.ck-crowdy-studio-embed-main {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #080f1d;
}

.ck-crowdy-studio-embed-mount {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.ck-crowdy-studio-embed-status {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #cbd5e1;
  background:
    radial-gradient(circle at 50% 35%, rgba(16, 185, 129, 0.1), transparent 34%),
    #080f1d;
  text-align: center;
}

.ck-crowdy-studio-embed-status.hidden {
  display: none;
}

.ck-crowdy-studio-embed-status.is-error {
  flex-direction: column;
  color: #fecaca;
}

.ck-crowdy-studio-embed-status.is-error strong {
  color: #fef2f2;
  font-size: 18px;
}

.ck-crowdy-studio-embed-status.is-error span {
  max-width: 560px;
  line-height: 1.55;
}

.ck-crowdy-studio-embed-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(110, 231, 183, 0.2);
  border-top-color: #6ee7b7;
  border-radius: 999px;
  animation: ck-crowdy-studio-embed-spin 700ms linear infinite;
}

/* Stable hooks so the embed themes the CrowdyJS studio panes it hosts. */
.ck-crowdy-studio-embed-mount .ck-crowdy-studio {
  width: 100%;
  height: 100%;
  color: #e2e8f0;
  background: #080f1d;
}

.ck-crowdy-studio-embed-mount .ck-crowdy-studio-explorer {
  border-right: 1px solid rgba(148, 163, 184, 0.16);
  background: #0b1322;
}

.ck-crowdy-studio-embed-mount .ck-crowdy-studio-editor {
  min-width: 0;
  background: #080f1d;
}

.ck-crowdy-studio-embed-mount :is(
  .ck-crowdy-studio-bottom,
  .ck-crowdy-studio-panel
) {
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
  background: #0b1322;
}

.ck-crowdy-studio-embed-mount .ck-crowdy-studio-status {
  color: #a7f3d0;
  background: #052e2b;
}

.ck-crowdy-studio-embed-mount meter {
  accent-color: #10b981;
}

/* Text-only player-mod HUD: no mod-supplied markup is inserted here. */
.ck-crowdy-studio-hud-layer {
  position: fixed;
  top: 96px;
  left: 12px;
  right: calc(12px + var(--ck-game-right-inset, 0px));
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 280px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  pointer-events: none;
}

.ck-crowdy-studio-hud-layer[hidden] {
  display: none;
}

.ck-crowdy-studio-hud-card {
  padding: 7px 9px;
  border: 1px solid rgba(110, 231, 183, 0.25);
  border-radius: 8px;
  color: #dbeafe;
  background: rgba(8, 15, 29, 0.9);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.ck-crowdy-studio-hud-title {
  margin-bottom: 3px;
  color: #a7f3d0;
  font-weight: 700;
}

.ck-crowdy-studio-hud-payload {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.ck-crowdy-studio-hud-preview-card {
  box-shadow: none;
}

.ck-crowdy-studio-hud-preview-empty {
  margin: 0;
  color: #64748b;
  font-size: 10px;
  line-height: 1.45;
}

@keyframes ck-crowdy-studio-embed-enter {
  from {
    opacity: 0;
    transform: scale(0.995);
  }
}

@keyframes ck-crowdy-studio-embed-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .ck-crowdy-studio-embed-context-pill {
    display: none;
  }

  .ck-crowdy-studio-embed-permission-source,
  .ck-crowdy-studio-embed-shortcuts {
    display: none;
  }
}

@media (max-width: 620px) {
  .ck-crowdy-studio-embed {
    padding: 0;
  }

  .ck-crowdy-studio-embed-shell {
    border: 0;
    border-radius: 0;
  }

  .ck-crowdy-studio-embed-drawer {
    width: 100%;
    border-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ck-crowdy-studio-embed,
  .ck-crowdy-studio-embed-spinner,
  .ck-crowdy-studio-embed * {
    scroll-behavior: auto !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
`;
