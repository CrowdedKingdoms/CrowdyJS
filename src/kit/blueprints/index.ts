/**
 * Blueprint builders for the Game Kit, one module per game concept, re-exported
 * here as a stable barrel (import paths from `kit/index.js` and the package
 * root are unchanged as builders are added).
 */
export {
  andPolicies,
  composeBlueprints,
  featureGate,
  kitPolicyJson,
  mergeBlueprints,
  ownerEquals,
  ownerEqualsCaller,
  ownerMirrorProperty,
  toSnakeCase,
  trustedAuthorityFields,
  type KitAutomationSpec,
  type KitAutomationTriggerSpec,
  type KitBlueprint,
  type KitInvokePolicy,
  type KitOwnerIdKind,
  type KitSelectorSpec,
  type KitTrustedAuthority,
  type MergedBlueprints,
  type SelectorPermissionPredicate,
} from './core.js';
export {
  economyBlueprint,
  economyCurrencyFn,
  economyNames,
  type EconomyBlueprintOptions,
  type EconomyNames,
} from './economy.js';
export {
  inventoryBlueprint,
  inventoryNames,
  type InventoryBlueprintOptions,
  type InventoryNames,
} from './inventory.js';
export {
  lockBlueprint,
  lockNames,
  type LockAuthority,
  type LockBlueprintOptions,
  type LockNames,
} from './locks.js';
export {
  plotBlueprint,
  plotNames,
  type PlotBlueprintOptions,
  type PlotNames,
} from './plots.js';
export {
  npcBehaviorFunctionName,
  npcBlueprint,
  type NpcBehaviorSpec,
  type NpcBehaviorTrigger,
  type NpcBlueprintOptions,
} from './npcs.js';
