import {
  type CrowdyStudioController,
  type CrowdyStudioState,
} from './controller.js';
import type { CrowdyStudioAgentController } from '../crowdy-agent/controller.js';
import {
  CrowdyStudioAgentDomShell,
  type CrowdyStudioAgentDomShellOptions,
} from './agent-dom-shell.js';
import {
  StudioLayoutController,
  studioPaneSizeRange,
  type StudioLayoutState,
  type StudioPaneId,
} from './layout.js';
import { createPaneSplitter, type PaneSplitterHandle } from './splitter.js';
import {
  projectTargets,
  type CrowdyStudioFileRef,
  type CrowdyStudioProjectKind,
  type CrowdyStudioReferenceFile,
  type CrowdyStudioTarget,
} from './models.js';
import {
  formatRuntimeFailureForAgentChat,
  type RuntimeFailureEnvelope,
} from './runtime-failure.js';
import { CROWDY_STUDIO_STYLES } from './styles.js';

type PanelName = 'problems' | 'build' | 'logs' | 'runs' | 'invoke';

type ExplorerFormState =
  | { kind: 'add'; target: CrowdyStudioTarget; value: string }
  | { kind: 'rename'; target: CrowdyStudioTarget; path: string; value: string }
  | { kind: 'delete'; target: CrowdyStudioTarget; path: string }
  | {
      kind: 'library';
      target: CrowdyStudioTarget;
      path: string;
      value: string;
    }
  | { kind: 'import'; referenceId: string; value: string };

interface MenuHandle {
  readonly button: HTMLButtonElement;
  readonly menu: HTMLElement;
  readonly wrap: HTMLElement;
  close(): void;
  dispose(): void;
}

const FAILURE_PHASES = new Set([
  'COMPILE_FAILED',
  'ERROR',
  'PARTIAL_FAILURE',
]);

/**
 * Modular DOM shell; editor implementations mount into `editorHost`.
 *
 * Layout is user directed: the editor is always visible while the explorer,
 * project settings, bottom panel, and agent dock are toggled from the
 * activity rail, resized with accessible splitters, and persisted through
 * {@link StudioLayoutController}.
 */
export class CrowdyStudioDomShell {
  readonly root: HTMLElement;
  readonly editorHost: HTMLElement;
  readonly layout: StudioLayoutController;
  private readonly workspace: HTMLElement;
  private readonly editorColumn: HTMLElement;
  private readonly projectMenu: MenuHandle;
  private readonly projectMenuList: HTMLElement;
  private readonly saveMenu: MenuHandle;
  private readonly saveActions: HTMLElement;
  private readonly saveMessageText: HTMLElement;
  private readonly saveAction: HTMLButtonElement;
  private readonly remoteAction: HTMLButtonElement;
  private readonly testAction: HTMLButtonElement;
  private readonly runMenu: MenuHandle;
  private readonly deployAction: HTMLButtonElement;
  private readonly stopAction: HTMLButtonElement;
  private readonly runtimeStatus: HTMLButtonElement;
  private readonly budgetStatus: HTMLElement;
  private readonly saveStatus: HTMLElement;
  private readonly newForm: HTMLFormElement;
  private readonly newName: HTMLInputElement;
  private readonly newKind: HTMLSelectElement;
  private readonly explorer: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly bottom: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly settingsName: HTMLInputElement;
  private readonly settingsDescription: HTMLInputElement;
  private readonly serverModuleName: HTMLInputElement;
  private readonly clientModuleName: HTMLInputElement;
  private readonly pairing: HTMLSelectElement;
  private readonly problemsPanel: HTMLElement;
  private readonly buildPanel: HTMLElement;
  private readonly logsPanel: HTMLElement;
  private readonly runsPanel: HTMLElement;
  private readonly invokePanel: HTMLElement;
  private readonly invokeExport: HTMLInputElement;
  private readonly invokeParams: HTMLTextAreaElement;
  private readonly invokeResult: HTMLElement;
  private readonly invokeAgentToolbar: HTMLElement;
  private readonly panelButtons = new Map<PanelName, HTMLButtonElement>();
  private readonly panels = new Map<PanelName, HTMLElement>();
  private readonly railButtons = new Map<StudioPaneId, HTMLButtonElement>();
  private readonly splitters = new Map<StudioPaneId, PaneSplitterHandle>();
  private readonly agentShell: CrowdyStudioAgentDomShell | null;
  private readonly unsubscribeLayout: () => void;
  private activePanel: PanelName = 'problems';
  private explorerForm: ExplorerFormState | null = null;
  private lastState: CrowdyStudioState | null = null;
  private lastPhase = 'IDLE';
  private lastInvokeErrorKey: string | null = null;
  private disposed = false;

  constructor(
    host: HTMLElement,
    private readonly controller: CrowdyStudioController,
    agentController?: CrowdyStudioAgentController,
    agentOptions: CrowdyStudioAgentDomShellOptions = {},
  ) {
    const style = document.createElement('style');
    style.textContent = CROWDY_STUDIO_STYLES;
    this.root = element('div', 'ck-crowdy-studio');
    this.root.append(style);
    this.layout = new StudioLayoutController();

    // ----- Top bar -----------------------------------------------------
    const toolbar = element('div', 'ck-crowdy-studio-toolbar');
    const projectTools = element('div', 'ck-crowdy-studio-project-tools');

    this.projectMenu = this.createMenu('No projects yet', {
      buttonClass: 'ck-crowdy-studio-project-button',
      ariaLabel: 'Current project',
    });
    this.projectMenuList = this.projectMenu.menu;

    this.saveMenu = this.createMenu('Saved', {
      buttonClass: 'ck-crowdy-studio-save',
      ariaLabel: 'Save status',
    });
    this.saveMessageText = element('p', 'ck-crowdy-studio-save-message');
    this.saveAction = button('Retry save');
    this.remoteAction = button('Use cloud version');
    this.saveActions = element('div', 'ck-crowdy-studio-save-actions');
    this.saveActions.append(this.saveAction, this.remoteAction);
    this.saveMenu.menu.append(this.saveMessageText, this.saveActions);

    projectTools.append(this.projectMenu.wrap, this.saveMenu.wrap);

    const runtimeTools = element('div', 'ck-crowdy-studio-runtime-tools');
    this.testAction = button('Test draft');
    this.testAction.className = 'ck-crowdy-studio-primary';
    this.runMenu = this.createMenu('Run ▾', {
      ariaLabel: 'More run actions',
    });
    this.deployAction = menuItem('Deploy live');
    this.stopAction = menuItem('Stop project');
    this.runMenu.menu.append(this.deployAction, this.stopAction);
    runtimeTools.append(this.testAction, this.runMenu.wrap);
    toolbar.append(projectTools, runtimeTools);

    // ----- New-project popover -----------------------------------------
    this.newForm = document.createElement('form');
    this.newForm.className = 'ck-crowdy-studio-new';
    this.newForm.dataset.open = 'false';
    this.newName = document.createElement('input');
    this.newName.required = true;
    this.newName.placeholder = 'Project name';
    this.newName.setAttribute('aria-label', 'New project name');
    this.newKind = select([
      ['SERVER', 'Server'],
      ['CLIENT', 'Client'],
      ['FULL_STACK', 'Full stack'],
    ]);
    for (const option of Array.from(this.newKind.options ?? [])) {
      option.disabled =
        option.value === 'SERVER'
          ? !this.controller.canTarget('SERVER', 'write')
          : option.value === 'CLIENT'
            ? !this.controller.canTarget('CLIENT', 'write')
            : !this.controller.canTarget('SERVER', 'write') ||
              !this.controller.canTarget('CLIENT', 'write');
    }
    this.newKind.setAttribute('aria-label', 'New project type');
    const create = button('Create project', 'submit');
    const cancel = button('Cancel');
    this.newForm.append(this.newName, this.newKind, create, cancel);

    // ----- Workspace: rail + panes + editor -----------------------------
    this.workspace = element('div', 'ck-crowdy-studio-workspace');
    const rail = element('nav', 'ck-crowdy-studio-rail');
    rail.setAttribute('aria-label', 'Studio panes');
    rail.append(
      this.railButton('explorer', 'Files', 'Show or hide project files'),
      this.railButton('settings', 'Settings', 'Show or hide project settings'),
      this.railButton('bottom', 'Console', 'Show or hide the console panel'),
    );

    this.explorer = element('aside', 'ck-crowdy-studio-explorer');
    this.explorer.setAttribute('aria-label', 'Project files');
    this.editorColumn = element('section', 'ck-crowdy-studio-editor-column');
    this.tabs = element('div', 'ck-crowdy-studio-tabs');
    this.editorHost = element('div', 'ck-crowdy-studio-editor');

    this.bottom = element('section', 'ck-crowdy-studio-bottom');
    const panelTabs = element('div', 'ck-crowdy-studio-panel-tabs');
    this.problemsPanel = this.createPanel('problems', 'Problems', panelTabs);
    this.buildPanel = this.createPanel('build', 'Build', panelTabs);
    this.logsPanel = this.createPanel('logs', 'Logs', panelTabs);
    this.runsPanel = this.createPanel('runs', 'Runs', panelTabs);
    this.invokePanel = this.createPanel('invoke', 'Invoke', panelTabs);
    const hidePanel = button('×');
    hidePanel.className = 'ck-crowdy-studio-panel-hide';
    hidePanel.setAttribute('aria-label', 'Hide the console panel');
    hidePanel.addEventListener('click', () =>
      this.layout.setVisible('bottom', false),
    );
    panelTabs.append(hidePanel);
    const panelBody = element('div', 'ck-crowdy-studio-panel-body');
    for (const panel of this.panels.values()) panelBody.append(panel);
    this.bottom.append(panelTabs, panelBody);

    this.editorColumn.append(
      this.tabs,
      this.editorHost,
      this.paneSplitter('bottom', 'horizontal', 'after', 'Resize the console panel'),
      this.bottom,
    );

    this.settings = element('aside', 'ck-crowdy-studio-settings');
    const settingsTitle = element('h3');
    settingsTitle.textContent = 'Project settings';
    this.settingsName = input('Project name');
    this.settingsDescription = input('Description');
    this.serverModuleName = input('Server module name');
    this.clientModuleName = input('Client module name');
    this.pairing = select([
      ['NONE', 'No pairing'],
      ['OPTIONAL', 'Optional companion'],
      ['REQUIRED', 'Require client companion'],
    ]);
    this.settings.append(
      settingsTitle,
      labeled('Name', this.settingsName),
      labeled('Description', this.settingsDescription),
      labeled('Server module', this.serverModuleName),
      labeled('Client module', this.clientModuleName),
      labeled('Pairing', this.pairing),
    );

    this.workspace.append(
      rail,
      this.explorer,
      this.paneSplitter('explorer', 'vertical', 'before', 'Resize the file explorer'),
      this.editorColumn,
      this.paneSplitter('settings', 'vertical', 'after', 'Resize project settings'),
      this.settings,
    );

    // ----- Status bar ----------------------------------------------------
    const statusbar = element('footer', 'ck-crowdy-studio-statusbar');
    this.saveStatus = element('span', 'ck-crowdy-studio-status');
    this.runtimeStatus = document.createElement('button');
    this.runtimeStatus.type = 'button';
    this.runtimeStatus.className =
      'ck-crowdy-studio-status ck-crowdy-studio-statusbar-runtime';
    this.runtimeStatus.setAttribute(
      'aria-label',
      'Runtime status; opens the console panel',
    );
    this.runtimeStatus.addEventListener('click', () => {
      this.layout.setVisible('bottom', true);
      this.activatePanel(this.activePanel);
    });
    this.budgetStatus = element('span', 'ck-crowdy-studio-status');
    statusbar.append(this.saveStatus, this.runtimeStatus, this.budgetStatus);

    // The popover is absolutely positioned against the toolbar so it opens
    // right under the project menu button.
    toolbar.append(this.newForm);
    this.root.append(toolbar, this.workspace, statusbar);
    host.appendChild(this.root);

    // ----- Agent dock ----------------------------------------------------
    if (agentController) {
      rail.append(
        this.railButton('agent', 'Agent', 'Show or hide the Crowdy Agent dock'),
      );
      this.workspace.append(
        this.paneSplitter('agent', 'vertical', 'after', 'Resize the agent dock'),
      );
      this.agentShell = new CrowdyStudioAgentDomShell(
        this.workspace,
        agentController,
        { ...agentOptions, layout: agentOptions.layout ?? this.layout },
      );
      this.root.dataset.agent = 'true';
    } else {
      this.agentShell = null;
    }

    // ----- Wiring ---------------------------------------------------------
    this.newForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.run(async () => {
        await this.controller.createProject({
          name: this.newName.value,
          kind: this.newKind.value as CrowdyStudioProjectKind,
        });
        this.newName.value = '';
        this.newForm.dataset.open = 'false';
      });
    });
    cancel.addEventListener('click', () => {
      this.newForm.dataset.open = 'false';
    });
    this.testAction.addEventListener('click', () => {
      this.revealPanel('build');
      void this.run(() => this.controller.testDraft());
    });
    this.deployAction.addEventListener('click', () => {
      this.runMenu.close();
      this.revealPanel('build');
      void this.run(() => this.controller.deployLive());
    });
    this.stopAction.addEventListener('click', () => {
      this.runMenu.close();
      void this.run(() => this.controller.stopProject());
    });
    this.saveAction.addEventListener('click', () => {
      this.saveMenu.close();
      void this.run(() =>
        this.controller.getState().saveState === 'CONFLICT'
          ? this.controller.overwriteConflict()
          : this.controller.retrySave(),
      );
    });
    this.remoteAction.addEventListener('click', () => {
      this.saveMenu.close();
      void this.run(() => this.controller.acceptRemoteConflict());
    });
    this.settingsName.addEventListener('change', () =>
      this.controller.updateSettings({ name: this.settingsName.value }),
    );
    this.settingsDescription.addEventListener('change', () =>
      this.controller.updateSettings({
        description: this.settingsDescription.value,
      }),
    );
    this.serverModuleName.addEventListener('change', () =>
      this.controller.updateSettings({
        serverModuleName: this.serverModuleName.value,
      }),
    );
    this.clientModuleName.addEventListener('change', () =>
      this.controller.updateSettings({
        clientModuleName: this.clientModuleName.value,
      }),
    );
    this.pairing.addEventListener('change', () =>
      this.controller.setPairingPreference(
        this.pairing.value as 'NONE' | 'OPTIONAL' | 'REQUIRED',
      ),
    );

    this.invokeExport = input('Export name');
    this.invokeExport.value = 'invoke';
    this.invokeParams = document.createElement('textarea');
    this.invokeParams.placeholder = '{"example": true}';
    this.invokeParams.setAttribute('aria-label', 'Invoke JSON parameters');
    const invokeButton = button('Invoke server export');
    this.invokeResult = document.createElement('pre');
    this.invokeAgentToolbar = element('div', 'ck-crowdy-studio-problems-toolbar');
    this.invokeAgentToolbar.hidden = true;
    if (this.agentShell) {
      const addAll = button('Add to chat');
      addAll.setAttribute(
        'aria-label',
        'Add Invoke failure to the Crowdy Agent chat composer',
      );
      addAll.addEventListener('click', () =>
        void this.addInvokeFailureToChat('prefill'),
      );
      const ask = button('Ask agent to fix');
      ask.className = 'ck-crowdy-studio-primary';
      ask.setAttribute(
        'aria-label',
        'Send Invoke failure to Crowdy Agent in BUILD mode',
      );
      ask.addEventListener('click', () =>
        void this.run(async () => {
          await this.addInvokeFailureToChat('ask');
        }),
      );
      this.invokeAgentToolbar.append(addAll, ask);
    }
    const invokeControls = element('div', 'ck-crowdy-studio-invoke');
    invokeControls.append(this.invokeExport, this.invokeParams, invokeButton);
    this.invokePanel.append(
      invokeControls,
      this.invokeAgentToolbar,
      this.invokeResult,
    );
    invokeButton.addEventListener('click', () => {
      void this.run(() =>
        this.controller.invoke(
          this.invokeExport.value,
          this.invokeParams.value,
        ),
      );
    });

    this.controller.setSurfaceVisible('usage', true);
    this.unsubscribeLayout = this.layout.subscribe((state) =>
      this.applyLayout(state),
    );
    this.applyLayout(this.layout.getState());
    this.activatePanel('problems');
  }

  render(state: CrowdyStudioState): void {
    if (this.disposed) return;
    this.lastState = state;
    this.renderProjects(state);
    this.renderSaveState(state);
    this.renderExplorer(state);
    this.renderTabs(state);
    this.renderSettings(state);
    const projectTargetsAvailable = state.project
      ? projectTargets(state.project.kind).every((target) =>
          this.controller.canTarget(target, 'write'),
        )
      : false;
    this.testAction.disabled = !projectTargetsAvailable;
    this.deployAction.disabled = !projectTargetsAvailable;
    this.renderProblems(state);
    this.renderBuild(state);
    this.renderRuntimeRows(this.logsPanel, state.logs);
    this.renderRuntimeRows(this.runsPanel, state.runs);
    this.renderInvoke(state);
    this.runtimeStatus.textContent =
      [state.runtime.phase, state.runtime.target, state.runtime.message]
        .filter(Boolean)
        .join(' · ') || 'IDLE';
    this.runtimeStatus.dataset.phase = state.runtime.phase;
    this.budgetStatus.textContent = budgetText(state);
    this.autoRevealFailures(state);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.setSurfaceVisible('usage', false);
    this.controller.setSurfaceVisible('logs', false);
    this.controller.setSurfaceVisible('runs', false);
    this.unsubscribeLayout();
    for (const splitter of this.splitters.values()) splitter.dispose();
    this.projectMenu.dispose();
    this.saveMenu.dispose();
    this.runMenu.dispose();
    this.agentShell?.dispose();
    this.root.remove();
  }

  // ----- Layout ----------------------------------------------------------

  private railButton(
    pane: StudioPaneId,
    label: string,
    description: string,
  ): HTMLButtonElement {
    const control = button(label);
    control.className = 'ck-crowdy-studio-rail-button';
    control.dataset.pane = pane;
    control.title = description;
    control.setAttribute('aria-pressed', 'false');
    control.addEventListener('click', () => {
      const wasVisible = this.layout.isVisible(pane);
      this.layout.toggle(pane);
      if (!wasVisible) this.collapseOverlappingPanes(pane);
    });
    this.railButtons.set(pane, control);
    return control;
  }

  /**
   * Narrow widths turn side panes into overlays (styles.ts container
   * queries), where several open panes would stack invisibly on top of each
   * other. Enforce the "single pane" rule there: opening one side pane
   * closes the others that overlay at the current width.
   */
  private collapseOverlappingPanes(opened: StudioPaneId): void {
    if (opened === 'bottom') return;
    const width = this.root.clientWidth;
    if (!width) return;
    const overlaying: StudioPaneId[] = [];
    if (width <= 900) overlaying.push('settings');
    if (width <= 760) overlaying.push('agent');
    if (width <= 620) overlaying.push('explorer');
    if (!overlaying.includes(opened)) return;
    for (const pane of overlaying) {
      if (pane !== opened && this.layout.isVisible(pane)) {
        this.layout.setVisible(pane, false);
      }
    }
  }

  private paneSplitter(
    pane: StudioPaneId,
    orientation: 'vertical' | 'horizontal',
    position: 'before' | 'after',
    label: string,
  ): HTMLElement {
    const splitter = createPaneSplitter({
      orientation,
      pane: position,
      label,
      range: () => studioPaneSizeRange(pane),
      getSize: () => this.layout.paneSize(pane),
      setSize: (size, commit) => this.layout.setSize(pane, size, commit),
    });
    this.splitters.set(pane, splitter);
    return splitter.element;
  }

  private applyLayout(state: StudioLayoutState): void {
    const paneElements: Record<StudioPaneId, HTMLElement | null> = {
      explorer: this.explorer,
      settings: this.settings,
      bottom: this.bottom,
      agent: this.agentShell?.root ?? null,
    };
    for (const pane of ['explorer', 'settings', 'bottom', 'agent'] as const) {
      const paneElement = paneElements[pane];
      const visible = state.visible[pane] && paneElement !== null;
      if (paneElement) {
        paneElement.hidden = !visible;
        if (pane === 'bottom') {
          paneElement.style.height = `${state.sizes[pane]}px`;
        } else {
          paneElement.style.width = `${state.sizes[pane]}px`;
        }
      }
      const splitter = this.splitters.get(pane);
      if (splitter) {
        splitter.element.hidden = !visible;
        splitter.refresh();
      }
      const railControl = this.railButtons.get(pane);
      if (railControl) {
        railControl.setAttribute('aria-pressed', String(visible));
        railControl.dataset.active = String(visible);
      }
    }
    this.syncPanelPolling();
  }

  private revealPanel(name: PanelName): void {
    this.layout.setVisible('bottom', true);
    this.activatePanel(name);
  }

  private autoRevealFailures(state: CrowdyStudioState): void {
    const phase = state.runtime.phase;
    if (phase !== this.lastPhase && FAILURE_PHASES.has(phase)) {
      const diagnostics =
        state.authoritativeDiagnostics.length + state.localDiagnostics.length;
      this.revealPanel(diagnostics > 0 ? 'problems' : 'build');
    }
    this.lastPhase = phase;

    const invokeError = state.invokeResult?.error;
    const invokeKey = invokeError
      ? `${state.invokeResult?.exportName ?? ''}:${invokeError}`
      : null;
    if (invokeKey && invokeKey !== this.lastInvokeErrorKey) {
      this.revealPanel('invoke');
    }
    this.lastInvokeErrorKey = invokeKey;
  }

  private renderInvoke(state: CrowdyStudioState): void {
    this.invokeResult.textContent = state.invokeResult
      ? formatInvokeResult(state.invokeResult)
      : '';
    const hasFailure = Boolean(
      state.invokeResult?.error || state.invokeResult?.failure,
    );
    this.invokeAgentToolbar.hidden = !hasFailure || !this.agentShell;
  }

  private async addInvokeFailureToChat(
    mode: 'prefill' | 'ask',
  ): Promise<void> {
    if (!this.agentShell) return;
    const state = this.lastState ?? this.controller.getState();
    const invoke = state.invokeResult;
    if (!invoke?.error && !invoke?.failure) return;

    const failure: RuntimeFailureEnvelope = invoke.failure ?? {
      code: 'INVOKE_FAILED',
      summary: invoke.error ?? 'Invoke failed',
    };
    const project = state.project;
    const serverSource =
      project?.files.find(
        (file) =>
          file.target === 'SERVER' &&
          (file.path === 'src/lib.rs' || file.path === 'lib.rs'),
      )?.content ?? null;
    const message = formatRuntimeFailureForAgentChat(failure, {
      exportName: invoke.exportName ?? this.invokeExport.value,
      serverSource,
      projectRevision: project?.revision?.id ?? null,
    });
    if (mode === 'prefill') {
      this.agentShell.prefillComposer(message);
      return;
    }
    await this.agentShell.askWithMessage(message, { mode: 'BUILD' });
  }

  // ----- Menus -----------------------------------------------------------

  private createMenu(
    label: string,
    options: { buttonClass?: string; ariaLabel?: string } = {},
  ): MenuHandle {
    const wrap = element('div', 'ck-crowdy-studio-menu-wrap');
    const control = button(label);
    control.className = options.buttonClass
      ? `ck-crowdy-studio-menu-button ${options.buttonClass}`
      : 'ck-crowdy-studio-menu-button';
    if (options.ariaLabel) control.setAttribute('aria-label', options.ariaLabel);
    control.setAttribute('aria-haspopup', 'true');
    control.setAttribute('aria-expanded', 'false');
    const menu = element('div', 'ck-crowdy-studio-menu');
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    wrap.append(control, menu);

    const outsideClick = (event: Event): void => {
      if (!wrap.contains(event.target as Node | null)) close();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      control.focus();
    };
    const close = (): void => {
      if (menu.hidden) return;
      menu.hidden = true;
      control.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outsideClick, true);
      wrap.removeEventListener('keydown', escape);
    };
    const open = (): void => {
      if (!menu.hidden) return;
      menu.hidden = false;
      control.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outsideClick, true);
      wrap.addEventListener('keydown', escape);
    };
    control.addEventListener('click', () => {
      if (menu.hidden) open();
      else close();
    });

    return {
      button: control,
      menu,
      wrap,
      close,
      dispose(): void {
        close();
        wrap.remove();
      },
    };
  }

  // ----- Panels ------------------------------------------------------------

  private createPanel(
    name: PanelName,
    label: string,
    tabs: HTMLElement,
  ): HTMLElement {
    const tab = button(label);
    tab.className = 'ck-crowdy-studio-panel-tab';
    tab.addEventListener('click', () => this.activatePanel(name));
    this.panelButtons.set(name, tab);
    tabs.append(tab);
    const panel = element('div', 'ck-crowdy-studio-panel');
    panel.dataset.panel = name;
    this.panels.set(name, panel);
    return panel;
  }

  private activatePanel(name: PanelName): void {
    this.activePanel = name;
    for (const [key, buttonElement] of this.panelButtons) {
      buttonElement.dataset.active = String(key === name);
    }
    for (const [key, panel] of this.panels) {
      panel.dataset.active = String(key === name);
    }
    this.syncPanelPolling();
  }

  /** Poll logs/runs only while their panel is both selected and shown. */
  private syncPanelPolling(): void {
    const bottomVisible = this.layout.isVisible('bottom');
    for (const surface of ['logs', 'runs'] as const) {
      this.controller.setSurfaceVisible(
        surface,
        bottomVisible && this.activePanel === surface,
      );
    }
  }

  // ----- Rendering -----------------------------------------------------------

  private renderProjects(state: CrowdyStudioState): void {
    const selected = state.project;
    this.projectMenu.button.textContent = selected
      ? `${selected.metadata.name} ▾`
      : state.projects.length === 0
        ? 'No projects yet ▾'
        : 'Select project ▾';
    const items: HTMLElement[] = state.projects.map((project) => {
      const item = menuItem(
        `${project.name} · ${project.kind.toLowerCase().replace('_', ' ')}`,
      );
      item.dataset.active = String(project.projectId === selected?.projectId);
      item.addEventListener('click', () => {
        this.projectMenu.close();
        void this.run(() => this.controller.switchProject(project.projectId));
      });
      return item;
    });
    if (items.length === 0) {
      items.push(empty('No projects yet.'));
    }
    const divider = element('div', 'ck-crowdy-studio-menu-divider');
    const newProject = menuItem('New project…');
    newProject.addEventListener('click', () => {
      this.projectMenu.close();
      this.newForm.dataset.open = 'true';
      this.newName.focus();
    });
    this.projectMenuList.replaceChildren(...items, divider, newProject);
  }

  private renderSaveState(state: CrowdyStudioState): void {
    const label = {
      SAVING: 'Saving…',
      SAVED: 'Saved',
      CONFLICT: 'Conflict',
      OFFLINE: 'Offline',
    }[state.saveState];
    this.saveMenu.button.dataset.state = state.saveState;
    this.saveMenu.button.textContent = label;
    this.saveStatus.textContent = state.saveMessage
      ? `${label}: ${state.saveMessage}`
      : label;
    this.saveMessageText.textContent = state.saveMessage
      ? state.saveMessage
      : state.saveState === 'SAVED'
        ? 'Edits autosave to your private project.'
        : label;
    const attention = ['CONFLICT', 'OFFLINE'].includes(state.saveState);
    this.saveAction.hidden = !attention;
    this.saveAction.textContent =
      state.saveState === 'CONFLICT' ? 'Keep my version' : 'Retry save';
    this.remoteAction.hidden = state.saveState !== 'CONFLICT';
    this.saveMenu.button.dataset.attention = String(attention);
  }

  private renderExplorer(state: CrowdyStudioState): void {
    const focused = focusedExplorerField(this.explorer);
    this.explorer.replaceChildren();
    if (!state.project) {
      this.explorer.append(empty('Create a project to start authoring.'));
      return;
    }
    for (const target of projectTargets(state.project.kind)) {
      const files = state.project.files.filter((file) => file.target === target);
      this.explorer.append(
        this.projectSection(
          target,
          files.map((file) => ({
            source: 'PROJECT',
            target: file.target,
            path: file.path,
          })),
        ),
      );
    }
    this.explorer.append(
      this.referenceSection('Personal library', state.personalLibraryFiles),
      this.referenceSection('Common files', state.commonFiles),
    );
    restoreExplorerFocus(this.explorer, focused);
  }

  private projectSection(
    target: CrowdyStudioTarget,
    refs: CrowdyStudioFileRef[],
  ): HTMLElement {
    const section = element('section', 'ck-crowdy-studio-section');
    const header = element('div', 'ck-crowdy-studio-section-header');
    const title = document.createElement('span');
    title.textContent = `${target} files`;
    const add = button('+ File');
    add.setAttribute('aria-label', `Add ${target} file`);
    add.disabled = !this.controller.canTarget(target, 'write');
    add.addEventListener('click', () => {
      this.explorerForm =
        this.explorerForm?.kind === 'add' && this.explorerForm.target === target
          ? null
          : { kind: 'add', target, value: 'src/new.rs' };
      this.rerenderExplorer();
    });
    header.append(title, add);
    section.append(header);
    if (this.explorerForm?.kind === 'add' && this.explorerForm.target === target) {
      section.append(
        this.inlineForm({
          value: this.explorerForm.value,
          placeholder: `New ${target} file path`,
          submitLabel: 'Add file',
          onInput: (value) => {
            if (this.explorerForm?.kind === 'add') this.explorerForm.value = value;
          },
          onSubmit: (value) => {
            this.explorerForm = null;
            void this.run(() =>
              Promise.resolve(this.controller.addFile(target, value)),
            );
          },
        }),
      );
    }
    for (const ref of refs) {
      section.append(this.projectFileRow(ref));
    }
    if (refs.length === 0) section.append(empty('No files'));
    return section;
  }

  private projectFileRow(ref: CrowdyStudioFileRef): HTMLElement {
    const form = this.explorerForm;
    if (
      form &&
      form.kind !== 'add' &&
      form.kind !== 'import' &&
      form.target === ref.target &&
      form.path === ref.path
    ) {
      return this.projectFileFormRow(ref, form);
    }
    const row = element('div', 'ck-crowdy-studio-file');
    const open = button(ref.path);
    open.title = `${ref.target}:${ref.path}`;
    open.addEventListener('click', () => this.controller.openFile(ref));
    const actions = this.createMenu('…', {
      ariaLabel: `Actions for ${ref.path}`,
      buttonClass: 'ck-crowdy-studio-file-action',
    });
    const library = menuItem('Save to library');
    library.addEventListener('click', () => {
      actions.close();
      if (!ref.target) return;
      this.explorerForm = {
        kind: 'library',
        target: ref.target,
        path: ref.path,
        value: ref.path.split('/').at(-1) ?? ref.path,
      };
      this.rerenderExplorer();
    });
    const rename = menuItem('Rename');
    rename.addEventListener('click', () => {
      actions.close();
      if (!ref.target) return;
      this.explorerForm = {
        kind: 'rename',
        target: ref.target,
        path: ref.path,
        value: ref.path,
      };
      this.rerenderExplorer();
    });
    const remove = menuItem('Delete');
    remove.addEventListener('click', () => {
      actions.close();
      if (!ref.target) return;
      this.explorerForm = { kind: 'delete', target: ref.target, path: ref.path };
      this.rerenderExplorer();
    });
    actions.menu.append(library, rename, remove);
    row.append(open, actions.wrap);
    return row;
  }

  private projectFileFormRow(
    ref: CrowdyStudioFileRef,
    form: Exclude<ExplorerFormState, { kind: 'add' } | { kind: 'import' }>,
  ): HTMLElement {
    const row = element('div', 'ck-crowdy-studio-file-form-row');
    if (form.kind === 'delete') {
      const text = document.createElement('span');
      text.textContent = `Delete ${ref.target}:${ref.path}?`;
      const confirm = button('Delete');
      confirm.addEventListener('click', () => {
        this.explorerForm = null;
        void this.run(() =>
          Promise.resolve(this.controller.deleteFile(form.target, form.path)),
        );
      });
      const cancel = button('Cancel');
      cancel.addEventListener('click', () => {
        this.explorerForm = null;
        this.rerenderExplorer();
      });
      row.append(text, confirm, cancel);
      return row;
    }
    row.append(
      this.inlineForm({
        value: form.value,
        placeholder:
          form.kind === 'rename' ? 'New file path' : 'Library file title',
        submitLabel: form.kind === 'rename' ? 'Rename' : 'Save to library',
        onInput: (value) => {
          if (this.explorerForm && this.explorerForm.kind === form.kind) {
            this.explorerForm.value = value;
          }
        },
        onSubmit: (value) => {
          this.explorerForm = null;
          if (form.kind === 'rename') {
            void this.run(() =>
              Promise.resolve(
                this.controller.renameFile(form.target, form.path, value),
              ),
            );
          } else {
            void this.run(() =>
              this.controller.saveProjectFileToLibrary(
                form.target,
                form.path,
                value,
              ),
            );
          }
        },
      }),
    );
    return row;
  }

  private referenceSection(
    titleText: string,
    files: readonly CrowdyStudioReferenceFile[],
  ): HTMLElement {
    const section = element('section', 'ck-crowdy-studio-section');
    const header = element('div', 'ck-crowdy-studio-section-header');
    header.textContent = titleText;
    section.append(header);
    for (const file of files) {
      const ref: CrowdyStudioFileRef = {
        source: file.source,
        target: file.target,
        path: file.path,
        referenceId: file.id,
      };
      const row = element('div', 'ck-crowdy-studio-file');
      const open = button(
        `${file.target ? `${file.target.toLowerCase()}/` : ''}${file.path}`,
      );
      open.addEventListener('click', () => this.controller.openFile(ref));
      const add = button('Add');
      add.setAttribute('aria-label', `Add ${file.title} to project`);
      add.addEventListener('click', () => {
        this.explorerForm =
          this.explorerForm?.kind === 'import' &&
          this.explorerForm.referenceId === file.id
            ? null
            : { kind: 'import', referenceId: file.id, value: file.path };
        this.rerenderExplorer();
      });
      row.append(open, add);
      section.append(row);
      if (
        this.explorerForm?.kind === 'import' &&
        this.explorerForm.referenceId === file.id
      ) {
        section.append(
          this.inlineForm({
            value: this.explorerForm.value,
            placeholder: 'Destination project path',
            submitLabel: 'Add to project',
            onInput: (value) => {
              if (this.explorerForm?.kind === 'import') {
                this.explorerForm.value = value;
              }
            },
            onSubmit: (value) => {
              this.explorerForm = null;
              void this.run(() =>
                this.controller.importReferenceFile(file, value),
              );
            },
          }),
        );
      }
    }
    if (files.length === 0) section.append(empty('No files'));
    return section;
  }

  private inlineForm(options: {
    value: string;
    placeholder: string;
    submitLabel: string;
    onInput(value: string): void;
    onSubmit(value: string): void;
  }): HTMLElement {
    const form = document.createElement('form');
    form.className = 'ck-crowdy-studio-inline-form';
    const field = document.createElement('input');
    field.value = options.value;
    field.placeholder = options.placeholder;
    field.setAttribute('aria-label', options.placeholder);
    field.dataset.explorerField = 'true';
    field.addEventListener('input', () => options.onInput(field.value));
    const submit = button(options.submitLabel, 'submit');
    const cancel = button('Cancel');
    cancel.addEventListener('click', () => {
      this.explorerForm = null;
      this.rerenderExplorer();
    });
    form.append(field, submit, cancel);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = field.value.trim();
      if (!value) return;
      options.onSubmit(value);
    });
    queueMicrotask(() => {
      try {
        if (
          field.isConnected &&
          !this.explorer.contains(document.activeElement)
        ) {
          field.focus();
          field.select();
        }
      } catch {
        // Focus management is an enhancement only.
      }
    });
    return form;
  }

  private rerenderExplorer(): void {
    if (this.lastState) this.renderExplorer(this.lastState);
  }

  private renderTabs(state: CrowdyStudioState): void {
    this.tabs.replaceChildren();
    for (const ref of state.openFiles) {
      const tab = button(
        `${ref.target ? `${ref.target.toLowerCase()}/` : ''}${ref.path}`,
      );
      tab.className = 'ck-crowdy-studio-tab';
      tab.dataset.active = String(
        Boolean(state.activeFile && sameRef(state.activeFile, ref)),
      );
      tab.addEventListener('click', () => this.controller.openFile(ref));
      const close = document.createElement('span');
      close.textContent = '×';
      close.setAttribute('role', 'button');
      close.setAttribute('aria-label', `Close ${ref.path}`);
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        this.controller.closeFile(ref);
      });
      tab.append(close);
      this.tabs.append(tab);
    }
  }

  private renderSettings(state: CrowdyStudioState): void {
    const project = state.project;
    const disabled = !project;
    for (const control of [
      this.settingsName,
      this.settingsDescription,
      this.serverModuleName,
      this.clientModuleName,
      this.pairing,
    ]) {
      control.disabled = disabled;
    }
    if (!project) return;
    setInputUnlessFocused(this.settingsName, project.metadata.name);
    setInputUnlessFocused(
      this.settingsDescription,
      project.metadata.description ?? '',
    );
    setInputUnlessFocused(
      this.serverModuleName,
      project.metadata.serverModuleName ?? '',
    );
    setInputUnlessFocused(
      this.clientModuleName,
      project.metadata.clientModuleName ?? '',
    );
    this.serverModuleName.disabled = !projectTargets(project.kind).includes('SERVER');
    this.clientModuleName.disabled = !projectTargets(project.kind).includes('CLIENT');
    this.pairing.disabled = project.kind !== 'FULL_STACK';
    this.pairing.value = project.metadata.pairingPreference;
  }

  private renderProblems(state: CrowdyStudioState): void {
    this.problemsPanel.replaceChildren();
    const diagnostics = [
      ...state.authoritativeDiagnostics,
      ...state.localDiagnostics,
    ];
    const problemsTab = this.panelButtons.get('problems');
    if (problemsTab) {
      problemsTab.textContent =
        diagnostics.length > 0 ? `Problems (${diagnostics.length})` : 'Problems';
    }
    if (diagnostics.length === 0) {
      this.problemsPanel.append(empty('No problems.'));
      return;
    }
    for (const diagnostic of diagnostics) {
      const row = element('button', 'ck-crowdy-studio-problem');
      row.dataset.source = diagnostic.source;
      const source = document.createElement('span');
      source.textContent =
        diagnostic.source === 'rustc' ? 'rustc' : 'advisory';
      const location = document.createElement('span');
      location.textContent = `${diagnostic.target.toLowerCase()}/${diagnostic.path}:${diagnostic.line}:${diagnostic.column}`;
      const message = document.createElement('span');
      message.textContent = diagnostic.message;
      row.append(source, location, message);
      row.addEventListener('click', () =>
        this.controller.openFile({
          source: 'PROJECT',
          target: diagnostic.target,
          path: diagnostic.path,
        }),
      );
      this.problemsPanel.append(row);
    }
  }

  private renderBuild(state: CrowdyStudioState): void {
    this.buildPanel.replaceChildren();
    const output = document.createElement('pre');
    output.textContent = state.buildOutput || 'No build has run.';
    this.buildPanel.append(output);
  }

  private renderRuntimeRows(
    panel: HTMLElement,
    rows: CrowdyStudioState['runs'],
  ): void {
    panel.replaceChildren();
    if (rows.length === 0) {
      panel.append(empty('No runtime records.'));
      return;
    }
    for (const row of rows) {
      const line = document.createElement('pre');
      line.textContent = `${row.success ? '✓' : '✗'} ${row.startedAt} ${row.moduleName} ${row.triggerSource} · ${row.durationUs}µs · ${row.fuelUsed} fuel${row.errorMessage ? `\n${row.errorMessage}` : ''}`;
      panel.append(line);
    }
  }

  private async run<T>(operation: () => Promise<T>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.runtimeStatus.textContent =
        error instanceof Error ? error.message : String(error);
    }
  }
}

function budgetText(state: CrowdyStudioState): string {
  const usage = state.usage
    ? `units ${state.usage.hourUnitsUsed}/${state.usage.unitsPerHour ?? '∞'} · compiles ${state.usage.compilesThisHour}/${state.usage.maxCompilesPerHour}`
    : '';
  const wallet = state.wallet
    ? `wallet ${state.wallet.balanceCents} ${state.wallet.currency}`
    : '';
  return [usage, wallet].filter(Boolean).join(' · ');
}

function formatInvokeResult(result: NonNullable<CrowdyStudioState['invokeResult']>): string {
  if (result.error) {
    return `Error:\n${result.error}`;
  }
  return [
    result.resultJson ?? result.resultBase64 ?? '(empty result)',
    result.fuelUsed ? `${result.fuelUsed} fuel` : '',
    result.durationUs !== undefined ? `${result.durationUs}µs` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function sameRef(a: CrowdyStudioFileRef, b: CrowdyStudioFileRef): boolean {
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.path === b.path &&
    a.referenceId === b.referenceId
  );
}

function focusedExplorerField(explorer: HTMLElement): string | null {
  if (typeof HTMLInputElement === 'undefined') return null;
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement &&
    explorer.contains(active) &&
    active.dataset.explorerField === 'true'
  ) {
    return active.value;
  }
  return null;
}

function restoreExplorerFocus(explorer: HTMLElement, value: string | null): void {
  if (value === null) return;
  const field = explorer.querySelector<HTMLInputElement>(
    'input[data-explorer-field="true"]',
  );
  if (!field) return;
  field.focus();
  const end = field.value.length;
  try {
    field.setSelectionRange(end, end);
  } catch {
    // Selection APIs are an enhancement only.
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  return value;
}

function button(
  label: string,
  type: 'button' | 'submit' = 'button',
): HTMLButtonElement {
  const value = document.createElement('button');
  value.type = type;
  value.textContent = label;
  return value;
}

function menuItem(label: string): HTMLButtonElement {
  const value = button(label);
  value.className = 'ck-crowdy-studio-menu-item';
  value.setAttribute('role', 'menuitem');
  return value;
}

function input(placeholder: string): HTMLInputElement {
  const value = document.createElement('input');
  value.placeholder = placeholder;
  return value;
}

function labeled(label: string, control: HTMLElement): HTMLLabelElement {
  const value = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  value.append(text, control);
  return value;
}

function select(
  options: ReadonlyArray<readonly [string, string]>,
): HTMLSelectElement {
  const value = document.createElement('select');
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    value.append(option);
  }
  return value;
}

function empty(message: string): HTMLElement {
  const value = element('div', 'ck-crowdy-studio-empty');
  value.textContent = message;
  return value;
}

function setInputUnlessFocused(
  inputElement: HTMLInputElement,
  value: string,
): void {
  if (document.activeElement !== inputElement && inputElement.value !== value) {
    inputElement.value = value;
  }
}
