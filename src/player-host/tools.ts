import type {
  CrowdyAgentBrowserToolHandlersV1,
} from '../crowdy-agent/browser-dispatcher.js';
import type { GameCommandV1, ObserveRequestV1, PlayerHostAdapterV1 } from './types.js';
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
      leaseManager.dispatch({
        toolCallId: context.invocation.toolCallId,
        clientEpoch: context.invocation.clientEpoch ?? '',
        leaseId: context.invocation.leaseId,
        approvalGrant: context.invocation.approvalGrant,
        command: {
          kind,
          ...argumentsValue,
        } as GameCommandV1,
      });

  return {
    leaseManager,
    handlers: Object.freeze({
      'game.capabilities.get': () => leaseManager.refreshCapabilities(),
      'game.observe': (argumentsValue, context) =>
        leaseManager.observe(
          argumentsValue as unknown as ObserveRequestV1,
          {
            clientEpoch: context.invocation.clientEpoch ?? '',
            leaseId: context.invocation.leaseId,
          },
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
