import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import { inventoryNames, type InventoryNames } from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link InventoryKit}. Must match the deployed blueprint's options. */
export interface InventoryKitOptions {
  /** The `typePrefix` the inventory blueprint was deployed with. */
  typePrefix?: string;
}

/** A parsed view of one item stack. */
export interface KitItemStack {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  itemId: string;
  quantity: number;
  slot: number;
}

/**
 * Runtime helpers for the {@link inventoryBlueprint} conventions: find or
 * create the player's inventory, list stacks, and mutate them through the
 * owner-gated model functions. All state lives server-side; every mutation is
 * authority-checked and atomic.
 *
 * Obtained via `client.kit(appId).inventory`.
 */
export class InventoryKit {
  private readonly names: InventoryNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: InventoryKitOptions = {},
  ) {
    this.names = inventoryNames(options.typePrefix ?? '');
  }

  /**
   * Find the caller's inventory container, creating it when absent. The
   * server assigns ownership to the caller (the type is member-instantiable
   * and `ownerUserId` is omitted on create).
   *
   * @param ownerUserId - The calling player's user id (a decimal string, e.g.
   *   from `client.users.me()`), used to recognize an existing inventory.
   */
  async ensure(
    ownerUserId: Scalars['BigInt']['input'],
    options: { displayName?: string; sessionId?: string } = {},
  ) {
    const existing = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.inventoryType,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
    const mine = existing.find(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    if (mine) return mine;
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.inventoryType,
      displayName: options.displayName ?? `Inventory ${ownerUserId}`,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
  }

  /**
   * List a player's item stacks with parsed properties (`itemId`, `quantity`,
   * `slot`). Fetches each stack's visible state in parallel.
   */
  async stacks(ownerUserId: Scalars['BigInt']['input']): Promise<KitItemStack[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.stackType,
    });
    const mine = containers.filter(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    return Promise.all(
      mine.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          itemId: String(props.item_id ?? ''),
          quantity: Number(props.quantity ?? 0),
          slot: Number(props.slot ?? 0),
        };
      }),
    );
  }

  /**
   * Create a new stack owned by the caller (server-assigned ownership).
   * Use {@link grant} afterwards for authority-checked increments; the initial
   * quantity here is a seed value on a container the caller owns anyway.
   *
   * Pass `ownerUserId` (the caller's own user id) to also set the
   * `owner_user_id` mirror property that cross-container guards (economy
   * trades / market listings) verify.
   */
  async createStack(input: {
    itemId: string;
    quantity?: number;
    slot?: number;
    displayName?: string;
    sessionId?: string;
    ownerUserId?: Scalars['BigInt']['input'];
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.stackType,
      displayName: input.displayName ?? `Stack ${input.itemId}`,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      properties: [
        { key: 'item_id', valueType: 'string', valueJson: JSON.stringify(input.itemId) },
        { key: 'quantity', valueType: 'int', valueJson: String(input.quantity ?? 0) },
        { key: 'slot', valueType: 'int', valueJson: String(input.slot ?? 0) },
        ...(input.ownerUserId !== undefined
          ? [
              {
                key: 'owner_user_id',
                valueType: 'int',
                valueJson: String(input.ownerUserId),
              },
            ]
          : []),
      ],
    });
  }

  /** Add items to a stack the caller owns. Resolves with the new quantity. */
  async grant(stackId: string, amount: number): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.grantFn,
      selfContainerId: stackId,
      params: { amount },
    });
  }

  /**
   * Spend items from a stack the caller owns. The server refuses to overdraw
   * (`success: false`, nothing written). Resolves with the new quantity.
   */
  async consume(stackId: string, amount: number): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.consumeFn,
      selfContainerId: stackId,
      params: { amount },
    });
  }

  /** Move a stack to another slot. Resolves with the new (clamped) slot. */
  async move(stackId: string, toSlot: number): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.moveFn,
      selfContainerId: stackId,
      params: { to_slot: toSlot },
    });
  }

  /**
   * Atomically move items between two stacks of the same item type — both
   * writes commit or neither does. The caller must own the source stack.
   * Resolves with the source stack's remaining quantity.
   */
  async transfer(
    fromStackId: string,
    toStackId: string,
    amount: number,
  ): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.transferFn,
      selfContainerId: fromStackId,
      params: { to_id: toStackId, amount },
    });
  }

  /**
   * Record that a stack belongs to an inventory with an
   * `inventory_contains` edge, so {@link contents} can read the whole bag in
   * one traversal.
   */
  async linkStack(inventoryId: string, stackId: string) {
    return this.gameModel.addEdge({
      appId: this.appId,
      fromContainerId: inventoryId,
      toContainerId: stackId,
      relationshipType: this.names.containsEdge,
    });
  }

  /** Read every stack linked to an inventory (via `inventory_contains` edges). */
  async contents(inventoryId: string): Promise<KitItemStack[]> {
    const result = await this.gameModel.traverse({
      appId: this.appId,
      rootId: inventoryId,
      relationshipType: this.names.containsEdge,
      depth: 1,
    });
    const stacks = result.nodes.filter(
      (n) => n.typeName === this.names.stackType,
    );
    return Promise.all(
      stacks.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          itemId: String(props.item_id ?? ''),
          quantity: Number(props.quantity ?? 0),
          slot: Number(props.slot ?? 0),
        };
      }),
    );
  }
}
