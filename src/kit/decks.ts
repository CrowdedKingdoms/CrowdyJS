import type { GameModelAPI } from '../domains/gameModel.js';
import type { EngineDetector } from './engine.js';
import type { Scalars } from '../generated/graphql.js';
import { decksNames, type DecksNames } from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link DecksKit}. Must match the deployed decks blueprint. */
export interface DecksKitOptions {
  /**
   * The compute module holding hidden hands when the app runs a deck
   * engine. Defaults to `'deck-engine'`.
   */
  engineModuleName?: string;
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
    private readonly engines?: EngineDetector,
  ) {
    this.names = decksNames(options.typePrefix ?? '');
    this.engineModuleName = options.engineModuleName ?? 'deck-engine';
  }

  private readonly engineModuleName: string;

  // -- Engine path (Wave 2): true hidden information over the deck engine --

  /**
   * Is a deck compute engine deployed + enabled (cached per session)? When
   * true, hands and deck order live in MODULE state (server-held secrets);
   * the blueprint's owner-visibility hands remain for model-only apps.
   */
  engineAvailable(): Promise<boolean> {
    if (!this.engines) return Promise.resolve(false);
    return this.engines.has(this.engineModuleName);
  }

  /** Create an engine table with seeded shuffle + hidden deals (creator seats itself). */
  async engineNewTable(input: {
    tableId: string;
    players: string[];
    handSize?: number;
    deckDef?: string;
  }) {
    return this.engineInvoke('new_table', input as unknown as Record<string, unknown>);
  }

  /** YOUR hidden hand (the only read path; opponents can never see it). */
  async engineHand(tableId: string): Promise<string[]> {
    const body = await this.engineInvoke('hand', { tableId });
    return Array.isArray(body.hand) ? (body.hand as unknown[]).map(String) : [];
  }

  /** Draw one card into your hidden hand. */
  async engineDraw(tableId: string) {
    return this.engineInvoke('draw', { tableId });
  }

  /** Play (reveal) a card from your hand into a public zone. */
  async enginePlay(tableId: string, card: string, zone = 'table') {
    return this.engineInvoke('play', { tableId, card, zone });
  }

  /** Collect a public zone to the discard (trick taken). */
  async engineTakeZone(tableId: string, zone: string) {
    return this.engineInvoke('take_zone', { tableId, zone });
  }

  /** The public table view (counts + zones — never hidden hands). */
  async engineTable(tableId: string) {
    return this.engineInvoke('table', { tableId });
  }

  private async engineInvoke(exportName: string, params: Record<string, unknown>) {
    if (!this.engines) {
      throw new Error('deck engine unavailable: compute domain not wired');
    }
    const result = await this.engines.invoke(this.engineModuleName, exportName, params);
    if (!result.success) {
      throw new Error(`decks.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
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
