import type {
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerMirrorProperty,
  toSnakeCase,
  type KitAutomationSpec,
  type KitBlueprint,
  type KitInvokePolicy,
  type KitOwnerIdKind,
} from './core.js';

/** Options for {@link decksBlueprint}. */
export interface DecksBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /**
   * Turn-based mode: adds `is_current_turn` to draw/play/discard, so only
   * the player whose session turn it is may act. Defaults to false.
   */
  turnBased?: boolean;
  /**
   * Fan-out cap of the manual shuffle automation (raise it above your
   * largest deck size). Defaults to 200.
   */
  shuffleMaxTargets?: number;
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link decksBlueprint} for a given prefix. */
export interface DecksNames {
  cardDefType: string;
  cardType: string;
  drawFn: string;
  playFn: string;
  discardFn: string;
  assignPositionFn: string;
  shuffleAutomation: string;
}

/** Compute the type/function names a decks blueprint (and its runtime helper) uses. */
export function decksNames(typePrefix = ''): DecksNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    cardDefType: `${typePrefix}CardDef`,
    cardType: `${typePrefix}CardInstance`,
    drawFn: `${fnPrefix}draw_card`,
    playFn: `${fnPrefix}play_card`,
    discardFn: `${fnPrefix}discard_card`,
    assignPositionFn: `${fnPrefix}assign_position`,
    shuffleAutomation: `${fnPrefix.replace(/_/g, '-')}deck-shuffle`,
  };
}

/**
 * Blueprint for **cards & hidden information**: an admin `CardDef` catalog
 * and session-scoped `CardInstance`s whose `card_id` carries
 * **`visibility: "owner"`** — the two-property hidden-info trick: only the
 * owner's reads include `card_id`, while the public `revealed_card_id` stays
 * empty until the card is played/discarded (the play function copies it in
 * the same transaction). Opponents can see a card EXISTS in your hand, not
 * what it is — enforced by read filtering, not client discipline.
 *
 * Shuffling is honest about the platform: expressions can't index arrays, so
 * decks are ordered by a `position` int dealt by `assign_position`
 * (`rand_int(0, 1000000)` per card) via a **manual, type-fan-out
 * automation** — `kit.decks.shuffle()` runs it (admin), and drawing takes
 * the owner's lowest-position deck card ("top of deck"; the runtime picks
 * it, the server enforces the zone transition and ownership).
 *
 * Runtime counterpart: `client.kit(appId).decks`.
 */
export function decksBlueprint(options: DecksBlueprintOptions = {}): KitBlueprint {
  const {
    typePrefix = '',
    turnBased = false,
    shuffleMaxTargets = 200,
    ownerIdKind: kind = 'int',
  } = options;
  const names = decksNames(typePrefix);

  const playerPolicy = (condition: string): string => {
    const rules: KitInvokePolicy[] = [
      { type: 'owner_of_self' },
      ...(turnBased ? [{ type: 'is_current_turn' } as KitInvokePolicy] : []),
      { type: 'condition', expression: condition },
    ];
    return kitPolicyJson({ type: 'and', rules });
  };

  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: names.cardDefType,
      key: 'card_id',
      valueType: 'string',
      description: 'Stable card identifier (rules data lives on the def).',
    },
    ownerMirrorProperty(names.cardType, kind),
    {
      containerTypeName: names.cardType,
      key: 'card_id',
      valueType: 'string',
      defaultValueJson: '""',
      visibility: 'owner',
      description:
        "WHICH card this is — owner-visible only (the hidden-information half of the two-property trick); opponents' reads omit it.",
    },
    {
      containerTypeName: names.cardType,
      key: 'revealed_card_id',
      valueType: 'string',
      defaultValueJson: '""',
      description:
        'The public half: empty while the card hides in deck/hand, copied from card_id when played or discarded.',
    },
    {
      containerTypeName: names.cardType,
      key: 'zone',
      valueType: 'string',
      defaultValueJson: '"deck"',
      description: "Card zone: 'deck' | 'hand' | 'board' | 'discard'.",
    },
    {
      containerTypeName: names.cardType,
      key: 'position',
      valueType: 'int',
      defaultValueJson: '0',
      description:
        'Deck order (lowest = top), dealt by the shuffle automation via rand_int.',
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.drawFn,
      containerTypeName: names.cardType,
      returnType: 'string',
      mutations: [{ target: 'self', property: 'zone', expression: '"hand"' }],
      returnExpression: 'self.zone',
      invokePolicyJson: playerPolicy('self.zone == "deck"'),
      description:
        'Draw a card you own from your deck into your hand (the runtime picks the lowest-position deck card — "top of deck"); card_id stays owner-visible.',
    },
    {
      name: names.playFn,
      containerTypeName: names.cardType,
      returnType: 'string',
      mutations: [
        { target: 'self', property: 'zone', expression: '"board"' },
        { target: 'self', property: 'revealed_card_id', expression: 'self.card_id' },
      ],
      returnExpression: 'self.revealed_card_id',
      invokePolicyJson: playerPolicy('self.zone == "hand"'),
      description:
        'Play a card from your hand: the zone flip AND the public reveal (revealed_card_id = card_id) commit together.',
    },
    {
      name: names.discardFn,
      containerTypeName: names.cardType,
      returnType: 'string',
      mutations: [
        { target: 'self', property: 'zone', expression: '"discard"' },
        { target: 'self', property: 'revealed_card_id', expression: 'self.card_id' },
      ],
      returnExpression: 'self.revealed_card_id',
      invokePolicyJson: playerPolicy('self.zone == "hand" || self.zone == "board"'),
      description: 'Discard a card face-up (discard piles are public information).',
    },
    {
      name: names.assignPositionFn,
      containerTypeName: names.cardType,
      returnType: 'int',
      mutations: [
        { target: 'self', property: 'position', expression: 'rand_int(0, 1000000)' },
      ],
      returnExpression: 'self.position',
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description:
        'Shuffle step (automation-only): deals this card a random deck position — the supported server-side shuffle pattern (expressions cannot permute arrays).',
    },
  ];

  const automations: KitAutomationSpec[] = [
    {
      name: names.shuffleAutomation,
      functionName: names.assignPositionFn,
      targetMode: 'type',
      targetTypeName: names.cardType,
      triggerType: 'manual',
      maxTargets: shuffleMaxTargets,
      selectorJson: JSON.stringify({
        selfWhere: [{ key: 'zone', op: '==', value: 'deck' }],
      }),
      description:
        'Manual shuffle: fans assign_position out over every deck-zone card (run via gameModelRunAutomation / kit.decks.shuffle).',
    },
  ];

  return {
    name: names.cardType,
    containerTypes: [
      {
        typeName: names.cardDefType,
        displayName: names.cardDefType,
        instantiableBy: 'admin',
        description: 'Studio card catalog row.',
      },
      {
        typeName: names.cardType,
        displayName: names.cardType,
        instantiableBy: 'member',
        description:
          'One card in play: hidden while in deck/hand (owner-visible card_id), public once revealed.',
      },
    ],
    propertyDefinitions,
    functions,
    automations,
  };
}
