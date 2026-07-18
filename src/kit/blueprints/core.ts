import type {
  Scalars,
  SeedContainerInput,
  SeedContainerTypeInput,
  SeedEdgeInput,
  SeedFunctionInput,
  SeedGameModelInput,
  SeedPropertyDefInput,
  UpsertAutomationInput,
  UpsertAutomationTriggerInput,
} from '../../generated/graphql.js';

/**
 * A composable invoke-policy rule tree, mirroring the server's authority
 * rules (see the Game API "Game Models → Authority" guide). Serialized with
 * {@link kitPolicyJson} into the `invokePolicyJson` a function carries.
 */
export type KitInvokePolicy =
  | { type: 'allow' }
  | { type: 'owner_of_self' }
  | { type: 'is_host' }
  | { type: 'is_current_turn' }
  | { type: 'is_participant' }
  | { type: 'is_automation' }
  | { type: 'tier_feature'; feature: string }
  | { type: 'group_permission'; groupId: string; permission?: string }
  | { type: 'grid_permission'; key: string; gridId?: string }
  | { type: 'condition'; expression: string }
  | { type: 'and'; rules: KitInvokePolicy[] }
  | { type: 'or'; rules: KitInvokePolicy[] }
  | { type: 'not'; rule: KitInvokePolicy };

/** Serialize a {@link KitInvokePolicy} tree to the wire `invokePolicyJson`. */
export function kitPolicyJson(policy: KitInvokePolicy): string {
  return JSON.stringify(policy);
}

/**
 * A grid-permission filter inside a selector: gates selves/candidates by
 * whether the USER behind each container has/lacks an unexpired runtime grid
 * permission. Requires a game-api with the permission-read selector support
 * (v0.13.12+).
 */
export interface SelectorPermissionPredicate {
  /** Where the container's user id comes from: its owner, or a property. */
  userFrom: 'owner' | { property: string };
  op: 'has' | 'lacks';
  /** Runtime permission key (e.g. 'access', 'update_voxel_data'). */
  key: string;
  /** Literal grid id, a property holding one, or omitted for "on ANY grid". */
  grid?: number | string | { property: string };
}

/**
 * Typed automation selector (serialized into `selectorJson` at deploy).
 * Property predicates (`selfWhere`/`where`) filter on model data; permission
 * predicates (`selfPermissionWhere`/`candidatePermissionWhere`) filter on the
 * live grid ACL. Extra fields pass through untouched.
 */
export interface KitSelectorSpec {
  selfWhere?: Array<{ key: string; op: string; value: unknown }>;
  selfPermissionWhere?: SelectorPermissionPredicate[];
  pick?: 'nearest' | 'lowest' | 'highest' | 'random';
  ofType?: string;
  where?: Array<{ key: string; op: string; value: unknown }>;
  candidatePermissionWhere?: SelectorPermissionPredicate[];
  by?: 'manhattan' | { property: string };
  bindAs?: {
    ref?: string;
    x?: string;
    y?: string;
    approachX?: string;
    approachY?: string;
    approachStop?: number;
  };
  [key: string]: unknown;
}

/** An automation spec inside a blueprint (the `appId` is bound at deploy). */
export type KitAutomationSpec = Omit<UpsertAutomationInput, 'appId'>;

/** An automation event-trigger spec inside a blueprint. */
export type KitAutomationTriggerSpec = Omit<UpsertAutomationTriggerInput, 'appId'>;

/**
 * A **blueprint**: a self-contained, declarative bundle of game-model
 * definitions (container types, property defs, functions), optional seed
 * instances, and optional automations that together implement one game
 * concept (an inventory system, a lockable object, an NPC archetype).
 *
 * Blueprints are plain data — build them with {@link inventoryBlueprint},
 * {@link lockBlueprint}, {@link npcBlueprint}, or by hand — then load them
 * into an app with `client.kit(appId).deploy([...])` (requires the app-admin
 * `manage_apps` permission). Deployment is idempotent: seeding upserts
 * definitions and `upsertAutomation` keys on the automation name.
 */
export interface KitBlueprint {
  /** A short identifier used in error messages (e.g. `'inventory'`). */
  name: string;
  containerTypes?: SeedContainerTypeInput[];
  propertyDefinitions?: SeedPropertyDefInput[];
  functions?: SeedFunctionInput[];
  /** Optional shared/world containers to seed (catalog data, world objects). */
  containers?: SeedContainerInput[];
  /** Optional edges between seeded containers (by `tempId`). */
  edges?: SeedEdgeInput[];
  /** Server-driven automations to upsert after the seed. */
  automations?: KitAutomationSpec[];
  /** Event triggers to attach to the automations. */
  automationTriggers?: KitAutomationTriggerSpec[];
}

/** Convert `PascalCase`/`camelCase` to `snake_case` for derived names. */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Merging / deployment payloads
// ---------------------------------------------------------------------------

/** The wire payloads {@link mergeBlueprints} produces for one deployment. */
export interface MergedBlueprints {
  seedInput: SeedGameModelInput;
  automations: UpsertAutomationInput[];
  automationTriggers: UpsertAutomationTriggerInput[];
}

/**
 * Merge blueprints into a single `gameModelSeed` payload plus the automation
 * upserts, rejecting duplicate type, property, function, or automation names
 * across blueprints (a duplicate almost always means two blueprints need
 * distinct prefixes/type names).
 */
export function mergeBlueprints(
  appId: Scalars['BigInt']['input'],
  blueprints: KitBlueprint[],
  options: { sessionId?: string } = {},
): MergedBlueprints {
  const containerTypes: SeedContainerTypeInput[] = [];
  const propertyDefinitions: SeedPropertyDefInput[] = [];
  const functions: SeedFunctionInput[] = [];
  const containers: SeedContainerInput[] = [];
  const edges: SeedEdgeInput[] = [];
  const automations: UpsertAutomationInput[] = [];
  const automationTriggers: UpsertAutomationTriggerInput[] = [];

  const seenTypes = new Map<string, string>();
  const seenProps = new Map<string, string>();
  const seenFunctions = new Map<string, string>();
  const seenAutomations = new Map<string, string>();
  const seenTempIds = new Map<string, string>();

  const claim = (
    seen: Map<string, string>,
    key: string,
    blueprintName: string,
    kind: string,
  ) => {
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new Error(
        `Blueprint '${blueprintName}' redefines ${kind} '${key}' already defined by blueprint '${existing}'`,
      );
    }
    seen.set(key, blueprintName);
  };

  for (const blueprint of blueprints) {
    for (const type of blueprint.containerTypes ?? []) {
      claim(seenTypes, type.typeName, blueprint.name, 'container type');
      containerTypes.push(type);
    }
    for (const prop of blueprint.propertyDefinitions ?? []) {
      claim(
        seenProps,
        `${prop.containerTypeName}.${prop.key}`,
        blueprint.name,
        'property',
      );
      propertyDefinitions.push(prop);
    }
    for (const fn of blueprint.functions ?? []) {
      claim(seenFunctions, fn.name, blueprint.name, 'function');
      functions.push(fn);
    }
    for (const container of blueprint.containers ?? []) {
      claim(seenTempIds, container.tempId, blueprint.name, 'container tempId');
      containers.push(container);
    }
    edges.push(...(blueprint.edges ?? []));
    for (const automation of blueprint.automations ?? []) {
      claim(seenAutomations, automation.name, blueprint.name, 'automation');
      automations.push({ ...automation, appId });
    }
    for (const trigger of blueprint.automationTriggers ?? []) {
      automationTriggers.push({ ...trigger, appId });
    }
  }

  const seedInput: SeedGameModelInput = {
    appId,
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(containerTypes.length ? { containerTypes } : {}),
    ...(propertyDefinitions.length ? { propertyDefinitions } : {}),
    ...(functions.length ? { functions } : {}),
    ...(containers.length ? { containers } : {}),
    ...(edges.length ? { edges } : {}),
  };

  return { seedInput, automations, automationTriggers };
}

/**
 * Concatenate several blueprints into ONE composite blueprint (a plain
 * client-side merge of the definition arrays — no collision checks; those
 * happen in {@link mergeBlueprints} at deploy). Used by composite builders
 * such as `guildBlueprint` that bundle other builders' output under a single
 * name.
 */
export function composeBlueprints(
  name: string,
  blueprints: KitBlueprint[],
): KitBlueprint {
  const out: KitBlueprint = { name };
  for (const bp of blueprints) {
    if (bp.containerTypes?.length) {
      out.containerTypes = [...(out.containerTypes ?? []), ...bp.containerTypes];
    }
    if (bp.propertyDefinitions?.length) {
      out.propertyDefinitions = [
        ...(out.propertyDefinitions ?? []),
        ...bp.propertyDefinitions,
      ];
    }
    if (bp.functions?.length) {
      out.functions = [...(out.functions ?? []), ...bp.functions];
    }
    if (bp.containers?.length) {
      out.containers = [...(out.containers ?? []), ...bp.containers];
    }
    if (bp.edges?.length) {
      out.edges = [...(out.edges ?? []), ...bp.edges];
    }
    if (bp.automations?.length) {
      out.automations = [...(out.automations ?? []), ...bp.automations];
    }
    if (bp.automationTriggers?.length) {
      out.automationTriggers = [
        ...(out.automationTriggers ?? []),
        ...bp.automationTriggers,
      ];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared authority / policy helpers used across the genre builders
// ---------------------------------------------------------------------------

/**
 * Who may call a **trusted** mutation (XP grants, score submits, loot rolls,
 * currency mints, …) — the kit-standard authority shape mirroring
 * `LockAuthority` (Part of the anti-cheat conventions: reward-granting
 * functions must never be plain player calls):
 *
 * - `'server'` — `invokeScope: "server"`: only app admins may invoke (run it
 *   from trusted studio/backend code holding `manage_apps`).
 * - `'host'` — `is_host` policy: the elected host client may invoke.
 * - `'automation'` — `autonomousInvocable` + `is_automation` policy: only
 *   server-driven automations may invoke.
 * - `'owner'` — `owner_of_self`: the owning player (only safe for
 *   self-limiting functions guarded by conditions).
 * - `{ custom: rule }` — any hand-written policy rule.
 */
export type KitTrustedAuthority =
  | 'server'
  | 'host'
  | 'automation'
  | 'owner'
  | { custom: KitInvokePolicy };

/**
 * The function-level fields a {@link KitTrustedAuthority} compiles to.
 * `extraCondition` (when given) is AND'ed into the policy.
 */
export function trustedAuthorityFields(
  authority: KitTrustedAuthority,
  extraCondition?: string,
): Pick<
  { invokePolicyJson: string; invokeScope?: string; autonomousInvocable?: boolean },
  'invokePolicyJson' | 'invokeScope' | 'autonomousInvocable'
> {
  const rule: KitInvokePolicy =
    authority === 'server'
      ? { type: 'allow' }
      : authority === 'host'
        ? { type: 'is_host' }
        : authority === 'automation'
          ? { type: 'is_automation' }
          : authority === 'owner'
            ? { type: 'owner_of_self' }
            : authority.custom;
  const policy: KitInvokePolicy = extraCondition
    ? { type: 'and', rules: [rule, { type: 'condition', expression: extraCondition }] }
    : rule;
  return {
    invokePolicyJson: kitPolicyJson(policy),
    ...(authority === 'server' ? { invokeScope: 'server' } : {}),
    ...(authority === 'automation' ? { autonomousInvocable: true } : {}),
  };
}

/**
 * AND extra policy rules into a base policy (skipping empties) — the
 * composition point for `policyExtra` options such as
 * `plotBlueprint({ buyPolicyExtra: featureGate('land_owner') })`.
 */
export function andPolicies(
  base: KitInvokePolicy,
  ...extra: Array<KitInvokePolicy | undefined>
): KitInvokePolicy {
  const extras = extra.filter((r): r is KitInvokePolicy => r !== undefined);
  if (extras.length === 0) return base;
  return { type: 'and', rules: [base, ...extras] };
}

/**
 * A `tier_feature` policy leaf: the caller's access tier must hold `feature`
 * (defined via `kit.features.define` and granted with
 * `kit.features.grantToTier`). Pass it to any builder's `*policyExtra`
 * option to monetization-gate that function.
 */
export function featureGate(feature: string): KitInvokePolicy {
  return { type: 'tier_feature', feature };
}

/**
 * How kit types mirror their owner's user id into an `owner_user_id`
 * property (expressions cannot read container ownership directly).
 * The kit standard is `'int'`; set `'string'` on a builder only when
 * integrating with models that mirrored the owner as a string (e.g. Blocks
 * with Friends) — generated conditions then compare via `to_string(...)`.
 */
export type KitOwnerIdKind = 'int' | 'string';

/**
 * Expression fragment asserting that `ownerExpr` (an `owner_user_id`-style
 * property read) equals the calling user, honoring {@link KitOwnerIdKind}.
 */
export function ownerEqualsCaller(
  ownerExpr: string,
  kind: KitOwnerIdKind = 'int',
): string {
  return kind === 'string'
    ? `${ownerExpr} == to_string($caller_user_id)`
    : `${ownerExpr} == $caller_user_id`;
}

/** The `SeedPropertyDefInput` for a kit-standard owner mirror property. */
export function ownerMirrorProperty(
  containerTypeName: string,
  kind: KitOwnerIdKind = 'int',
): { containerTypeName: string; key: string; valueType: string; defaultValueJson: string; description: string } {
  return {
    containerTypeName,
    key: 'owner_user_id',
    valueType: kind,
    defaultValueJson: kind === 'string' ? '""' : '0',
    description:
      "Mirror of the container owner's user id (kit convention: expressions cannot read container ownership).",
  };
}
