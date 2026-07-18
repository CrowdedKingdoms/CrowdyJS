import type { GameAppsAPI } from '../domains/gameApps.js';
import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import { plotNames, type PlotNames } from './blueprints.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link PlotsKit}. Must match the deployed plot blueprint. */
export interface PlotsKitOptions {
  /** The `typeName` the plot blueprint was deployed with. Defaults to `'Plot'`. */
  typeName?: string;
}

/** A parsed view of one plot. */
export interface KitPlot {
  containerId: string;
  displayName: string;
  gridId: number;
  price: number;
  /** 0 when unowned. */
  ownerUserId: number;
  rentPrice?: number;
  rentTtlSeconds?: number;
}

/**
 * Runtime helpers for the {@link plotBlueprint} conventions: list/create
 * plots and drive the buy/rent/evict functions whose permission effects grant
 * or revoke real, replication-enforced grid permissions transactionally with
 * the currency mutation. Authorization (wallet ownership, price, plot
 * ownership) is enforced server-side — a denial resolves with
 * `success: false`, never an exception.
 *
 * Obtained via `client.kit(appId).plots`.
 */
export class PlotsKit {
  private readonly names: PlotNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly gameApps: GameAppsAPI,
    options: PlotsKitOptions = {},
  ) {
    this.names = plotNames(options.typeName);
  }

  /**
   * Instantiate a plot over an existing grid (admin — the type is
   * admin-instantiable). Create the grid first (`client.gameApps.createGrid`)
   * and pass its id here.
   */
  async create(input: {
    displayName: string;
    gridId: Scalars['BigInt']['input'];
    price: number;
    rentPrice?: number;
    rentTtlSeconds?: number;
    properties?: SeedPropertyInput[];
  }) {
    const properties: SeedPropertyInput[] = [
      { key: 'grid_id', valueType: 'int', valueJson: String(input.gridId) },
      { key: 'price', valueType: 'int', valueJson: String(input.price) },
      ...(input.rentPrice !== undefined
        ? [{ key: 'rent_price', valueType: 'int', valueJson: String(input.rentPrice) }]
        : []),
      ...(input.rentTtlSeconds !== undefined
        ? [
            {
              key: 'rent_ttl_seconds',
              valueType: 'int',
              valueJson: String(input.rentTtlSeconds),
            },
          ]
        : []),
      ...(input.properties ?? []),
    ];
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.plotType,
      displayName: input.displayName,
      properties,
    });
  }

  /** List plots with parsed state (grid, price, current owner). */
  async list(): Promise<KitPlot[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.plotType,
    });
    return Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          gridId: Number(props.grid_id ?? 0),
          price: Number(props.price ?? 0),
          ownerUserId: Number(props.owner_user_id ?? 0),
          ...(props.rent_price !== undefined ? { rentPrice: Number(props.rent_price) } : {}),
          ...(props.rent_ttl_seconds !== undefined
            ? { rentTtlSeconds: Number(props.rent_ttl_seconds) }
            : {}),
        };
      }),
    );
  }

  /**
   * Buy a plot: spends the price from the caller's wallet AND grants the
   * blueprint's grid permissions in one transaction. Resolves with the
   * wallet's remaining balance.
   */
  async buy(plotId: string, walletId: string): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.buyFn,
      selfContainerId: plotId,
      params: { wallet_id: walletId },
    });
  }

  /**
   * Rent a plot (blueprint deployed with `rentable: true`): like {@link buy}
   * but the grant expires after the plot's `rent_ttl_seconds`.
   */
  async rent(plotId: string, walletId: string): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.rentFn,
      selfContainerId: plotId,
      params: { wallet_id: walletId },
    });
  }

  /** Revoke a user's permissions on a plot (plot owner or app admin). */
  async evict(plotId: string, targetUserId: Scalars['BigInt']['input']): Promise<KitInvokeResult> {
    return kitInvoke(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.evictFn,
      selfContainerId: plotId,
      params: { target_user_id: Number(targetUserId) },
    });
  }

  /**
   * A user's effective permission keys on a plot's grid (for HUD display —
   * enforcement happens server-side regardless).
   */
  async accessOf(
    userId: Scalars['BigInt']['input'],
    gridId: Scalars['BigInt']['input'],
  ): Promise<string[]> {
    const res = await this.gameApps.userPermissions(
      String(this.appId),
      String(gridId),
      String(userId),
    );
    return [...res.permissionKeys];
  }
}
