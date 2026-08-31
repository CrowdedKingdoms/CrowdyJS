/**
 * Live player chunk / grid / block catalog posted to the DSH sidecar.
 * The Harness `game_context` tool reads the latest snapshot.
 */

export interface CrowdyStudioGameContextVec3 {
  x: number;
  y: number;
  z: number;
}

export interface CrowdyStudioGameContextBounds {
  lowChunk: CrowdyStudioGameContextVec3;
  highChunk: CrowdyStudioGameContextVec3;
}

export interface CrowdyStudioGameContextBlock {
  id: number;
  name: string;
}

export interface CrowdyStudioGameContextSnapshot {
  currentChunk: CrowdyStudioGameContextVec3;
  playerPosition?: CrowdyStudioGameContextVec3 | null;
  gridId?: string | null;
  gridBounds?: CrowdyStudioGameContextBounds | null;
  blockCatalog?: readonly CrowdyStudioGameContextBlock[] | null;
}

export interface CrowdyStudioGameContextTransport {
  updateGameContext?(input: {
    projectId: string;
    currentChunk: CrowdyStudioGameContextVec3;
    playerPosition?: CrowdyStudioGameContextVec3 | null;
    gridId?: string | null;
    gridBounds?: CrowdyStudioGameContextBounds | null;
    blockCatalog?: readonly CrowdyStudioGameContextBlock[] | null;
  }): Promise<void>;
}

export const GAME_CONTEXT_SHIP_INTERVAL_MS = 400;
/** Re-post even when the chunk is unchanged so the sidecar can refresh the bind token. */
export const GAME_CONTEXT_HEARTBEAT_MS = 30_000;

function signature(snapshot: CrowdyStudioGameContextSnapshot): string {
  const chunk = snapshot.currentChunk;
  const bounds = snapshot.gridBounds;
  const catalog = snapshot.blockCatalog ?? [];
  return [
    `${chunk.x},${chunk.y},${chunk.z}`,
    snapshot.gridId ?? '',
    bounds
      ? `${bounds.lowChunk.x},${bounds.lowChunk.y},${bounds.lowChunk.z}:${bounds.highChunk.x},${bounds.highChunk.y},${bounds.highChunk.z}`
      : '',
    String(catalog.length),
  ].join('|');
}

/**
 * Push live game context onto the DSH sidecar so the Harness `game_context`
 * tool can read the player's current chunk. Fire-and-forget: a failed post
 * must not stop Studio or the draft.
 */
export function bindGameContextShipper(
  getProjectId: () => string | null | undefined,
  transport: CrowdyStudioGameContextTransport | undefined,
  getContext?: () => CrowdyStudioGameContextSnapshot | null | undefined,
  intervalMs = GAME_CONTEXT_SHIP_INTERVAL_MS,
  heartbeatMs = GAME_CONTEXT_HEARTBEAT_MS,
): {
  publish: () => void;
  dispose: () => void;
} {
  let lastSig = '';
  let lastHeartbeatAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const publish = (force = false): void => {
    if (disposed || !transport?.updateGameContext || !getContext) return;
    const projectId = getProjectId()?.trim();
    const snapshot = getContext();
    if (!projectId || !snapshot?.currentChunk) return;
    const sig = signature(snapshot);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    if (force) lastHeartbeatAt = Date.now();
    void transport
      .updateGameContext({
        projectId,
        currentChunk: snapshot.currentChunk,
        playerPosition: snapshot.playerPosition,
        gridId: snapshot.gridId,
        gridBounds: snapshot.gridBounds,
        blockCatalog: snapshot.blockCatalog,
      })
      .catch(() => undefined);
  };

  if (transport?.updateGameContext && getContext) {
    timer = setInterval(() => {
      const due = heartbeatMs > 0 && Date.now() - lastHeartbeatAt >= heartbeatMs;
      publish(due);
    }, intervalMs);
    timer.unref?.();
  }

  return {
    publish: () => publish(true),
    dispose() {
      disposed = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
