import type { GraphQLClient } from '../client.js';
import {
  MyCommSettingsDocument,
  SetMyCommSettingsDocument,
  RequestParentalConsentDocument,
  MyContactsDocument,
  ContactRequestsDocument,
  RequestContactDocument,
  AcceptContactDocument,
  RemoveContactDocument,
  MyBlocksDocument,
  BlockPlayerDocument,
  UnblockPlayerDocument,
  FileSafetyReportDocument,
  type CommScope,
  type ParentalConsentFeature,
  type SafetyReportReason,
  type MyCommSettingsQuery,
  type RequestParentalConsentMutation,
  type MyContactsQuery,
  type ContactRequestsQuery,
  type MyBlocksQuery,
  type FileSafetyReportMutation,
} from '../generated/graphql.js';

/**
 * Who a medium reaches (send) or is heard from (receive): `OFF` nobody, `CONTACTS` only the
 * player's accepted contacts in the app, `EVERYONE` anyone the app's own rules allow.
 */
export type CommScopeValue = 'OFF' | 'CONTACTS' | 'EVERYONE';

/** What a parent consents to for a player under 18: voice (with channel audio) or webcam video. */
export type ParentalConsentFeatureValue = 'VOICE' | 'VIDEO';

/** Why a player is reported. `CHILD_SAFETY` reports come first in the moderation queue. */
export type SafetyReportReasonValue =
  | 'CHILD_SAFETY'
  | 'HARASSMENT'
  | 'SEXUAL_CONTENT'
  | 'HATE'
  | 'SELF_HARM'
  | 'CHEATING'
  | 'OTHER';

/** The player's choices for {@link SafetyAPI.setCommSettings}; a field left out keeps its choice. */
export interface CommChoicesInput {
  /** Whom the player's voice may reach. */
  voiceSend?: CommScopeValue;
  /** Whose voice the player may hear. */
  voiceReceive?: CommScopeValue;
  /** Whom the player's video may reach. */
  videoSend?: CommScopeValue;
  /** Whose video the player may see. */
  videoReceive?: CommScopeValue;
}

/** A report for {@link SafetyAPI.fileReport}. */
export interface SafetyReportFiling {
  /** The app both players are in. */
  appId: string;
  /** The player reported (`BigInt` as a decimal string). */
  reportedUserId: string;
  /**
   * The reported player's actor, when the client knows it: the 32 hex digits the realtime
   * wire uses (as `generateCrowdyUuid` makes them). Leave it out otherwise; any other form is
   * refused with `BAD_USER_INPUT`.
   */
  reportedActorUuid?: string;
  reason: SafetyReportReasonValue;
  /** What happened, in the reporter's words: at most 1,000 characters. */
  details?: string;
  /**
   * When it happened, within the past year (an ISO-8601 string or a `Date`). The report
   * covers both players' recorded sessions from 15 minutes before it to the filing.
   */
  occurredAt: string | Date;
}

/** {@link SafetyAPI.commSettings}: the effective scopes, the player's choices and the caps. */
export type PlayerCommSettings = MyCommSettingsQuery['myCommSettings'];
/** One accepted contact ({@link SafetyAPI.contacts}) or a request's answer. */
export type PlayerContactRecord = MyContactsQuery['myContacts'][number];
/** A contact request waiting for an answer ({@link SafetyAPI.contactRequests}). */
export type ContactRequestRecord = ContactRequestsQuery['contactRequests'][number];
/** A player the caller blocked ({@link SafetyAPI.blocks}). */
export type PlayerBlockRecord = MyBlocksQuery['myBlocks'][number];
/** {@link SafetyAPI.requestParentalConsent}'s answer. */
export type ParentalConsentRequestResult = RequestParentalConsentMutation['requestParentalConsent'];
/** {@link SafetyAPI.fileReport}'s receipt. */
export type SafetyReportReceiptRecord = FileSafetyReportMutation['fileSafetyReport'];

/**
 * A player's own safety and communication controls in one app — exposed as `client.safety`
 * (ck-api v2.60.0, the teen safety program).
 *
 * **Game plane.** Every call takes the app-scoped token for `appId` on the client built for
 * the app (`portal.signIn`, `portal.mintAppToken`, or a managed player's token), as gameplay
 * does; an identity session token is refused.
 *
 * What it controls, all enforced by the platform rather than by your client:
 *
 *   - **Voice and video scopes** ({@link commSettings}, {@link setCommSettings}): for each of
 *     voice and video, whom the player sends to and hears from: `OFF`, `CONTACTS` or
 *     `EVERYONE`. The realtime servers enforce the EFFECTIVE scopes on both sides. A player
 *     can only ever lower them below what policy allows: an adult may choose anything
 *     (`EVERYONE` by default); a player under 18 has each medium `OFF` until a parent consents
 *     ({@link requestParentalConsent}) and then at most `CONTACTS`.
 *   - **Contacts** ({@link contacts}, {@link contactRequests}, {@link requestContact},
 *     {@link acceptContact}, {@link removeContact}): a mutual list per app. It is what a
 *     `CONTACTS` scope admits.
 *   - **Blocks** ({@link blocks}, {@link block}, {@link unblock}): nothing of any kind (voice,
 *     video, text, direct messages) passes between two players while either has blocked the
 *     other, both ways, and the blocked player is not told.
 *   - **Reports** ({@link fileReport}): the app's moderators read them (`client.moderation`).
 *
 * Every change that affects what reaches the player (scopes, contacts, blocks, a parent's
 * consent) reaches its live sessions within a second. Ids are `BigInt` decimal strings.
 * `SOCIAL_LIMIT_REACHED` ({@link socialLimitReachedOf}) refuses a request past the limits
 * (100 waiting requests, 1,000 contacts and 1,000 blocks per app); `NOT_FOUND` names a player
 * the app does not know.
 *
 * Show the player the notice and the recording indicator the app's safety log needs
 * (`apps.recording(appId)`): what a player says and sends may be recorded for moderators.
 */
export class SafetyAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * The player's voice and video settings in the app: the effective scopes (`voiceSend`,
   * `voiceReceive`, `videoSend`, `videoReceive`), what the player picked (`choices`, null
   * where it kept the default), what policy allows now (`voiceAllowed`, `videoAllowed`),
   * whether a parent consented (`voiceConsent`, `videoConsent`) and `isMinor`.
   */
  async commSettings(appId: string): Promise<PlayerCommSettings> {
    const data = await this.api.request(MyCommSettingsDocument, { appId });
    return data.myCommSettings;
  }

  /**
   * Change the player's choices; fields left out keep theirs. A choice above what policy
   * allows is kept and applies only up to the cap, so the effective scope can only go down.
   * Returns the settings after the change.
   */
  async setCommSettings(
    appId: string,
    choices: CommChoicesInput,
  ): Promise<PlayerCommSettings> {
    const input: Record<string, CommScope> = {};
    for (const key of ['voiceSend', 'voiceReceive', 'videoSend', 'videoReceive'] as const) {
      const value = choices[key];
      if (value !== undefined) input[key] = value as CommScope;
    }
    const data = await this.api.request(SetMyCommSettingsDocument, { appId, input });
    return data.setMyCommSettings;
  }

  /**
   * For a player under 18: ask a parent, through the platform's consent service, to allow
   * one medium in this app. The service emails `parentEmail`; once the parent consents the
   * medium opens, up to `CONTACTS`. Crowded Kingdoms does not store the address.
   *
   * `status` is `REQUESTED` (the email went out), `ALREADY_GRANTED` or `NOT_REQUIRED` (the
   * player is 18 or over; nothing was sent). Refused with `PARENTAL_CONSENT_UNAVAILABLE`
   * ({@link parentalConsentUnavailableOf}) while the service is not configured on the
   * deployment, and `RATE_LIMITED` after three requests in an hour.
   */
  async requestParentalConsent(
    appId: string,
    feature: ParentalConsentFeatureValue,
    parentEmail: string,
  ): Promise<ParentalConsentRequestResult> {
    const data = await this.api.request(RequestParentalConsentDocument, {
      appId,
      feature: feature as ParentalConsentFeature,
      parentEmail,
    });
    return data.requestParentalConsent;
  }

  /** The player's accepted contacts in the app, most recent first (at most 1,000). */
  async contacts(appId: string): Promise<PlayerContactRecord[]> {
    const data = await this.api.request(MyContactsDocument, { appId });
    return data.myContacts;
  }

  /**
   * Contact requests waiting in the app: `INCOMING` ones other players sent (answer with
   * {@link acceptContact} or {@link removeContact}), then `OUTGOING` ones the player sent
   * ({@link removeContact} cancels one), newest first.
   */
  async contactRequests(appId: string): Promise<ContactRequestRecord[]> {
    const data = await this.api.request(ContactRequestsDocument, { appId });
    return data.contactRequests;
  }

  /**
   * Ask another player of the app to be a contact. `state` is `PENDING`, or `ACCEPTED` when
   * they had already asked the player; asking again changes nothing. Refused while the player
   * has blocked them ({@link unblock} first).
   */
  async requestContact(appId: string, userId: string): Promise<PlayerContactRecord> {
    const data = await this.api.request(RequestContactDocument, { appId, userId });
    return data.requestContact;
  }

  /** Accept another player's request: both become each other's contacts. `NOT_FOUND` when they have not asked. */
  async acceptContact(appId: string, userId: string): Promise<PlayerContactRecord> {
    const data = await this.api.request(AcceptContactDocument, { appId, userId });
    return data.acceptContact;
  }

  /**
   * Remove a contact, decline the other player's request, or cancel the player's own:
   * everything between the two in the app goes, both ways. False when there was nothing.
   */
  async removeContact(appId: string, userId: string): Promise<boolean> {
    const data = await this.api.request(RemoveContactDocument, { appId, userId });
    return data.removeContact;
  }

  /** The players the player blocked in the app, most recent first (at most 1,000). */
  async blocks(appId: string): Promise<PlayerBlockRecord[]> {
    const data = await this.api.request(MyBlocksDocument, { appId });
    return data.myBlocks;
  }

  /**
   * Block another player of the app: nothing passes between the two, either way, on every
   * session of both within a second, and the app's hubs can ask (`players.blocked`). Any
   * contact or request between them goes too. The blocked player is not told, and its contact
   * requests to the player are dropped. Blocking again changes nothing.
   */
  async block(appId: string, userId: string): Promise<PlayerBlockRecord> {
    const data = await this.api.request(BlockPlayerDocument, { appId, userId });
    return data.blockPlayer;
  }

  /**
   * Lift a block the player set. A contact the block removed does not come back. False when
   * there was no such block.
   */
  async unblock(appId: string, userId: string): Promise<boolean> {
    const data = await this.api.request(UnblockPlayerDocument, { appId, userId });
    return data.unblockPlayer;
  }

  /**
   * Report another player of the app to its moderators. The report covers both players'
   * recorded sessions (the app's safety log) from 15 minutes before `occurredAt` to now, and
   * the platform preserves them with both identities for the moderators. The reported player
   * is not told.
   *
   * Refused with `NOT_FOUND` for a player the app does not know, `BAD_USER_INPUT` for the
   * player itself, `details` over 1,000 characters, an `occurredAt` outside the past year or
   * an actor id that is not 32 hex digits, and `RATE_LIMITED` after 20 reports in an hour.
   */
  async fileReport(report: SafetyReportFiling): Promise<SafetyReportReceiptRecord> {
    const occurredAt =
      report.occurredAt instanceof Date ? report.occurredAt.toISOString() : report.occurredAt;
    const data = await this.api.request(FileSafetyReportDocument, {
      input: {
        appId: report.appId,
        reportedUserId: report.reportedUserId,
        reason: report.reason as SafetyReportReason,
        occurredAt,
        ...(report.reportedActorUuid !== undefined
          ? { reportedActorUuid: report.reportedActorUuid }
          : {}),
        ...(report.details !== undefined ? { details: report.details } : {}),
      },
    });
    return data.fileSafetyReport;
  }
}
