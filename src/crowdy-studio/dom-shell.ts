import {
  type CrowdyStudioController,
  type CrowdyStudioPolledSurface,
  type CrowdyStudioState,
} from './controller.js';
import {
  projectTargets,
  type CrowdyStudioFileRef,
  type CrowdyStudioProjectKind,
  type CrowdyStudioReferenceFile,
  type CrowdyStudioTarget,
} from './models.js';
import { CROWDY_STUDIO_STYLES } from './styles.js';

type PanelName = 'problems' | 'build' | 'logs' | 'runs' | 'invoke';

/** Modular DOM shell; editor implementations mount into `editorHost`. */
export class CrowdyStudioDomShell {
  readonly root: HTMLElement;
  readonly editorHost: HTMLElement;
  private readonly projectSelect: HTMLSelectElement;
  private readonly saveBadge: HTMLElement;
  private readonly saveAction: HTMLButtonElement;
  private readonly remoteAction: HTMLButtonElement;
  private readonly testAction: HTMLButtonElement;
  private readonly deployAction: HTMLButtonElement;
  private readonly runtimeStatus: HTMLElement;
  private readonly budgetStatus: HTMLElement;
  private readonly newForm: HTMLFormElement;
  private readonly newName: HTMLInputElement;
  private readonly newKind: HTMLSelectElement;
  private readonly explorer: HTMLElement;
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
  private readonly panelButtons = new Map<PanelName, HTMLButtonElement>();
  private readonly panels = new Map<PanelName, HTMLElement>();
  private activePanel: PanelName = 'problems';
  private disposed = false;

  constructor(
    host: HTMLElement,
    private readonly controller: CrowdyStudioController,
  ) {
    const style = document.createElement('style');
    style.textContent = CROWDY_STUDIO_STYLES;
    this.root = element('div', 'ck-crowdy-studio');
    this.root.append(style);

    const toolbar = element('div', 'ck-crowdy-studio-toolbar');
    const projectTools = element('div', 'ck-crowdy-studio-project-tools');
    this.projectSelect = document.createElement('select');
    this.projectSelect.setAttribute('aria-label', 'Current project');
    const newButton = button('New project');
    this.saveBadge = element('span', 'ck-crowdy-studio-save');
    this.saveAction = button('Retry save');
    this.remoteAction = button('Use cloud version');
    this.saveAction.hidden = true;
    this.remoteAction.hidden = true;
    projectTools.append(
      this.projectSelect,
      newButton,
      this.saveBadge,
      this.saveAction,
      this.remoteAction,
    );

    const runtimeTools = element('div', 'ck-crowdy-studio-runtime-tools');
    this.testAction = button('Test draft');
    this.deployAction = button('Deploy live');
    const stop = button('Stop project');
    this.runtimeStatus = element('span', 'ck-crowdy-studio-status');
    this.budgetStatus = element('span', 'ck-crowdy-studio-status');
    runtimeTools.append(
      this.testAction,
      this.deployAction,
      stop,
      this.runtimeStatus,
      this.budgetStatus,
    );
    toolbar.append(projectTools, runtimeTools);

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

    const main = element('div', 'ck-crowdy-studio-main');
    this.explorer = element('aside', 'ck-crowdy-studio-explorer');
    const editorColumn = element('section', 'ck-crowdy-studio-editor-column');
    this.tabs = element('div', 'ck-crowdy-studio-tabs');
    this.editorHost = element('div', 'ck-crowdy-studio-editor');
    editorColumn.append(this.tabs, this.editorHost);
    const settings = element('aside', 'ck-crowdy-studio-settings');
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
    settings.append(
      settingsTitle,
      labeled('Name', this.settingsName),
      labeled('Description', this.settingsDescription),
      labeled('Server module', this.serverModuleName),
      labeled('Client module', this.clientModuleName),
      labeled('Pairing', this.pairing),
    );
    main.append(this.explorer, editorColumn, settings);

    const bottom = element('section', 'ck-crowdy-studio-bottom');
    const panelTabs = element('div', 'ck-crowdy-studio-panel-tabs');
    this.problemsPanel = this.createPanel('problems', 'Problems', panelTabs);
    this.buildPanel = this.createPanel('build', 'Build', panelTabs);
    this.logsPanel = this.createPanel('logs', 'Logs', panelTabs);
    this.runsPanel = this.createPanel('runs', 'Runs', panelTabs);
    this.invokePanel = this.createPanel('invoke', 'Invoke', panelTabs);
    const panelBody = element('div');
    for (const panel of this.panels.values()) panelBody.append(panel);
    bottom.append(panelTabs, panelBody);

    this.invokeExport = input('Export name');
    this.invokeExport.value = 'invoke';
    this.invokeParams = document.createElement('textarea');
    this.invokeParams.placeholder = '{"example": true}';
    this.invokeParams.setAttribute('aria-label', 'Invoke JSON parameters');
    const invokeButton = button('Invoke server export');
    this.invokeResult = document.createElement('pre');
    const invokeControls = element('div', 'ck-crowdy-studio-invoke');
    invokeControls.append(this.invokeExport, this.invokeParams, invokeButton);
    this.invokePanel.append(invokeControls, this.invokeResult);

    this.root.append(toolbar, this.newForm, main, bottom);
    host.appendChild(this.root);

    newButton.addEventListener('click', () => {
      this.newForm.dataset.open =
        this.newForm.dataset.open === 'true' ? 'false' : 'true';
      if (this.newForm.dataset.open === 'true') this.newName.focus();
    });
    cancel.addEventListener('click', () => {
      this.newForm.dataset.open = 'false';
    });
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
    this.projectSelect.addEventListener('change', () => {
      void this.run(() => this.controller.switchProject(this.projectSelect.value));
    });
    this.testAction.addEventListener('click', () =>
      void this.run(() => this.controller.testDraft()),
    );
    this.deployAction.addEventListener('click', () =>
      void this.run(() => this.controller.deployLive()),
    );
    stop.addEventListener('click', () =>
      void this.run(() => this.controller.stopProject()),
    );
    this.saveAction.addEventListener('click', () => {
      void this.run(() =>
        this.controller.getState().saveState === 'CONFLICT'
          ? this.controller.overwriteConflict()
          : this.controller.retrySave(),
      );
    });
    this.remoteAction.addEventListener('click', () =>
      void this.run(() => this.controller.acceptRemoteConflict()),
    );
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
    invokeButton.addEventListener('click', () => {
      void this.run(() =>
        this.controller.invoke(
          this.invokeExport.value,
          this.invokeParams.value,
        ),
      );
    });

    this.controller.setSurfaceVisible('usage', true);
    this.activatePanel('problems');
  }

  render(state: CrowdyStudioState): void {
    if (this.disposed) return;
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
    this.invokeResult.textContent = state.invokeResult
      ? formatInvokeResult(state.invokeResult)
      : '';
    this.runtimeStatus.textContent = [
      state.runtime.phase,
      state.runtime.target,
      state.runtime.message,
    ]
      .filter(Boolean)
      .join(' · ');
    this.budgetStatus.textContent = budgetText(state);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.setSurfaceVisible('usage', false);
    this.controller.setSurfaceVisible('logs', false);
    this.controller.setSurfaceVisible('runs', false);
    this.root.remove();
  }

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
    const previous = this.activePanel;
    this.activePanel = name;
    for (const [key, buttonElement] of this.panelButtons) {
      buttonElement.dataset.active = String(key === name);
    }
    for (const [key, panel] of this.panels) {
      panel.dataset.active = String(key === name);
    }
    const previousPoll = polledSurface(previous);
    const nextPoll = polledSurface(name);
    if (previousPoll && previousPoll !== nextPoll) {
      this.controller.setSurfaceVisible(previousPoll, false);
    }
    if (nextPoll) this.controller.setSurfaceVisible(nextPoll, true);
  }

  private renderProjects(state: CrowdyStudioState): void {
    const selected = state.project?.projectId ?? '';
    const options = state.projects.map((project) => {
      const option = document.createElement('option');
      option.value = project.projectId;
      option.textContent = `${project.name} · ${project.kind
        .toLowerCase()
        .replace('_', ' ')}`;
      return option;
    });
    if (options.length === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No projects yet';
      options.push(empty);
    }
    this.projectSelect.replaceChildren(...options);
    this.projectSelect.value = selected;
  }

  private renderSaveState(state: CrowdyStudioState): void {
    const label = {
      SAVING: 'Saving…',
      SAVED: 'Saved',
      CONFLICT: 'Conflict',
      OFFLINE: 'Offline',
    }[state.saveState];
    this.saveBadge.dataset.state = state.saveState;
    this.saveBadge.textContent = state.saveMessage
      ? `${label}: ${state.saveMessage}`
      : label;
    this.saveAction.hidden = !['CONFLICT', 'OFFLINE'].includes(state.saveState);
    this.saveAction.textContent =
      state.saveState === 'CONFLICT' ? 'Keep my version' : 'Retry save';
    this.remoteAction.hidden = state.saveState !== 'CONFLICT';
  }

  private renderExplorer(state: CrowdyStudioState): void {
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
      const path = window.prompt(`New ${target} file path`, 'src/new.rs');
      if (!path) return;
      void this.run(() => Promise.resolve(this.controller.addFile(target, path)));
    });
    header.append(title, add);
    section.append(header);
    for (const ref of refs) {
      section.append(this.projectFileRow(ref));
    }
    if (refs.length === 0) section.append(empty('No files'));
    return section;
  }

  private projectFileRow(ref: CrowdyStudioFileRef): HTMLElement {
    const row = element('div', 'ck-crowdy-studio-file');
    const open = button(ref.path);
    open.title = `${ref.target}:${ref.path}`;
    open.addEventListener('click', () => this.controller.openFile(ref));
    const rename = button('✎');
    rename.setAttribute('aria-label', `Rename ${ref.path}`);
    rename.addEventListener('click', () => {
      const next = window.prompt('Rename file', ref.path);
      if (!next || !ref.target) return;
      void this.run(() =>
        Promise.resolve(
          this.controller.renameFile(ref.target!, ref.path, next),
        ),
      );
    });
    const remove = button('×');
    remove.setAttribute('aria-label', `Delete ${ref.path}`);
    remove.addEventListener('click', () => {
      if (
        !ref.target ||
        !window.confirm(`Delete ${ref.target}:${ref.path}?`)
      ) {
        return;
      }
      void this.run(() =>
        Promise.resolve(this.controller.deleteFile(ref.target!, ref.path)),
      );
    });
    const library = button('Library');
    library.setAttribute('aria-label', `Save ${ref.path} to My Library`);
    library.addEventListener('click', () => {
      if (!ref.target) return;
      const title = window.prompt(
        'Library file title',
        ref.path.split('/').at(-1) ?? ref.path,
      );
      if (title == null) return;
      void this.run(() =>
        this.controller.saveProjectFileToLibrary(
          ref.target!,
          ref.path,
          title,
        ),
      );
    });
    row.append(open, library, rename, remove);
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
        const destination = window.prompt(
          'Destination project path',
          file.path,
        );
        if (!destination) return;
        void this.run(() =>
          this.controller.importReferenceFile(file, destination),
        );
      });
      row.append(open, add);
      section.append(row);
    }
    if (files.length === 0) section.append(empty('No files'));
    return section;
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

function polledSurface(panel: PanelName): CrowdyStudioPolledSurface | null {
  if (panel === 'logs' || panel === 'runs') return panel;
  return null;
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
