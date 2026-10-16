import { CrowdyError } from '../../errors.js';
import { HubState, PrivateState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';
import { WritableKitStore, type KitStore } from '../store.js';

/** Items and currency moved together: a price, a reward, a hold. */
export interface EconBundle {
  items: Record<string, number>;
  currency: Record<string, number>;
}

export interface EconStack {
  item: string;
  count: number;
}

/** What the `inventory` read answers: only the player reads it. */
export interface InventoryView {
  slots: number;
  stacks: EconStack[];
  /** Items given that did not fit, waiting for {@link InventoryKit.takeMail}. */
  mail: Record<string, number>;
  /** Items held for a trade or an order. */
  held: Record<string, number>;
}

/** What the `wallet` read answers. */
export interface WalletView {
  balances: Record<string, number>;
  /** Currency held for a trade or an order. */
  held: Record<string, number>;
}

export interface AchievementView {
  id: string;
  counter: string;
  target: number;
  count: number;
  unlocked_at: number | null;
}

export interface QuestObjectiveView {
  counter: string;
  target: number;
  count: number;
}

export interface QuestView {
  id: string;
  state: 'locked' | 'available' | 'active' | 'complete' | 'done';
  objectives: QuestObjectiveView[];
  reward: EconBundle;
  xp: number;
  tutorial: boolean;
}

/** What the `progress` read answers. */
export interface ProgressView {
  level: number;
  xp: number;
  /** What the level takes to finish; null at the top. */
  next: number | null;
  total_xp: number;
  achievements: AchievementView[];
  quests: QuestView[];
}

/** What the `player` topic carries and `profile` answers: anyone may read it. */
export interface PlayerProfile {
  player: number;
  level: number;
  achievements: string[];
  quests_done: number;
}

export interface ProductionView {
  producers: Array<[string, number]>;
  stock: Record<string, number>;
  capacity: Record<string, number>;
}

/** Everything a player's hub keeps for them (`me`). */
export interface PlayerView {
  profile: PlayerProfile;
  inventory: InventoryView;
  wallet: WalletView;
  progress: ProgressView;
  production: ProductionView;
}

/** What one change earned: levels, achievements, quests complete. */
export interface PlayerEarned {
  levels: number;
  achievements: string[];
  quests: string[];
}

export interface EconRecipe {
  id: string;
  inputs: EconBundle;
  outputs: EconBundle;
  level: number;
}

export interface LootTableView {
  id: string;
  cost: EconBundle;
  entries: Array<{ item: string; count: number; weight: number; pity_group: string | null }>;
  pity_within: Record<string, number>;
}

/** What `rules` answers: the game's items, recipes, loot tables, quests and achievements. */
export interface PlayerRules {
  slots: number;
  items: Array<{ id: string; max_stack: number; tradable: boolean; name: string }>;
  currencies: string[];
  recipes: EconRecipe[];
  loot: LootTableView[];
  quests: Array<Record<string, unknown>>;
  achievements: Array<Record<string, unknown>>;
  client_counters: string[];
}

export interface LootRoll {
  item: string;
  count: number;
  /** Pity picked it. */
  pity: boolean;
  roll: number;
}

/** A `player` topic event: a level gained, an achievement unlocked. */
export type PlayerEvent =
  | { type: 'level'; player: number; level: number }
  | { type: 'achievement'; player: number; achievement: string };

const TOPIC = 'player';

/** A store fed by another once it exists. */
class Relay<T> extends WritableKitStore<T | undefined> {
  constructor() {
    super(undefined);
  }

  attach(source: KitStore<T | undefined>): void {
    source.subscribe((v) => this.set(v));
    if (source.get() !== undefined) this.set(source.get());
  }
}

interface Parts {
  key: string;
  profile: HubState<PlayerProfile>;
  inventory: PrivateState<InventoryView>;
  wallet: PrivateState<WalletView>;
  progress: PrivateState<ProgressView>;
}

/**
 * The caller's own `player` hub (the `player` starter), keyed by their player id: what they own
 * and what they have done. Its stores exist from the start and fill once {@link watch} has read
 * them; only the player reads `inventory`, `wallet` and `progress`, and each is read again when
 * the hub says it changed. The economy is not a ledger: see the Game Kit's economy page.
 */
export class PlayerKit {
  readonly profile = new Relay<PlayerProfile>();
  readonly inventory = new Relay<InventoryView>();
  readonly wallet = new Relay<WalletView>();
  readonly progress = new Relay<ProgressView>();
  private parts: Promise<Parts> | null = null;
  private rulesRead: Promise<PlayerRules> | null = null;
  private readonly events = new Set<(e: PlayerEvent) => void>();

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType = 'player',
    private readonly playerKey?: string,
  ) {}

  /** The hub's key: the player's id. */
  async key(): Promise<string> {
    const key = this.playerKey ?? (await this.runtime.playerId());
    if (key === null || key === undefined) {
      throw new CrowdyError({ message: 'the kit does not know which player it is: pass playerId to client.kit()' });
    }
    return key;
  }

  private ready(): Promise<Parts> {
    this.parts ??= (async () => {
      const key = await this.key();
      const read =
        <T>(method: string) =>
        () =>
          this.runtime.call<T>(this.nodeType, key, method);
      const source = { nodeType: this.nodeType, key, topic: TOPIC };
      const parts: Parts = {
        key,
        profile: new HubState<PlayerProfile>(this.runtime, this.nodeType, key, TOPIC),
        inventory: new PrivateState(this.runtime, { ...source, what: 'inventory', read: read<InventoryView>('inventory') }),
        wallet: new PrivateState(this.runtime, { ...source, what: 'wallet', read: read<WalletView>('wallet') }),
        progress: new PrivateState(this.runtime, { ...source, what: 'progress', read: read<ProgressView>('progress') }),
      };
      this.profile.attach(parts.profile);
      this.inventory.attach(parts.inventory);
      this.wallet.attach(parts.wallet);
      this.progress.attach(parts.progress);
      parts.profile.onEvent((body) => {
        for (const l of [...this.events]) l(body as PlayerEvent);
      });
      return parts;
    })().catch((e) => {
      this.parts = null;
      throw e;
    });
    return this.parts;
  }

  /** Mirrors the profile and reads what only the player reads (all of it, or the parts named). */
  async watch(...which: Array<'profile' | 'inventory' | 'wallet' | 'progress'>): Promise<void> {
    const parts = await this.ready();
    const all = which.length ? which : (['profile', 'inventory', 'wallet', 'progress'] as const);
    await Promise.all(all.map((w) => parts[w].start()));
  }

  async unwatch(): Promise<void> {
    if (!this.parts) return;
    const parts = await this.parts;
    await Promise.all([parts.profile.stop(), parts.inventory.stop(), parts.wallet.stop(), parts.progress.stop()]);
  }

  /** Levels gained and achievements unlocked, as the `player` topic announces them. */
  onEvent(listener: (e: PlayerEvent) => void): () => void {
    this.events.add(listener);
    return () => this.events.delete(listener);
  }

  /** Calls the player's hub; a change carries an action id. */
  async call<T>(method: string, args?: unknown, change = true): Promise<T> {
    return this.runtime.call<T>(this.nodeType, await this.key(), method, args ?? null, change ? { action: true } : {});
  }

  /** Everything the hub keeps for the player. */
  me(): Promise<PlayerView> {
    return this.call<PlayerView>('me', null, false);
  }

  /** The game's items, recipes, loot tables, quests and achievements (read once). */
  rules(): Promise<PlayerRules> {
    this.rulesRead ??= this.call<PlayerRules>('rules', null, false).catch((e) => {
      this.rulesRead = null;
      throw e;
    });
    return this.rulesRead;
  }

  /** Another player's public profile. */
  profileOf(player: number | string): Promise<PlayerProfile> {
    return this.runtime.call<PlayerProfile>(this.nodeType, String(player), 'profile');
  }
}

/** The player's items: stacks in slots, and mail for what did not fit. */
export class InventoryKit {
  constructor(private readonly player: PlayerKit) {}

  get items(): KitStore<InventoryView | undefined> {
    return this.player.inventory;
  }

  async watch(): Promise<InventoryView | undefined> {
    await this.player.watch('inventory');
    return this.player.inventory.get();
  }

  /** How many of `item` the player has, as last read. */
  count(item: string): number {
    return (this.player.inventory.get()?.stacks ?? []).filter((s) => s.item === item).reduce((n, s) => n + s.count, 0);
  }

  /** @throws {KitError} `insufficient`. */
  discard(item: string, count: number): Promise<boolean> {
    return this.player.call<boolean>('discard', { item, count });
  }

  /** Moves what fits from the mail into the inventory; resolves with what moved. */
  takeMail(): Promise<EconBundle> {
    return this.player.call<EconBundle>('take_mail');
  }
}

/** The player's soft currencies. */
export class WalletKit {
  constructor(private readonly player: PlayerKit) {}

  get balances(): KitStore<WalletView | undefined> {
    return this.player.wallet;
  }

  async watch(): Promise<WalletView | undefined> {
    await this.player.watch('wallet');
    return this.player.wallet.get();
  }

  /** The balance of `currency`, as last read. */
  balance(currency: string): number {
    return this.player.wallet.get()?.balances[currency] ?? 0;
  }
}

/** Experience and levels, and the public profile. */
export class ProgressionKit {
  constructor(private readonly player: PlayerKit) {}

  get progress(): KitStore<ProgressView | undefined> {
    return this.player.progress;
  }

  get profile(): KitStore<PlayerProfile | undefined> {
    return this.player.profile;
  }

  async watch(): Promise<ProgressView | undefined> {
    await this.player.watch('profile', 'progress');
    return this.player.progress.get();
  }

  /** Another player's public profile. */
  profileOf(player: number | string): Promise<PlayerProfile> {
    return this.player.profileOf(player);
  }

  /** Called with each level the player reaches. */
  onLevel(listener: (level: number) => void): () => void {
    return this.player.onEvent((e) => e.type === 'level' && listener(e.level));
  }
}

/** Achievements: counts of what the player did, unlocked once. */
export class AchievementsKit {
  constructor(private readonly player: PlayerKit) {}

  async watch(): Promise<AchievementView[]> {
    await this.player.watch('profile', 'progress');
    return this.list();
  }

  /** The achievements with their counts, as last read (hidden ones once unlocked). */
  list(): AchievementView[] {
    return this.player.progress.get()?.achievements ?? [];
  }

  /** Called with each achievement the player unlocks. */
  onUnlock(listener: (achievement: string) => void): () => void {
    return this.player.onEvent((e) => e.type === 'achievement' && listener(e.achievement));
  }
}

/** Quests, first-session tutorials among them. */
export class QuestsKit {
  constructor(private readonly player: PlayerKit) {}

  async watch(): Promise<QuestView[]> {
    await this.player.watch('progress');
    return this.list();
  }

  list(): QuestView[] {
    return this.player.progress.get()?.quests ?? [];
  }

  /** @throws {KitError} `conflict` (taken, done, or another first), `forbidden` (level), `not_found`. */
  accept(quest: string): Promise<boolean> {
    return this.player.call<boolean>('accept', { quest });
  }

  /** Claims a complete quest's reward. @throws {KitError} `not_ready`, `full`. */
  claim(quest: string): Promise<EconBundle> {
    return this.player.call<EconBundle>('claim', { quest });
  }

  /**
   * Reports one of the counters the game lets a client report (a tutorial step).
   * @throws {KitError} `forbidden` for a counter the game's hubs count.
   */
  step(counter: string): Promise<PlayerEarned> {
    return this.player.call<PlayerEarned>('step', { counter });
  }
}

/** Crafting from the game's recipes. */
export class CraftingKit {
  constructor(private readonly player: PlayerKit) {}

  async recipes(): Promise<EconRecipe[]> {
    return (await this.player.rules()).recipes;
  }

  /** Crafts `times` (once by default). @throws {KitError} `insufficient`, `full`, `forbidden` (level), `not_found`. */
  craft(recipe: string, times?: number): Promise<{ made: EconBundle; earned: PlayerEarned }> {
    return this.player.call('craft', times === undefined ? { recipe } : { recipe, times });
  }
}

/** Loot tables with pity. */
export class LootKit {
  constructor(private readonly player: PlayerKit) {}

  async tables(): Promise<LootTableView[]> {
    return (await this.player.rules()).loot;
  }

  /** Pays the table's cost and rolls once. @throws {KitError} `insufficient`, `full`, `not_found`. */
  open(table: string): Promise<{ roll: LootRoll; earned: PlayerEarned }> {
    return this.player.call('open', { table });
  }
}

/** Idle production that catches up on the time away. */
export class ProductionKit {
  constructor(private readonly player: PlayerKit) {}

  async view(): Promise<ProductionView> {
    return (await this.player.me()).production;
  }

  /** Moves what the producers made into the inventory, as far as it fits. */
  collect(): Promise<EconBundle> {
    return this.player.call<EconBundle>('collect');
  }
}
