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
  combatBlueprint,
  combatNames,
  type CombatBlueprintOptions,
  type CombatNames,
} from './combat.js';
export {
  decksBlueprint,
  decksNames,
  type DecksBlueprintOptions,
  type DecksNames,
} from './decks.js';
export {
  economyBlueprint,
  economyCurrencyFn,
  economyNames,
  type EconomyBlueprintOptions,
  type EconomyNames,
} from './economy.js';
export {
  guildBlueprint,
  guildNames,
  type GuildBlueprintOptions,
  type GuildNames,
} from './guild.js';
export {
  inventoryBlueprint,
  inventoryNames,
  type InventoryBlueprintOptions,
  type InventoryNames,
} from './inventory.js';
export {
  lootBlueprint,
  lootNames,
  lootRollFn,
  type LootBlueprintOptions,
  type LootDropSpec,
  type LootEntrySpec,
  type LootNames,
  type LootTableSpec,
} from './loot.js';
export {
  lockBlueprint,
  lockNames,
  type LockAuthority,
  type LockBlueprintOptions,
  type LockNames,
} from './locks.js';
export {
  questsBlueprint,
  questsNames,
  type QuestAdvanceSpec,
  type QuestsBlueprintOptions,
  type QuestsNames,
} from './quests.js';
export {
  progressionBlueprint,
  progressionNames,
  type ProgressionBlueprintOptions,
  type ProgressionNames,
} from './progression.js';
export {
  plotBlueprint,
  plotNames,
  type PlotBlueprintOptions,
  type PlotNames,
} from './plots.js';
export {
  matchesBlueprint,
  matchesNames,
  type MatchesBlueprintOptions,
  type MatchesNames,
} from './matches.js';
export {
  npcBehaviorFunctionName,
  npcBlueprint,
  type NpcBehaviorSpec,
  type NpcBehaviorTrigger,
  type NpcBlueprintOptions,
} from './npcs.js';
export {
  worldsimBlueprint,
  worldsimNames,
  type WorldsimBlueprintOptions,
  type WorldsimNames,
} from './worldsim.js';
