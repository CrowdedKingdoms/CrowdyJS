import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import { lockNames, type LockNames } from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link ObjectsKit}. Must match the deployed lock blueprint. */
export interface ObjectsKitOptions {
  /** The `objectTypeName` the lock blueprint was deployed with. Defaults to `'Lockable'`. */
  objectTypeName?: string;
  /** The `keyTypeName` the lock blueprint was deployed with. */
  keyTypeName?: string;
}

/**
 * Runtime helpers for the {@link lockBlueprint} conventions: instantiate
 * lockable world objects, grant key items, and operate the objects through
 * their authority-gated `open`/`close` functions. Authorization is decided
 * entirely server-side; a denied attempt resolves with `success: false`.
 *
 * Obtained via `client.kit(appId).objects` (or `client.kit(appId)
 * .objectsFor('Door')` for a non-default type name).
 */
export class ObjectsKit {
  private readonly names: LockNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: ObjectsKitOptions = {},
  ) {
    this.names = lockNames(options.objectTypeName, options.keyTypeName);
  }

  /**
   * Instantiate a lockable object (admin/studio call — the type is
   * admin-instantiable). For key-gated objects set `requiredKeyId` to the key
   * id that opens it; for owner-gated objects set `ownerUserId`; for
   * chunk-permission-gated objects set `chunk` to where the object stands
   * (feeds the `has_chunk_permission` policy).
   */
  async create(input: {
    displayName: string;
    requiredKeyId?: string;
    ownerUserId?: Scalars['BigInt']['input'];
    /** The chunk the object occupies (chunkPermission authority). */
    chunk?: { x: number; y: number; z: number };
    properties?: SeedPropertyInput[];
    sessionId?: string;
  }) {
    const properties: SeedPropertyInput[] = [
      { key: 'is_open', valueType: 'bool', valueJson: 'false' },
      ...(input.requiredKeyId !== undefined
        ? [
            {
              key: 'required_key_id',
              valueType: 'string',
              valueJson: JSON.stringify(input.requiredKeyId),
            },
          ]
        : []),
      ...(input.chunk
        ? [
            { key: 'cx', valueType: 'int', valueJson: String(input.chunk.x) },
            { key: 'cy', valueType: 'int', valueJson: String(input.chunk.y) },
            { key: 'cz', valueType: 'int', valueJson: String(input.chunk.z) },
          ]
        : []),
      ...(input.properties ?? []),
    ];
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.objectType,
      displayName: input.displayName,
      ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      properties,
    });
  }

  /**
   * Grant a player a key item (admin/studio call). Creates a key container
   * owned by the player, with the owner mirrored into the `owner_user_id`
   * property that the key condition policy reads.
   */
  async grantKey(input: {
    keyId: string;
    toUserId: Scalars['BigInt']['input'];
    displayName?: string;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.keyType,
      displayName: input.displayName ?? `Key ${input.keyId}`,
      ownerUserId: input.toUserId,
      properties: [
        { key: 'key_id', valueType: 'string', valueJson: JSON.stringify(input.keyId) },
        {
          key: 'owner_user_id',
          valueType: 'int',
          valueJson: String(input.toUserId),
        },
      ],
    });
  }

  /** List the key items a player holds. */
  async keysOf(userId: Scalars['BigInt']['input']) {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.keyType,
    });
    return containers.filter(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(userId),
    );
  }

  /**
   * Try to open an object. Pass `keyId` (the **container id** of a key the
   * caller holds) when the object is key-gated; owner/grid/group authorities
   * need no params. A denial is not an exception — check `success`.
   */
  async open(
    objectId: string,
    options: { keyId?: string } = {},
  ): Promise<KitInvokeResult<boolean>> {
    return kitInvoke<boolean>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.openFn,
      selfContainerId: objectId,
      params: options.keyId !== undefined ? { key_id: options.keyId } : {},
    });
  }

  /** Try to close an object; same authority as {@link open}. */
  async close(
    objectId: string,
    options: { keyId?: string } = {},
  ): Promise<KitInvokeResult<boolean>> {
    return kitInvoke<boolean>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.closeFn,
      selfContainerId: objectId,
      params: options.keyId !== undefined ? { key_id: options.keyId } : {},
    });
  }

  /** Read whether an object is currently open. */
  async isOpen(objectId: string): Promise<boolean> {
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      objectId,
    );
    return props.is_open === true;
  }

  /** List all objects of this lockable type. */
  async list(options: { sessionId?: string } = {}) {
    return this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.objectType,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
  }
}
