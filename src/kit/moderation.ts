import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars } from '../generated/graphql.js';
import { moderationNames, type ModerationNames } from './blueprints/moderation.js';
import { kitContainerProperties, kitInvoke } from './shared.js';

/** Options for {@link ModerationKit}. */
export interface ModerationKitOptions {
  /** The `typePrefix` the moderation blueprint was deployed with. */
  typePrefix?: string;
}

/** A parsed report row. */
export interface KitModReport {
  containerId: string;
  reporterUserId: string;
  subjectUserId: string;
  reason: string;
  detail: string;
  status: string;
  resolution: string;
  filedAtMs: number;
}

/**
 * Runtime helpers for the moderation blueprint: file reports, read the
 * admin escalation queue, resolve reports, and manage the caller's personal
 * mute list (client-enforced chat filtering). Enforcement stays on platform
 * surfaces — tier revocation and grid permissions.
 *
 * Obtained via `client.kit(appId).moderation`.
 */
export class ModerationKit {
  private readonly names: ModerationNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: ModerationKitOptions = {},
  ) {
    this.names = moderationNames(options.typePrefix ?? '');
  }

  /** File a report (creates the caller's report row in the queue). */
  async report(input: {
    reporterUserId: string;
    subjectUserId: string;
    reason: string;
    detail?: string;
  }) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.reportType,
      displayName: `report ${input.reason} vs ${input.subjectUserId}`,
      properties: [
        { key: 'reporter_user_id', valueType: 'string', valueJson: JSON.stringify(input.reporterUserId) },
        { key: 'subject_user_id', valueType: 'string', valueJson: JSON.stringify(input.subjectUserId) },
        { key: 'reason', valueType: 'string', valueJson: JSON.stringify(input.reason) },
        { key: 'detail', valueType: 'string', valueJson: JSON.stringify((input.detail ?? '').slice(0, 500)) },
        { key: 'filed_at_ms', valueType: 'int', valueJson: String(Date.now()) },
      ],
    });
  }

  /** The escalation queue (admins; filter by status, default `'open'`). */
  async queue(status = 'open'): Promise<KitModReport[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.reportType,
    });
    const rows = await Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(this.gameModel, String(this.appId), c.containerId);
        return {
          containerId: c.containerId,
          reporterUserId: String(props.reporter_user_id ?? ''),
          subjectUserId: String(props.subject_user_id ?? ''),
          reason: String(props.reason ?? ''),
          detail: String(props.detail ?? ''),
          status: String(props.status ?? 'open'),
          resolution: String(props.resolution ?? ''),
          filedAtMs: Number(props.filed_at_ms ?? 0),
        };
      }),
    );
    return rows
      .filter((r) => !status || r.status === status)
      .sort((a, b) => a.filedAtMs - b.filedAtMs);
  }

  /** ADMIN — resolve a report with a disposition. */
  async resolve(reportContainerId: string, status: 'actioned' | 'dismissed', resolution: string) {
    return kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.resolveReportFn,
      selfContainerId: reportContainerId,
      params: { status, resolution },
    });
  }

  /** Mute a player (adds to YOUR client-enforced mute list). */
  async mute(ownerUserId: string, mutedUserId: string) {
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.muteType,
      displayName: `mute ${mutedUserId}`,
      properties: [
        { key: 'owner_user_id', valueType: 'string', valueJson: JSON.stringify(ownerUserId) },
        { key: 'muted_user_id', valueType: 'string', valueJson: JSON.stringify(mutedUserId) },
      ],
    });
  }

  /** Unmute: delete the matching mute row. */
  async unmute(ownerUserId: string, mutedUserId: string): Promise<boolean> {
    const mutes = await this.mutes(ownerUserId);
    const row = mutes.find((m) => m.mutedUserId === mutedUserId);
    if (!row) return false;
    await this.gameModel.deleteContainer({ appId: this.appId, containerId: row.containerId });
    return true;
  }

  /** The caller's mute list (feed it to your chat renderer). */
  async mutes(ownerUserId: string): Promise<Array<{ containerId: string; mutedUserId: string }>> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.muteType,
    });
    const rows = await Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(this.gameModel, String(this.appId), c.containerId);
        return {
          containerId: c.containerId,
          ownerUserId: String(props.owner_user_id ?? ''),
          mutedUserId: String(props.muted_user_id ?? ''),
        };
      }),
    );
    return rows
      .filter((r) => r.ownerUserId === String(ownerUserId))
      .map(({ containerId, mutedUserId }) => ({ containerId, mutedUserId }));
  }
}
