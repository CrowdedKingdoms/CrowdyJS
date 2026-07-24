import type {
  CrowdyAgentBrowserToolHandlersV1,
} from '../crowdy-agent/browser-dispatcher.js';
import {
  CrowdyAgentError,
  CrowdyAgentOutcomeUnknownError,
} from '../crowdy-agent/errors.js';
import type {
  GameCommandResultV1,
  GameCommandV1,
  ObserveRequestV1,
  PlayerHostAdapterV1,
} from './types.js';
import {
  AgentControlLeaseManager,
  type AgentControlLeaseManagerOptionsV1,
} from './lease-manager.js';

export interface PlayerHostAgentToolsV1 {
  readonly leaseManager: AgentControlLeaseManager;
  readonly handlers: CrowdyAgentBrowserToolHandlersV1;
}

/**
 * Build the exact generic game-tool router used by a game integration such as
 * Blocks with Friends. Game-specific extensions remain separate descriptors.
 */
export function createPlayerHostAgentTools(
  adapter: PlayerHostAdapterV1,
  options: AgentControlLeaseManagerOptionsV1 = {},
): PlayerHostAgentToolsV1 {
  const leaseManager = new AgentControlLeaseManager(adapter, options);
  const control = (
    kind: GameCommandV1['kind'],
  ): CrowdyAgentBrowserToolHandlersV1[string] =>
    async (argumentsValue, context) =>
      mapGameResult(
        await runHostOperation(
          leaseManager,
          context.signal,
          () =>
            leaseManager.dispatch({
              toolCallId: context.invocation.toolCallId,
              clientEpoch: context.invocation.clientEpoch ?? '',
              leaseId: context.invocation.leaseId,
              approvalGrant: context.invocation.approvalGrant,
              command: {
                kind,
                ...argumentsValue,
              } as GameCommandV1,
            }),
        ),
      );

  return {
    leaseManager,
    handlers: Object.freeze({
      'game.capabilities.get': (_arguments, context) =>
        runHostOperation(
          leaseManager,
          context.signal,
          () => leaseManager.refreshCapabilities(),
        ),
      'game.observe': (argumentsValue, context) =>
        runHostOperation(
          leaseManager,
          context.signal,
          () =>
            leaseManager.observe(
              argumentsValue as unknown as ObserveRequestV1,
              {
                clientEpoch: context.invocation.clientEpoch ?? '',
                leaseId: context.invocation.leaseId,
              },
            ),
        ),
      'game.control.move': control('MOVE'),
      'game.control.look': control('LOOK'),
      'game.control.stop': control('STOP'),
      'game.inventory.select': control('INVENTORY_SELECT'),
      'game.inventory.consume': control('INVENTORY_CONSUME'),
      'game.inventory.transfer': control('INVENTORY_TRANSFER'),
      'game.interact': control('INTERACT'),
      'game.craft': control('CRAFT'),
      'game.mount': control('MOUNT'),
      'game.combat.attack': control('COMBAT_ATTACK'),
      'game.chat.send': control('CHAT_SEND'),
      'game.travel.teleport': control('TRAVEL_TELEPORT'),
    }),
  };
}

function mapGameResult(result: GameCommandResultV1): GameCommandResultV1 {
  if (result.status === 'SUCCEEDED') return result;
  if (result.status === 'OUTCOME_UNKNOWN') {
    throw new CrowdyAgentOutcomeUnknownError(
      result.error?.message ??
        'The game command outcome could not be confirmed',
    );
  }
  throw new CrowdyAgentError(
    result.error?.code ??
      (result.status === 'DENIED'
        ? 'AGENT_SCOPE_DENIED'
        : 'AGENT_TOOL_FAILED'),
    result.error?.message ??
      (result.status === 'DENIED'
        ? 'The game command was denied'
        : 'The game command failed'),
    {
      retryable: result.error?.retryable ?? false,
      ...(result.error?.requiredScope
        ? { requiredScope: result.error.requiredScope }
        : {}),
    },
  );
}

async function runHostOperation<T>(
  leaseManager: AgentControlLeaseManager,
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  const abort = (): void => leaseManager.preempt('HUMAN_STOP');
  if (signal.aborted) {
    abort();
    throw new CrowdyAgentError(
      'AGENT_CANCELLED',
      'Player host operation was cancelled',
    );
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    const result = await operation();
    if (signal.aborted) {
      throw new CrowdyAgentError(
        'AGENT_CANCELLED',
        'Player host operation was cancelled',
      );
    }
    return result;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
