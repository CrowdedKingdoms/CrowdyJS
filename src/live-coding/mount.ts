import {
  LiveCodingController,
  type LiveCodingControllerOptions,
  type LiveCodingStatus,
} from './live-coding-controller.js';
import {
  PLAYER_CODE_TEMPLATES,
  type PlayerCodeTemplate,
} from './templates.js';

export interface MountLiveCodingOptions
  extends Omit<LiveCodingControllerOptions, 'onStatus'> {
  /** Module name to deploy under; defaults to a per-grid scratch name. */
  moduleName?: string;
  /** Templates offered in the picker; defaults to the built-in starter set. */
  templates?: PlayerCodeTemplate[];
  /** Deploy in draft mode by default (server egress suppressed while iterating). */
  draftByDefault?: boolean;
}

export interface LiveCodingHandle {
  controller: LiveCodingController;
  destroy: () => void;
}

/**
 * Mount the live-coding panel into a host element (08 option A). Deliberately
 * dependency-free DOM: a textarea editor, target + template pickers, deploy /
 * draft-deploy / stop buttons, a status+console line, and the quota/wallet
 * meter. Games skin it via the returned nodes or their own CSS; a game that
 * wants a custom UI can drive LiveCodingController directly instead.
 *
 * Safe to import in non-DOM contexts; mounting throws only if called without
 * a document.
 */
export function mountLiveCoding(
  el: HTMLElement,
  options: MountLiveCodingOptions,
): LiveCodingHandle {
  if (typeof document === 'undefined') {
    throw new Error('mountLiveCoding requires a DOM document');
  }
  const templates = options.templates ?? PLAYER_CODE_TEMPLATES;
  const moduleName = options.moduleName ?? 'scratch-mod';

  const root = document.createElement('div');
  root.className = 'ck-live-coding';

  const targetSelect = document.createElement('select');
  for (const t of ['server', 'client']) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    targetSelect.appendChild(opt);
  }

  const templateSelect = document.createElement('select');
  const editor = document.createElement('textarea');
  editor.className = 'ck-live-coding-editor';
  editor.rows = 20;

  const refreshTemplates = () => {
    templateSelect.innerHTML = '';
    for (const t of templates.filter((t) => t.target === targetSelect.value)) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title;
      templateSelect.appendChild(opt);
    }
    const first = templates.find((t) => t.target === targetSelect.value);
    if (first) editor.value = first.sourceFilesJson;
  };
  templateSelect.addEventListener('change', () => {
    const t = templates.find((t) => t.id === templateSelect.value);
    if (t) editor.value = t.sourceFilesJson;
  });
  targetSelect.addEventListener('change', refreshTemplates);

  const deployBtn = button('Deploy');
  const draftBtn = button('Deploy draft');
  const stopBtn = button('Stop');
  const status = document.createElement('pre');
  status.className = 'ck-live-coding-status';
  const meter = document.createElement('div');
  meter.className = 'ck-live-coding-meter';

  const controller = new LiveCodingController({
    ...options,
    onStatus: (s) => renderStatus(status, meter, s),
  });

  const doDeploy = (draft: boolean) =>
    void controller
      .deploy({
        name: moduleName,
        target: targetSelect.value as 'server' | 'client',
        sourceFilesJson: editor.value,
        draft: draft || options.draftByDefault,
      })
      .catch((err) => {
        status.textContent = `error: ${(err as Error).message}`;
      });
  deployBtn.addEventListener('click', () => doDeploy(false));
  draftBtn.addEventListener('click', () => doDeploy(true));
  stopBtn.addEventListener('click', () => controller.stop());

  const controls = document.createElement('div');
  controls.className = 'ck-live-coding-controls';
  controls.append(targetSelect, templateSelect, deployBtn, draftBtn, stopBtn);
  root.append(controls, editor, status, meter);
  el.appendChild(root);
  refreshTemplates();
  void controller.refreshUsage().catch(() => {});

  return {
    controller,
    destroy: () => {
      controller.stop();
      root.remove();
    },
  };
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  return b;
}

function renderStatus(
  status: HTMLElement,
  meter: HTMLElement,
  s: LiveCodingStatus,
): void {
  const parts = [`[${s.target}] ${s.phase}`];
  if (s.message) parts.push(s.message);
  if (s.compileLog) parts.push('\n' + s.compileLog);
  status.textContent = parts.join(' ');
  if (s.usage) {
    const gate =
      s.usage.gateStatus === 'active'
        ? 'active'
        : `${s.usage.gateStatus}${s.usage.gateReason ? ` (${s.usage.gateReason})` : ''}`;
    meter.textContent = `units ${s.usage.hourUnitsUsed}/${s.usage.unitsPerHour ?? '∞'} · compiles ${s.usage.compilesThisHour}/${s.usage.maxCompilesPerHour} · gate ${gate}`;
  }
}
