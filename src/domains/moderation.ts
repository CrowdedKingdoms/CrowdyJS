import type { GraphQLClient } from '../client.js';
import {
  SafetyReportsDocument,
  ResolveSafetyReportDocument,
  EscalateSafetyReportDocument,
  type SafetyReportStatus,
  type SafetyReportsQuery,
} from '../generated/graphql.js';

/** Where a safety report stands: waiting, closed with an outcome, or sent to the CyberTipline. */
export type SafetyReportStatusValue = 'OPEN' | 'RESOLVED' | 'ESCALATED';

/** A safety report as a moderator reads it ({@link ModerationAPI.reports}). */
export type SafetyReportRecord = SafetyReportsQuery['safetyReports'][number];

/**
 * An app's safety reports, for its moderators — exposed as `client.moderation` (and
 * `client.admin.moderation`; ck-api v2.60.0).
 *
 * Players file reports with `client.safety.fileReport`. Each one links both players'
 * recorded sessions around it, and the platform preserves those with both identities while
 * the report is open. A moderator reads the reports, reads the sessions a report covers, and
 * decides it: {@link resolveReport} closes it and deletes the preserved copy;
 * {@link escalateReport} records a CyberTipline submission and keeps the copy for a year.
 *
 * **Who.** Every call needs `moderate_safety` on the app: an organization role that grants it,
 * or an admin of the app's organization. Send the moderator's identity session (not an app
 * token) to the app's datacenter (`apps.routeFor`, or `discovery`).
 *
 * **Reading a reported session.** `SafetyReport.sessions` names the recorded sessions
 * (`InputLogSession.gameTokenId`) the report covers. A moderator mints an app token for the
 * app (`portal.mintAppToken`) and reads them with `client.inputLog.messages(appId,
 * gameTokenId)` on the app's client while the report is open or escalated; every read is
 * audited.
 */
export class ModerationAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * The app's reports, newest first, with open `CHILD_SAFETY` reports ahead of the rest.
   * `status` keeps one kind; `first` defaults to 50 (1 to 200).
   */
  async reports(
    appId: string,
    options: { status?: SafetyReportStatusValue; first?: number } = {},
  ): Promise<SafetyReportRecord[]> {
    const data = await this.api.request(SafetyReportsDocument, {
      appId,
      ...(options.status !== undefined
        ? { status: options.status as SafetyReportStatus }
        : {}),
      ...(options.first !== undefined ? { first: options.first } : {}),
    });
    return data.safetyReports;
  }

  /**
   * Resolve an open report with its outcome (at most 1,000 characters): its preserved copy is
   * deleted, and a legal hold its reported account got on deletion is released. Resolving it
   * again changes nothing; an escalated report cannot be resolved (`BAD_REQUEST`).
   */
  async resolveReport(
    appId: string,
    reportId: string,
    outcome: string,
  ): Promise<SafetyReportRecord> {
    const data = await this.api.request(ResolveSafetyReportDocument, {
      appId,
      reportId,
      outcome,
    });
    return data.resolveSafetyReport;
  }

  /**
   * Record that an open report was submitted to NCMEC's CyberTipline, under the id NCMEC
   * gave the submission: its preserved copy is kept under retention for a year from now, and
   * the reported account's legal hold, if any, as long. Again under the same id changes
   * nothing; under another id is `CONFLICT`; a resolved report cannot be escalated
   * (`BAD_REQUEST`).
   */
  async escalateReport(
    appId: string,
    reportId: string,
    ncmecReportId: string,
  ): Promise<SafetyReportRecord> {
    const data = await this.api.request(EscalateSafetyReportDocument, {
      appId,
      reportId,
      ncmecReportId,
    });
    return data.escalateSafetyReport;
  }
}
