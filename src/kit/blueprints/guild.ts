import { composeBlueprints, type KitBlueprint } from './core.js';
import { inventoryBlueprint, inventoryNames } from './inventory.js';
import { lockBlueprint, lockNames } from './locks.js';

/** Options for {@link guildBlueprint}. */
export interface GuildBlueprintOptions {
  /**
   * Prefix for the composed type names (`'Guild'` → `GuildHall` /
   * `GuildBankInventory`). Defaults to `'Guild'`.
   */
  typePrefix?: string;
  /**
   * The guild team's group id — the hall's `group_permission` policy checks
   * membership of THIS group. Create the team first
   * (`kit.social.guild.create`), then deploy the blueprint. Deploy one
   * prefixed blueprint per guild that needs its own hall.
   */
  guildGroupId: string;
  /**
   * Optional group permission key the hall requires (e.g. a custom
   * `use_hall` role permission). Omit to admit every guild member.
   */
  hallPermission?: string;
  /** Also compose a guild-bank inventory (`<prefix>Bank*`). Defaults to true. */
  bank?: boolean;
}

/** Names derived by {@link guildBlueprint} for a given prefix. */
export interface GuildNames {
  hallType: string;
  openHallFn: string;
  closeHallFn: string;
  bankTypePrefix: string;
  bankInventoryType: string;
  bankStackType: string;
}

/** Compute the type/function names a guild blueprint (and kit.social.guild) uses. */
export function guildNames(typePrefix = 'Guild'): GuildNames {
  const locks = lockNames(`${typePrefix}Hall`);
  const bank = inventoryNames(`${typePrefix}Bank`);
  return {
    hallType: locks.objectType,
    openHallFn: locks.openFn,
    closeHallFn: locks.closeFn,
    bankTypePrefix: `${typePrefix}Bank`,
    bankInventoryType: bank.inventoryType,
    bankStackType: bank.stackType,
  };
}

/**
 * Composite blueprint for a **guild's shared assets** — a demonstration of
 * blueprint composition: a `GuildHall` lockable whose open/close is gated on
 * membership of the guild team (`group_permission`), plus a prefixed
 * guild-bank inventory (`GuildBankInventory` / `GuildBankItemStack`) for
 * shared storage. The guild itself is a **team** (`kit.social.guild`), its
 * chat a **channel**, and its territory a grid group-grant
 * (`kit.social.guild.claimTerritory`) — no new model surface needed for
 * those.
 *
 * Runtime counterparts: `client.kit(appId).social.guild` (team/chat/territory),
 * `kit.objectsFor(guildNames().hallType)` (the hall), and
 * `client.kit(appId, { inventory: { typePrefix: guildNames().bankTypePrefix } })
 * .inventory` (the bank).
 */
export function guildBlueprint(options: GuildBlueprintOptions): KitBlueprint {
  const { typePrefix = 'Guild', guildGroupId, hallPermission, bank = true } = options;
  if (!guildGroupId) {
    throw new Error(
      'guildBlueprint requires guildGroupId — create the guild team first, then deploy',
    );
  }
  const hall = lockBlueprint({
    objectTypeName: `${typePrefix}Hall`,
    authority: {
      kind: 'groupPermission',
      groupId: guildGroupId,
      ...(hallPermission !== undefined ? { permission: hallPermission } : {}),
    },
  });
  const blueprints = [hall];
  if (bank) {
    blueprints.push(inventoryBlueprint({ typePrefix: `${typePrefix}Bank` }));
  }
  return composeBlueprints(typePrefix.toLowerCase(), blueprints);
}
