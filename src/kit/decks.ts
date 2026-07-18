import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import { decksNames, type DecksNames } from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link DecksKit}. Must match the deployed decks blueprint. */
export interface DecksKitOptions {
  /** The `typePrefix` the decks blueprint was deployed with. */
  typePrefix?: string;
}

/** A parsed view of one card instance, as visible to the CALLER. */
export interface KitCard {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  /**
   * The hidden identity — non-empty only when the caller may see it (their
   * own cards, or any revealed card via `revealedCardId`).
   */
  cardId: string;
  /** The public identity (empty until played/discarded). */
  revealedCardId: string;
  zone: string;
  position: number;
}

/**
 * Runtime helpers for the {@link decksBlueprint} conventions: deal
 * session-scoped cards, shuffle by dealing random positions (admin-run
 * automation), and draw/play/discard through the zone-guarded functions.
 * Hidden information is enforced by property visibility server-side: reads
 * go through `containerState`, which strips other players' `card_id`.
 *
 * Obtained via `client.kit(appId).decks`.
 */
export class DecksKit {
  private readonly names: DecksNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: DecksKitOptions = {},
  ) {
    this.names = decksNames(options.typePrefix ?? '');
  }

  /**
   * Deal a deck to a player: creates one CardInstance per card id (zone
   * `deck`), owned by the player. Run {@link shuffle} afterwards to deal
   * random positions.
   */
  async deal(input: {
    ownerUserId: Scalars['BigInt']['input'];
    cardIds: string[];
    sessionId?: string;
  }) {
    const created = [];
    for (const [index, cardId] of input.cardIds.entries()) {
      created.push(
        await this.gameModel.createContainer({
          appId: this.appId,
          typeName: this.names.cardType,
          displayName: `Card ${index + 1}`,
          ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
          properties: [
            {
              key: 'owner_user_id',
              valueType: 'int',
              valueJson: String(input.ownerUserId),
            },
            { key: 'card_id', valueType: 'string', valueJson: JSON.stringify(cardId) },
            { key: 'position', valueType: 'int', valueJson: String(index) },
          ],
        }),
      );
    }
    return created;
  }

  /**
   * Shuffle every deck-zone card by running the manual `assign_position`
   * automation (admin): each card gets a fresh `rand_int` position
   * server-side.
   */
  async shuffle() {
    return this.gameModel.runAutomation({
      appId: this.appId,
      name: this.names.shuffleAutomation,
    });
  }

  /** A player's cards in one zone, as visible to the caller. */
  async cards(
    ownerUserId: Scalars['BigInt']['input'] | null,
    options: { zone?: string; sessionId?: string } = {},
  ): Promise<KitCard[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.cardType,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
    const filtered =
      ownerUserId === null
        ? containers
        : containers.filter(
            (c) =>
              c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
          );
    const cards = await Promise.all(
      filtered.map((c) =>
        this.toCard(
          c.containerId,
          c.displayName,
          c.ownerUserId != null ? String(c.ownerUserId) : null,
        ),
      ),
    );
    return options.zone !== undefined
      ? cards.filter((c) => c.zone === options.zone)
      : cards;
  }

  /** Your hand (owner-visible card ids included by the server). */
  async myHand(
    ownerUserId: Scalars['BigInt']['input'],
    options: { sessionId?: string } = {},
  ): Promise<KitCard[]> {
    return this.cards(ownerUserId, { ...options, zone: 'hand' });
  }

  /** Every card on the board (public: revealed ids). */
  async board(options: { sessionId?: string } = {}): Promise<KitCard[]> {
    return this.cards(null, { ...options, zone: 'board' });
  }

  /**
   * Draw the top of your deck (lowest position — positions were dealt by
   * the shuffle automation). The server enforces ownership, turn (when
   * `turnBased`), and the deck→hand zone transition.
   */
  async draw(
    ownerUserId: Scalars['BigInt']['input'],
    options: { sessionId?: string } = {},
  ): Promise<KitInvokeResult<string>> {
    const deck = await this.cards(ownerUserId, { ...options, zone: 'deck' });
    if (deck.length === 0) {
      throw new Error('Deck is empty — nothing to draw');
    }
    const top = deck.reduce((a, b) => (b.position < a.position ? b : a));
    return this.drawCard(top.containerId, options);
  }

  /** Draw one specific deck card (prefer {@link draw} for top-of-deck). */
  async drawCard(
    cardInstanceId: string,
    options: { sessionId?: string } = {},
  ): Promise<KitInvokeResult<string>> {
    return kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.drawFn,
      selfContainerId: cardInstanceId,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      params: {},
    });
  }

  /**
   * Play a card from your hand: the zone flip and the public reveal commit
   * together. Resolves with the revealed card id.
   */
  async play(
    cardInstanceId: string,
    options: { sessionId?: string } = {},
  ): Promise<KitInvokeResult<string>> {
    return kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.playFn,
      selfContainerId: cardInstanceId,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      params: {},
    });
  }

  /** Discard a card face-up. */
  async discard(
    cardInstanceId: string,
    options: { sessionId?: string } = {},
  ): Promise<KitInvokeResult<string>> {
    return kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.discardFn,
      selfContainerId: cardInstanceId,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      params: {},
    });
  }

  private async toCard(
    containerId: string,
    displayName: string,
    ownerUserId: string | null,
  ): Promise<KitCard> {
    // containerState filters properties by visibility: other players' hands
    // come back WITHOUT card_id — the hidden-info guarantee is server-side.
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      containerId,
    );
    return {
      containerId,
      displayName,
      ownerUserId,
      cardId: String(props.card_id ?? ''),
      revealedCardId: String(props.revealed_card_id ?? ''),
      zone: String(props.zone ?? ''),
      position: Number(props.position ?? 0),
    };
  }
}
