import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';
import { kitContainerProperties } from './shared.js';

/** Options for {@link PetsKit}. Must match the deployed npc engine. */
export interface PetsKitOptions {
  /** The compute module serving summon/dismiss/rename. Defaults to `'npc-engine'`. */
  moduleName?: string;
  /** The pet container type. Defaults to `'Pet'`. */
  typeName?: string;
}

/** A parsed pet container. */
export interface KitPet {
  containerId: string;
  displayName: string;
  species: string;
  name: string;
  ownerUserId: string | null;
  bond: number;
  active: boolean;
  actorUuid: string;
  x: number;
  y: number;
  z: number;
  properties: Record<string, unknown>;
}

/** An engine verdict for a pet invoke. */
export interface KitPetResult {
  success: boolean;
  reason?: string;
}

/**
 * Runtime helpers for engine-driven pets (the Wave 1 npc-engine template):
 * `Pet` containers hold species/name/owner/bond; the engine walks active
 * pets after their owner (kit-ai `follow_owner`) and streams FLAG_NPC actor
 * poses with the pet's container id as the payload suffix — decode the lane
 * with `kit/wire` and match `pose.suffix` to the container id.
 *
 * Obtained via `client.kit(appId).pets`.
 */
export class PetsKit {
  private readonly moduleName: string;
  private readonly typeName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly engines: EngineDetector,
    options: PetsKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'npc-engine';
    this.typeName = options.typeName ?? 'Pet';
  }

  /** Is the pet-driving npc engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /**
   * Adopt a pet: creates the caller-owned Pet container (active). Member
   * instantiation defaults the owner to the caller; admin tokens must pass
   * `ownerUserId` explicitly (the engine validates ownership on every
   * summon/dismiss/rename).
   */
  async adopt(input: {
    species: string;
    name: string;
    ownerUserId?: Scalars['BigInt']['input'];
    position?: { x: number; y: number; z: number };
    properties?: SeedPropertyInput[];
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.typeName,
      displayName: input.name,
      ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
      properties: [
        { key: 'species', valueType: 'string', valueJson: JSON.stringify(input.species) },
        { key: 'name', valueType: 'string', valueJson: JSON.stringify(input.name) },
        { key: 'bond', valueType: 'int', valueJson: '0' },
        { key: 'active', valueType: 'string', valueJson: '"true"' },
        ...(input.position
          ? [
              { key: 'x', valueType: 'int', valueJson: String(Math.round(input.position.x)) },
              { key: 'y', valueType: 'int', valueJson: String(Math.round(input.position.y)) },
              { key: 'z', valueType: 'int', valueJson: String(Math.round(input.position.z)) },
            ]
          : []),
        ...(input.properties ?? []),
      ],
    });
  }

  /** List pets (all, or one owner's with `ownerUserId`). */
  async list(ownerUserId?: Scalars['BigInt']['input']): Promise<KitPet[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.typeName,
    });
    const filtered =
      ownerUserId === undefined
        ? containers
        : containers.filter(
            (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
          );
    return Promise.all(
      filtered.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          species: String(props.species ?? ''),
          name: String(props.name ?? c.displayName),
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          bond: Number(props.bond ?? 0),
          active: props.active !== 'false' && props.active !== false,
          actorUuid: String(props.actor_uuid ?? ''),
          x: Number(props.x ?? 0),
          y: Number(props.y ?? 0),
          z: Number(props.z ?? 0),
          properties: props,
        };
      }),
    );
  }

  /** Summon your pet: it starts following you (owner-validated engine-side). */
  async summon(containerId: string): Promise<KitPetResult> {
    const result = await this.engines.invoke(this.moduleName, 'summon', { containerId });
    return { success: result.success, reason: result.reason };
  }

  /** Dismiss your pet: it stops simulating until summoned again. */
  async dismiss(containerId: string): Promise<KitPetResult> {
    const result = await this.engines.invoke(this.moduleName, 'dismiss', { containerId });
    return { success: result.success, reason: result.reason };
  }

  /** Rename your pet (1-32 chars; owner-validated engine-side). */
  async rename(containerId: string, name: string): Promise<KitPetResult> {
    const result = await this.engines.invoke(this.moduleName, 'rename_pet', {
      containerId,
      name,
    });
    return { success: result.success, reason: result.reason };
  }
}
