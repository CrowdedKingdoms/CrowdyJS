import { CollectionMirror } from '../mirror.js';
import { shardKey, type KitContainer } from '../protocol.js';
import type { KitRuntime } from '../runtime.js';

/** A pet as its owner reads it: the public view and its bond. */
export interface KitPetView {
  id: number;
  species: string;
  name: string;
  x: number;
  z: number;
  /** `follow` while summoned, else `stay`. */
  mode: string;
  bond: number;
}

/** Where the area hubs are: type `npcs`, keyed by area centre chunk, in the starter pack. */
export interface NpcsKitOptions {
  nodeType?: string;
  /** An area's size in chunks, for {@link NpcsKit.areaAt}. Default 8. */
  areaSize?: number;
}

/**
 * The world's areas of mobs, NPCs and pets (the `npc-mobs` starter): one hub per area,
 * keyed by its centre chunk, so a client finds the hub for where it stands
 * ({@link areaAt}) without asking.
 */
export class NpcsKit {
  private readonly areas = new Map<string, NpcArea>();
  private readonly nodeType: string;
  private readonly size: number;

  constructor(
    private readonly runtime: KitRuntime,
    options: NpcsKitOptions = {},
  ) {
    this.nodeType = options.nodeType ?? 'npcs';
    this.size = Math.max(1, options.areaSize ?? 8);
  }

  /** The key of the area holding chunk `(chunkX, chunkZ)`. */
  keyAt(chunkX: number, chunkZ: number): string {
    return shardKey(chunkX, chunkZ, this.size);
  }

  /** The area holding chunk `(chunkX, chunkZ)`. */
  areaAt(chunkX: number, chunkZ: number): NpcArea {
    return this.area(this.keyAt(chunkX, chunkZ));
  }

  /** The area with key `key` (`"<x>,<z>"`, its centre chunk). */
  area(key: string): NpcArea {
    let a = this.areas.get(key);
    if (!a) {
      a = new NpcArea(this.runtime, this.nodeType, key);
      this.areas.set(key, a);
    }
    return a;
  }
}

/**
 * One area: its mobs, NPCs and pets mirrored from the `area` topic ({@link members}), hits
 * on mobs (the hub decides reach, cooldown and damage), NPC talk, and the player's pets.
 * The hub also shows its actors through the realtime tier (`kitActorCodec`).
 */
export class NpcArea {
  /** The `area` topic: every member's public properties, by id. */
  readonly members: CollectionMirror;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.members = new CollectionMirror(runtime, nodeType, key, 'area');
  }

  /** Mirrors the area. */
  async watch(): Promise<void> {
    await this.members.start();
  }

  unwatch(): Promise<void> {
    return this.members.stop();
  }

  mobs(): KitContainer[] {
    return this.members.list('Mob');
  }

  npcs(): KitContainer[] {
    return this.members.list('Npc');
  }

  pets(): KitContainer[] {
    return this.members.list('Pet');
  }

  /**
   * Hits mob `mob`; resolves with its hp after the hit.
   * @throws {KitError} `not_in_area`, `out_of_reach`, `cooldown`, `down`, `not_found`.
   */
  attack(mob: number): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.key, 'attack', { mob }, { action: true });
  }

  /** What NPC `npc` says, with its public properties. */
  talk(npc: number): Promise<Record<string, unknown>> {
    return this.runtime.call<Record<string, unknown>>(this.nodeType, this.key, 'talk', { npc });
  }

  /**
   * Adopts a pet where the player stands; resolves with its id.
   * @throws {KitError} `not_in_area`, `limit` (pets a player), `full`, `bad_request`.
   */
  adopt(species: string, name: string): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.key, 'adopt', { species, name }, { action: true });
  }

  rename(pet: number, name: string): Promise<boolean> {
    return this.pet('rename', pet, name);
  }

  /** The pet follows its owner (and its bond grows). */
  summon(pet: number): Promise<boolean> {
    return this.pet('summon', pet);
  }

  /** The pet stays where it is. */
  dismiss(pet: number): Promise<boolean> {
    return this.pet('dismiss', pet);
  }

  /** The pet is gone. */
  release(pet: number): Promise<boolean> {
    return this.pet('release', pet);
  }

  /** The player's pets in this area, with their bond. */
  myPets(): Promise<KitPetView[]> {
    return this.runtime.call<KitPetView[]>(this.nodeType, this.key, 'pets');
  }

  private pet(method: string, pet: number, name?: string): Promise<boolean> {
    const args = name === undefined ? { pet } : { pet, name };
    return this.runtime.call<boolean>(this.nodeType, this.key, method, args, { action: true });
  }
}
