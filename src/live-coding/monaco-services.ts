export type MonacoServicesInitializer = () => Promise<void>;

/**
 * Process-wide one-shot gate for the monaco-vscode service collection.
 * The upstream service registry is global and rejects a second initialize.
 */
export class MonacoServicesBootstrap {
  private initialization: Promise<void> | null = null;

  ensure(initializer: MonacoServicesInitializer): Promise<void> {
    this.initialization ??= Promise.resolve().then(initializer);
    return this.initialization;
  }
}

const defaultBootstrap = new MonacoServicesBootstrap();

export function ensureMonacoServicesInitialized(): Promise<void> {
  return defaultBootstrap.ensure(initializeDefaultMonacoServices);
}

export interface MonacoWorkspaceLease {
  uri: string;
  release(): void;
}

/** Avoids Monaco's global model-URI collision across concurrent IDE mounts. */
export class MonacoWorkspacePool {
  private readonly active = new Set<string>();
  private nextSuffix = 2;

  acquire(): MonacoWorkspaceLease {
    let uri = 'file:///player-mod';
    while (this.active.has(uri)) {
      uri = `file:///player-mod-${this.nextSuffix++}`;
    }
    this.active.add(uri);
    let released = false;
    return {
      uri,
      release: () => {
        if (released) return;
        released = true;
        this.active.delete(uri);
      },
    };
  }
}

const defaultWorkspacePool = new MonacoWorkspacePool();

export function acquireMonacoWorkspace(): MonacoWorkspaceLease {
  return defaultWorkspacePool.acquire();
}

async function initializeDefaultMonacoServices(): Promise<void> {
  const [services, lifecycle] = await Promise.all([
    import('@codingame/monaco-vscode-api/services'),
    import('@codingame/monaco-vscode-api/lifecycle'),
  ]);
  if (lifecycle.servicesInitialized) {
    await lifecycle.waitServicesReady();
    return;
  }
  try {
    // `initialize` supplies the package's base, environment, files, host,
    // layout, extension and quick-access defaults. No workbench UI or language
    // client override is needed for a configured standalone editor.
    await services.initialize({}, document.body);
  } catch (error) {
    // Cooperate with a host that won the initialization race.
    if (lifecycle.servicesInitialized) {
      await lifecycle.waitServicesReady();
      return;
    }
    throw error;
  }
}
