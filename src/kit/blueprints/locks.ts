import type {
  FunctionMutationInput,
  FunctionParamInput,
  SeedContainerTypeInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  andPolicies,
  kitPolicyJson,
  toSnakeCase,
  type KitBlueprint,
  type KitInvokePolicy,
} from './core.js';

/**
 * The authority source that may operate a lockable object. Several may be
 * combined (any one grants access — they are OR'd):
 *
 * - `owner` — only the container's owner (`owner_of_self`); "only the owner
 *   of this chest can open it".
 * - `key` — the caller must own a matching key item; "if a player has key 1
 *   they can open door 1". Adds a required `key_id` (`container_ref`) param.
 * - `gridPermission` — the caller must hold a runtime grid permission; ties
 *   the object to a world region ("movement permission on chunk X opens the
 *   doors in it").
 * - `groupPermission` — the caller must be in a team/group (optionally with a
 *   specific group permission).
 * - `custom` — any hand-written {@link KitInvokePolicy} rule.
 */
export type LockAuthority =
  | { kind: 'owner' }
  | { kind: 'key' }
  | { kind: 'gridPermission'; key: string; gridId?: string }
  | {
      /**
       * The caller must hold the runtime permission on the grid covering the
       * chunk the OBJECT stands in (`cx`/`cy`/`cz` int properties, seeded via
       * `ObjectsKit.create({ chunk })`). No hand-pinned grid id — one function
       * serves every such object in the world. `mode` picks the covering grid
       * when several overlap: 'first' (enforcement parity, default) |
       * 'smallest' (innermost plot) | 'largest'. Requires game-api v0.13.12+.
       */
      kind: 'chunkPermission';
      key: string;
      mode?: 'first' | 'smallest' | 'largest';
    }
  | { kind: 'groupPermission'; groupId: string; permission?: string }
  | { kind: 'custom'; rule: KitInvokePolicy };

/** Options for {@link lockBlueprint}. */
export interface LockBlueprintOptions {
  /**
   * Container type name for the lockable object (`Door`, `Chest`, `Gate`, …).
   * Also drives the function names (`open_door` / `close_door`). Defaults to
   * `'Lockable'`.
   */
  objectTypeName?: string;
  /** Key item type name (only used with a `key` authority). Defaults to `<objectTypeName>Key`. */
  keyTypeName?: string;
  /** One or more authority sources; any one grants access. */
  authority: LockAuthority | LockAuthority[];
  /**
   * Extra policy rule AND'ed on top of the OR'd authorities — e.g.
   * `featureGate('vip')` for members-only doors regardless of keys.
   */
  policyExtra?: KitInvokePolicy;
}

/** Names derived by {@link lockBlueprint} for a given object type. */
export interface LockNames {
  objectType: string;
  keyType: string;
  openFn: string;
  closeFn: string;
}

/** Compute the type/function names a lock blueprint (and its runtime helper) uses. */
export function lockNames(
  objectTypeName = 'Lockable',
  keyTypeName?: string,
): LockNames {
  const snake = toSnakeCase(objectTypeName);
  return {
    objectType: objectTypeName,
    keyType: keyTypeName ?? `${objectTypeName}Key`,
    openFn: `open_${snake}`,
    closeFn: `close_${snake}`,
  };
}

function lockAuthorityRule(authority: LockAuthority): KitInvokePolicy {
  switch (authority.kind) {
    case 'owner':
      return { type: 'owner_of_self' };
    case 'key':
      // Container ownership is not readable from expressions, so the key
      // mirrors its owner into an `owner_user_id` property; the condition
      // verifies both the match and the ownership server-side.
      return {
        type: 'condition',
        expression:
          'ref($key_id).key_id == self.required_key_id && ref($key_id).owner_user_id == $caller_user_id',
      };
    case 'gridPermission':
      return {
        type: 'grid_permission',
        key: authority.key,
        ...(authority.gridId !== undefined ? { gridId: authority.gridId } : {}),
      };
    case 'chunkPermission':
      // Resolved per-invocation against the grid covering the object's chunk.
      return {
        type: 'condition',
        expression: `has_chunk_permission($caller_user_id, "${authority.key}", self.cx, self.cy, self.cz, "${authority.mode ?? 'first'}")`,
      };
    case 'groupPermission':
      return {
        type: 'group_permission',
        groupId: authority.groupId,
        ...(authority.permission !== undefined
          ? { permission: authority.permission }
          : {}),
      };
    case 'custom':
      return authority.rule;
  }
}

/**
 * Blueprint for a **lockable game object** (door, chest, gate, switch) whose
 * `open`/`close` functions are gated by a configurable authority source:
 * ownership, a key item the caller must hold, a runtime grid permission, a
 * team/group permission, or any custom policy rule. Multiple authorities are
 * OR'd, so "the owner, or anyone with the right key" is one blueprint.
 *
 * Runtime counterpart: `client.kit(appId).objects`.
 */
export function lockBlueprint(options: LockBlueprintOptions): KitBlueprint {
  const authorities = Array.isArray(options.authority)
    ? options.authority
    : [options.authority];
  if (authorities.length === 0) {
    throw new Error('lockBlueprint requires at least one authority source');
  }
  const names = lockNames(options.objectTypeName, options.keyTypeName);
  const usesKey = authorities.some((a) => a.kind === 'key');
  const usesChunk = authorities.some((a) => a.kind === 'chunkPermission');

  const rules = authorities.map(lockAuthorityRule);
  const policy: KitInvokePolicy =
    rules.length === 1 ? rules[0] : { type: 'or', rules };
  const policyJson = kitPolicyJson(andPolicies(policy, options.policyExtra));

  const parameters: FunctionParamInput[] = usesKey
    ? [{ name: 'key_id', valueType: 'container_ref', required: true }]
    : [];

  const containerTypes: SeedContainerTypeInput[] = [
    {
      typeName: names.objectType,
      displayName: names.objectType,
      instantiableBy: 'admin',
      description: 'A lockable world object operated through gated functions.',
    },
  ];
  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: names.objectType,
      key: 'is_open',
      valueType: 'bool',
      defaultValueJson: 'false',
    },
  ];

  if (usesChunk) {
    // The chunk the object stands in, read by has_chunk_permission().
    for (const axis of ['cx', 'cy', 'cz']) {
      propertyDefinitions.push({
        containerTypeName: names.objectType,
        key: axis,
        valueType: 'int',
        defaultValueJson: '0',
      });
    }
  }

  if (usesKey) {
    propertyDefinitions.push({
      containerTypeName: names.objectType,
      key: 'required_key_id',
      valueType: 'string',
    });
    containerTypes.push({
      typeName: names.keyType,
      displayName: names.keyType,
      instantiableBy: 'admin',
      description: 'A key item granting access to matching lockable objects.',
    });
    propertyDefinitions.push(
      { containerTypeName: names.keyType, key: 'key_id', valueType: 'string' },
      {
        containerTypeName: names.keyType,
        key: 'owner_user_id',
        valueType: 'int',
      },
    );
  }

  const openMutation: FunctionMutationInput = {
    target: 'self',
    property: 'is_open',
    expression: 'true',
  };
  const closeMutation: FunctionMutationInput = {
    target: 'self',
    property: 'is_open',
    expression: 'false',
  };

  return {
    name: names.objectType,
    containerTypes,
    propertyDefinitions,
    functions: [
      {
        name: names.openFn,
        containerTypeName: names.objectType,
        returnType: 'bool',
        parameters,
        mutations: [openMutation],
        returnExpression: 'self.is_open',
        invokePolicyJson: policyJson,
        description: `Open a ${names.objectType}; the invoke policy decides who may.`,
      },
      {
        name: names.closeFn,
        containerTypeName: names.objectType,
        returnType: 'bool',
        parameters,
        mutations: [closeMutation],
        returnExpression: 'self.is_open',
        invokePolicyJson: policyJson,
        description: `Close a ${names.objectType}; same authority as opening.`,
      },
    ],
  };
}
