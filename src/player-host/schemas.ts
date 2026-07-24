import {
  assertBoundedJsonSchema,
  deepFreeze,
  type JsonSchema,
  type JsonSchemaArray,
  type JsonSchemaObject,
  type JsonSchemaString,
  type JsonSchemaUnion,
} from '../crowdy-agent/schema.js';
import { CROWDY_AGENT_ERROR_CODES } from '../crowdy-agent/errors.js';
import type { PlayerHostCommandKind } from './types.js';

const decimal = (): JsonSchemaString => ({
  type: 'string',
  minLength: 1,
  maxLength: 48,
  pattern: '^-?(0|[1-9][0-9]*)(\\.[0-9]{1,9})?$',
});
const text = (maxLength: number, minLength = 0): JsonSchemaString => ({
  type: 'string',
  minLength,
  maxLength,
});
const enumText = (values: readonly string[]): JsonSchemaString => ({
  type: 'string',
  minLength: 1,
  maxLength: Math.max(...values.map((value) => value.length)),
  enum: values,
});
const integer = (minimum: number, maximum: number): JsonSchema => ({
  type: 'integer',
  minimum,
  maximum,
});
const number = (minimum: number, maximum: number): JsonSchema => ({
  type: 'number',
  minimum,
  maximum,
});
const boolean = (): JsonSchema => ({ type: 'boolean' });
const dateTime = (): JsonSchemaString => ({
  type: 'string',
  minLength: 20,
  maxLength: 40,
  format: 'date-time',
});
const array = (
  items: JsonSchema,
  maxItems: number,
  minItems = 0,
  uniqueItems = false,
): JsonSchemaArray => ({
  type: 'array',
  minItems,
  maxItems,
  uniqueItems,
  items,
});
const object = (
  properties: Readonly<Record<string, JsonSchema>>,
  required: readonly string[] = Object.keys(properties),
): JsonSchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required,
  maxProperties: Object.keys(properties).length,
  properties,
});

const vector = object({
  x: decimal(),
  y: decimal(),
  z: decimal(),
});
const look = object({
  yaw: decimal(),
  pitch: decimal(),
});
const scope = enumText([
  'observe',
  'locomotion',
  'interact',
  'craft',
  'combat',
  'communicate',
  'travel',
  'grid',
  'trust_consent',
  'commerce',
]);
const commandKind = enumText([
  'MOVE',
  'LOOK',
  'STOP',
  'INVENTORY_SELECT',
  'INVENTORY_CONSUME',
  'INVENTORY_TRANSFER',
  'INTERACT',
  'CRAFT',
  'MOUNT',
  'COMBAT_ATTACK',
  'CHAT_SEND',
  'TRAVEL_TELEPORT',
]);
const planned = {
  observationId: text(128, 1),
  capabilityRevision: text(128, 1),
  controlledEntityId: text(128, 1),
} satisfies Record<string, JsonSchema>;

export const PLAYER_HOST_CAPABILITIES_SCHEMA_V1 = deepFreeze(
  object({
    contractVersion: {
      ...text(20, 20),
      const: 'crowdy.player-host/1',
    },
    gameId: text(128, 1),
    revision: text(128, 1),
    controlledEntityId: text(128, 1),
    commands: array(
      object(
        {
          kind: commandKind,
          toolName: text(128, 3),
          requiredScope: scope,
          risk: enumText([
            'READ_ONLY',
            'ROUTINE_WRITE',
            'WORLD_CONTROL',
            'DESTRUCTIVE',
            'TRUST_CONSENT',
            'ECONOMIC',
            'IRREVERSIBLE',
          ]),
          approval: enumText(['NONE', 'REQUIRED', 'CONDITIONAL']),
          rateLimitPerSecond: integer(1, 100),
        },
        ['kind', 'toolName', 'risk', 'approval', 'rateLimitPerSecond'],
      ),
      64,
    ),
    observation: object({
      maxAgeMs: integer(100, 10_000),
      maxNearbyActors: integer(0, 128),
      maxNearbyVoxels: integer(0, 256),
    }),
    advertisedAt: dateTime(),
  }),
);

export const OBSERVE_REQUEST_SCHEMA_V1 = deepFreeze(
  object({
    detail: enumText(['MINIMAL', 'STANDARD', 'TACTICAL']),
    maxNearbyActors: integer(0, 64),
    maxNearbyVoxels: integer(0, 128),
  }),
);

const inventory = object({
  selectedSlot: integer(0, 255),
  slots: array(
    object({
      slot: integer(0, 255),
      itemId: text(128, 1),
      quantity: integer(0, 1_000_000),
      usable: boolean(),
    }),
    256,
  ),
  craftableRecipeIds: array(text(128, 1), 128, 0, true),
});

export const GAME_OBSERVATION_SCHEMA_V1 = deepFreeze(
  object(
    {
      contractVersion: {
        ...text(25, 25),
        const: 'crowdy.game-observation/1',
      },
      observationId: text(128, 1),
      capabilityRevision: text(128, 1),
      controlledEntityId: text(128, 1),
      observedAt: dateTime(),
      expiresAt: dateTime(),
      player: object({
        position: vector,
        velocity: vector,
        look,
        health: decimal(),
        alive: boolean(),
      }),
      controlledEntity: object({
        kind: enumText(['PLAYER', 'MOUNT', 'VEHICLE']),
        position: vector,
        velocity: vector,
      }),
      target: object(
        {
          targetId: text(128, 1),
          kind: enumText(['ACTOR', 'VOXEL', 'OBJECT', 'NONE']),
          distance: decimal(),
        },
        ['targetId', 'kind', 'distance'],
      ),
      inventory,
      grid: object({
        gridRef: text(128, 1),
        low: vector,
        high: vector,
        effectiveScopes: array(scope, 10, 0, true),
      }),
      nearbyActors: array(
        object(
          {
            actorId: text(128, 1),
            kind: enumText(['PLAYER', 'NPC', 'MOB', 'OBJECT', 'VEHICLE']),
            position: vector,
            distance: decimal(),
            disposition: enumText([
              'SELF',
              'FRIENDLY',
              'NEUTRAL',
              'HOSTILE',
              'UNKNOWN',
            ]),
            label: text(128),
            health: decimal(),
          },
          ['actorId', 'kind', 'position', 'distance', 'disposition'],
        ),
        64,
      ),
      nearbyVoxels: array(
        object({
          position: vector,
          material: text(128, 1),
          interaction: enumText(['NONE', 'MINE', 'PLACE', 'USE']),
        }),
        128,
      ),
      inputState: object({
        modalOpen: boolean(),
        textInputFocused: boolean(),
        humanInputActive: boolean(),
      }),
    },
    [
      'contractVersion',
      'observationId',
      'capabilityRevision',
      'controlledEntityId',
      'observedAt',
      'expiresAt',
      'player',
      'controlledEntity',
      'nearbyActors',
      'nearbyVoxels',
      'inputState',
    ],
  ),
);

const move = object({
  kind: { ...enumText(['MOVE']), const: 'MOVE' },
  ...planned,
  direction: enumText(['FORWARD', 'BACKWARD', 'LEFT', 'RIGHT', 'UP', 'DOWN']),
  intensity: number(0, 1),
  durationMs: integer(16, 2_000),
});
const lookCommand = object({
  kind: { ...enumText(['LOOK']), const: 'LOOK' },
  ...planned,
  deltaYaw: number(-180, 180),
  deltaPitch: number(-90, 90),
});
const stop = object({
  kind: { ...enumText(['STOP']), const: 'STOP' },
});
const inventorySelect = object({
  kind: { ...enumText(['INVENTORY_SELECT']), const: 'INVENTORY_SELECT' },
  ...planned,
  slot: integer(0, 255),
});
const inventoryConsume = object({
  kind: { ...enumText(['INVENTORY_CONSUME']), const: 'INVENTORY_CONSUME' },
  ...planned,
  slot: integer(0, 255),
  quantity: integer(1, 64),
});
const inventoryTransfer = object({
  kind: { ...enumText(['INVENTORY_TRANSFER']), const: 'INVENTORY_TRANSFER' },
  ...planned,
  direction: enumText(['TO_CONTAINER', 'FROM_CONTAINER']),
  slot: integer(0, 255),
  quantity: integer(1, 64),
  containerRef: text(128, 1),
});
const interact = object(
  {
    kind: { ...enumText(['INTERACT']), const: 'INTERACT' },
    ...planned,
    action: enumText(['MINE', 'PLACE', 'USE', 'FISH', 'NPC_TALK']),
    targetRef: text(128, 1),
    inventorySlot: integer(0, 255),
  },
  [
    'kind',
    'observationId',
    'capabilityRevision',
    'controlledEntityId',
    'action',
    'targetRef',
  ],
);
const craft = object({
  kind: { ...enumText(['CRAFT']), const: 'CRAFT' },
  ...planned,
  recipeId: text(128, 1),
  quantity: integer(1, 64),
});
const mount = object(
  {
    kind: { ...enumText(['MOUNT']), const: 'MOUNT' },
    ...planned,
    action: enumText(['MOUNT', 'DISMOUNT']),
    mountRef: text(128, 1),
  },
  [
    'kind',
    'observationId',
    'capabilityRevision',
    'controlledEntityId',
    'action',
  ],
);
const attack = object({
  kind: { ...enumText(['COMBAT_ATTACK']), const: 'COMBAT_ATTACK' },
  ...planned,
  targetRef: text(128, 1),
  attack: enumText(['PRIMARY', 'SECONDARY']),
});
const chat = object({
  kind: { ...enumText(['CHAT_SEND']), const: 'CHAT_SEND' },
  ...planned,
  channel: enumText(['LOCAL', 'GROUP']),
  text: text(280, 1),
});
const teleport = object({
  kind: { ...enumText(['TRAVEL_TELEPORT']), const: 'TRAVEL_TELEPORT' },
  ...planned,
  destinationRef: text(128, 1),
});

export const GAME_COMMAND_SCHEMAS_V1: Readonly<
  Record<PlayerHostCommandKind, JsonSchemaObject>
> = deepFreeze({
  MOVE: move,
  LOOK: lookCommand,
  STOP: stop,
  INVENTORY_SELECT: inventorySelect,
  INVENTORY_CONSUME: inventoryConsume,
  INVENTORY_TRANSFER: inventoryTransfer,
  INTERACT: interact,
  CRAFT: craft,
  MOUNT: mount,
  COMBAT_ATTACK: attack,
  CHAT_SEND: chat,
  TRAVEL_TELEPORT: teleport,
});

export const GAME_COMMAND_SCHEMA_V1: JsonSchemaUnion = deepFreeze({
  oneOf: Object.values(GAME_COMMAND_SCHEMAS_V1),
});

const error = object(
  {
    code: {
      ...text(64, 1),
      enum: CROWDY_AGENT_ERROR_CODES,
    },
    message: text(512, 1),
    retryable: boolean(),
    remediation: text(512, 1),
    field: text(256, 1),
    requiredScope: text(80, 1),
  },
  ['code', 'message', 'retryable'],
);

export const GAME_COMMAND_RESULT_SCHEMA_V1 = deepFreeze(
  object(
    {
      contractVersion: {
        ...text(28, 28),
        const: 'crowdy.game-command-result/1',
      },
      status: enumText(['SUCCEEDED', 'FAILED', 'DENIED', 'OUTCOME_UNKNOWN']),
      commandKind,
      observationId: text(128, 1),
      details: array(
        object({
          name: text(64, 1),
          value: text(512),
        }),
        32,
      ),
      error,
    },
    ['contractVersion', 'status', 'commandKind'],
  ),
);

for (const schema of [
  OBSERVE_REQUEST_SCHEMA_V1,
  ...Object.values(GAME_COMMAND_SCHEMAS_V1),
]) {
  assertBoundedJsonSchema(schema);
}
for (const schema of [
  PLAYER_HOST_CAPABILITIES_SCHEMA_V1,
  GAME_OBSERVATION_SCHEMA_V1,
  GAME_COMMAND_RESULT_SCHEMA_V1,
]) {
  assertBoundedJsonSchema(schema, { rejectAuthorityFields: false });
}
