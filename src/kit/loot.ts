import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import { lootNames, lootRollFn, type LootNames } from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link LootKit}. Must match the deployed loot blueprint. */
export interface LootKitOptions {
  /** The `typePrefix` the loot blueprint was deployed with. */
  typePrefix?: string;
}

/** A parsed view of one loot roll. */
export interface KitLootRoll {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  tableId: string;
  /** Empty until rolled. */
  rolledItemId: string;
  rolledQty: number;
  claimed: boolean;
}

/**
 * Runtime helpers for the {@link lootBlueprint} conventions: create durable
 * `LootRoll` containers, roll them (trusted — app admins by default, or the
 * blueprint's event-drop automations), and claim results atomically into an
 * item stack. The weighted selection runs entirely server-side from a stored
 * seed, so clients can neither pick their loot nor claim it twice.
 *
 * Obtained via `client.kit(appId).loot`.
 */
export class LootKit {
  private readonly names: LootNames;
  private readonly typePrefix: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: LootKitOptions = {},
  ) {
    this.typePrefix = options.typePrefix ?? '';
    this.names = lootNames(this.typePrefix);
  }

  /**
   * Create an unrolled `LootRoll` for a table, owned by `ownerUserId` (who
   * will claim it). Event-drop automations pick from the pool of unrolled
   * rolls — create a few ahead of time for tables wired to `drops`.
   */
  async createRoll(input: {
    ownerUserId: Scalars['BigInt']['input'];
    tableId: string;
    displayName?: string;
    sessionId?: string;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.rollType,
      displayName: input.displayName ?? `Roll ${input.tableId}`,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      properties: [
        {
          key: 'owner_user_id',
          valueType: 'int',
          valueJson: String(input.ownerUserId),
        },
        {
          key: 'table_id',
          valueType: 'string',
          valueJson: JSON.stringify(input.tableId),
        },
      ],
    });
  }

  /**
   * Roll a table on an unrolled `LootRoll` — a **trusted** call (default
   * blueprint authority: app admins). Resolves with the rolled item id.
   *
   * @param tableId - The roll container's table (derives the function name);
   *   read from the container when omitted.
   */
  async roll(rollId: string, tableId?: string): Promise<KitInvokeResult<string>> {
    const table = tableId ?? (await this.state(rollId)).tableId;
    return kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: lootRollFn(table, this.typePrefix),
      selfContainerId: rollId,
      params: {},
    });
  }

  /**
   * Claim a rolled loot into a caller-owned stack of the rolled item. The
   * claimed flag and the grant commit atomically. Resolves with the granted
   * quantity.
   */
  async claim(rollId: string, toStackId: string): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.claimFn,
      selfContainerId: rollId,
      params: { to_stack_id: toStackId },
    });
  }

  /** Read one roll's state. */
  async state(rollId: string): Promise<KitLootRoll> {
    const container = await this.gameModel.container({
      appId: this.appId,
      containerId: rollId,
    });
    return this.toRoll(
      container.containerId,
      container.displayName,
      container.ownerUserId != null ? String(container.ownerUserId) : null,
    );
  }

  /**
   * List a player's rolls, optionally filtered to one table and/or to
   * unclaimed rolled loot (the "your drops" screen).
   */
  async rolls(
    ownerUserId: Scalars['BigInt']['input'],
    options: { tableId?: string; unclaimedOnly?: boolean } = {},
  ): Promise<KitLootRoll[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.rollType,
    });
    const mine = containers.filter(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    const rolls = await Promise.all(
      mine.map((c) =>
        this.toRoll(
          c.containerId,
          c.displayName,
          c.ownerUserId != null ? String(c.ownerUserId) : null,
        ),
      ),
    );
    return rolls.filter(
      (r) =>
        (options.tableId === undefined || r.tableId === options.tableId) &&
        (!options.unclaimedOnly || (!r.claimed && r.rolledItemId !== '')),
    );
  }

  /**
   * Roll/claim audit history from the model event log (each roll records its
   * seed, item, and quantity as applied mutations).
   */
  async history(
    options: { tableId?: string; limit?: number } = {},
  ) {
    return this.gameModel.events({
      appId: this.appId,
      functionName:
        options.tableId !== undefined
          ? lootRollFn(options.tableId, this.typePrefix)
          : this.names.claimFn,
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
    });
  }

  private async toRoll(
    containerId: string,
    displayName: string,
    ownerUserId: string | null,
  ): Promise<KitLootRoll> {
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      containerId,
    );
    return {
      containerId,
      displayName,
      ownerUserId,
      tableId: String(props.table_id ?? ''),
      rolledItemId: String(props.rolled_item_id ?? ''),
      rolledQty: Number(props.rolled_qty ?? 0),
      claimed: props.claimed === true,
    };
  }
}
