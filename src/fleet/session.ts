import {
  ClientCapability,
  CONTROL_NONCE_BYTES,
  MAX_MEDIA_SPEAKERS,
  serializeActorHeartbeat,
  serializeActorUpdate,
  serializeAudioPacket,
  serializeChannelAudio,
  serializeChannelMessage,
  serializeClientCapabilities,
  serializeClientEvent,
  serializeClientMediaSpeakers,
  serializeGenericSpatial,
  serializeRangedChannelMessage,
  serializeSingleActorMessage,
  serializeTextPacket,
  serializeVideoPacket,
  serializeVoxelUpdate,
  SpeakerListMode,
  WireMessageType,
  assertVoxelEdit,
  type ChannelSendInput,
  type RelaySignContext,
  type SpatialSendBase,
  type SpeakerListChange,
} from '../binary-wire.js';
import { CrowdyError, CrowdyRealtimeError } from '../errors.js';
import {
  carriedPlayerContext,
  createFleetSignContext,
  FLEET_MAX_DATAGRAM_BYTES,
  FLEET_TOKEN_CHARS,
  FleetCarryStatus,
  parseFleetDatagram,
  serializeFleetCarry,
  serializeFleetRelease,
  type FleetId,
  type FleetInbound,
} from '../fleet-wire.js';
import type { CrowdyLogger } from '../logger.js';
import type { UdpNotification, UdpNotificationHandlers } from '../realtime.js';
import {
  fleetServerAddress,
  nodeFleetSocket,
  type FleetServer,
  type FleetSocket,
  type FleetSocketFactory,
} from './socket.js';

/**
 * What a fleet session is made from and refreshed with: the answer of the Application API's
 * `openFleetSession` or `refreshFleetSession` (`client.fleetSessions.open` / `refresh`), or
 * the same fields from your own HTTP client.
 */
export interface FleetSessionGrant {
  /** The fleet token: 64 characters. It signs the session and stays on your server. */
  token: string;
  /** The fleet token's id, as a decimal string. */
  gameTokenId: string;
  /** The app the session is in, as a decimal string. */
  appId: string;
  /** When the session ends unless it is refreshed first (ISO 8601). */
  expiresAt?: string | null;
  /** How many players the session may carry at once. */
  maxPlayers?: number | null;
  /** The realtime server to connect to. */
  server: FleetServer;
}

/** A player's app token, as `mintManagedPlayerToken` or `refreshAppToken` answered it. */
export interface FleetPlayerToken {
  /** The player's app token: 64 characters. It proves the carry and is not sent. */
  token: string;
  /** The player's app token's id. */
  gameTokenId: FleetId;
  /**
   * After `refreshAppToken`: the game token id this session carries the same player under
   * now. With it the row moves to the new id at once and the player stays carried
   * throughout: sends for the player name the new id from the moment the `FLEET_CARRY` goes
   * out, and the old id's late frames are ignored. Without it the session learns that the two
   * tokens are one player only from the carry's answer, so sends for the new id are refused
   * here until then. It must name the same player.
   */
  replaces?: FleetId | null;
}

/**
 * How a carry ended. The first five are `FLEET_CARRY_RESULT`'s status; the rest are this
 * session's own.
 */
export type FleetCarryOutcome =
  /** The session carries the player; the result names their user id. */
  | 'carried'
  /**
   * No live token by that id: it expired, the sign-in ended, or it is another app's. The
   * session asks once more, 250 ms later, before it settles on this: a token minted a moment
   * ago may not have reached the realtime server yet.
   */
  | 'noLiveToken'
  /** The token belongs to another organization's player. */
  | 'otherOrganization'
  /**
   * The proof or its time failed: a wrong token, or this machine's clock is more than 30
   * seconds from the server's.
   */
  | 'proofFailed'
  /** The session already carries as many players as it may (`maxPlayers`). */
  | 'sessionFull'
  /** A status this build does not know; `wireStatus` has the byte. */
  | 'refused'
  /** No answer came within `carryTimeoutMs` of the first send. */
  | 'timedOut'
  /**
   * The session's table is full, so nothing was sent: it holds `maxPlayers` rows and
   * {@link FLEET_TABLE_MARGIN} more, carried players and carries waiting together. Release
   * players who left, or open another session.
   */
  | 'tableFull'
  /** `release` was called for the player before the answer came. */
  | 'released'
  /** The session was closed before the answer came. */
  | 'closed';

/** The result of {@link FleetSession.carry}. */
export interface FleetCarryResult {
  playerGameTokenId: string;
  /** The player's user id when carried (what `ExecConnection.callAs` takes); null otherwise. */
  userId: string | null;
  status: FleetCarryOutcome;
  /** The status byte the server sent; null when none came. */
  wireStatus: number | null;
  /** True when `status` is `'carried'`. */
  carried: boolean;
}

/** The server ended a carry (`FLEET_RELEASED`). */
export interface FleetReleased {
  playerGameTokenId: string;
  /** The player's user id when this session knew it; null otherwise. */
  userId: string | null;
  /**
   * `FleetReleaseReason`: 1 another session carries the player (they moved to another of
   * your servers); 2 the player's sign-in ended; 5 no gameplay input from the player for the
   * app's idle timeout. Treat a value not listed as the carry having ended.
   */
  reason: number;
}

/** One row of {@link FleetSession.players}. */
export interface FleetPlayer {
  gameTokenId: string;
  /** Null until a carry is confirmed. */
  userId: string | null;
  /** The server confirmed a carry and nothing ended it: sends for the player are accepted. */
  carried: boolean;
  /** A `FLEET_CARRY` is waiting for its result. */
  pending: boolean;
}

/**
 * Which carried players a notification is for.
 *
 * - **A list** (1 to 32 game token ids): the notification arrived inside a `FLEET_DELIVERY`.
 *   Deliver it to these players and no others. Every communication arrives this way (spatial
 *   voice, text and video, direct messages, channel messages and channel audio), and so does
 *   a client's event or an app-defined spatial message that only some of your players may
 *   receive.
 * - **`null`**: the notification arrived plain, once for the session. It is for every one of
 *   your players in range, however many that is. State arrives this way (actor updates and
 *   departures, voxel edits, events, app-defined spatial messages, chunk changes).
 */
export type FleetPlayers = readonly string[] | null;

type Notified<K extends keyof UdpNotificationHandlers> = Parameters<NonNullable<UdpNotificationHandlers[K]>>[0];

/**
 * A fleet session's callbacks: the realtime client's notification handlers, each with the
 * players the notification is for ({@link FleetPlayers}), and the session's own events. Every
 * handler is optional. A handler that throws is reported to {@link error} and stops nothing.
 */
export interface FleetHandlers {
  actorUpdate?(notification: Notified<'actorUpdate'>, players: FleetPlayers): void;
  voxelUpdate?(notification: Notified<'voxelUpdate'>, players: FleetPlayers): void;
  actorLeft?(notification: Notified<'actorLeft'>, players: FleetPlayers): void;
  chunkChanged?(notification: Notified<'chunkChanged'>, players: FleetPlayers): void;
  clientEvent?(notification: Notified<'clientEvent'>, players: FleetPlayers): void;
  serverEvent?(notification: Notified<'serverEvent'>, players: FleetPlayers): void;
  genericSpatial?(notification: Notified<'genericSpatial'>, players: FleetPlayers): void;
  audio?(notification: Notified<'audio'>, players: FleetPlayers): void;
  video?(notification: Notified<'video'>, players: FleetPlayers): void;
  text?(notification: Notified<'text'>, players: FleetPlayers): void;
  singleActorMessage?(notification: Notified<'singleActorMessage'>, players: FleetPlayers): void;
  channelMessage?(notification: Notified<'channelMessage'>, players: FleetPlayers): void;
  channelAudio?(notification: Notified<'channelAudio'>, players: FleetPlayers): void;
  /** Every notification above, before its own handler. */
  any?(notification: UdpNotification, players: FleetPlayers): void;
  /**
   * The server refused one send, by its sequence number. `UNAUTHORIZED` answers a message for
   * a player the server does not count as carried by this session, or a player whose access
   * to the app was suspended or ended: stop serving that player. `TOKEN_EXPIRED` answers a
   * send that landed just before the carried player's own token expired; `FLEET_RELEASED`
   * with reason 2 follows. The sequence number is one byte shared by everything the session
   * sends, so match it against the sequence numbers your sends resolved with, soon after: a
   * refusal names no player.
   *
   * `verified` is true when the refusal arrived inside a signed bundle the session verified
   * with the fleet token. Realtime servers from v0.50.3 send a session's refusals that way.
   * An earlier server sends a refusal alone, as `[3][seq][code]`, which has no room for an
   * HMAC, and then `verified` is false: anyone who can reach the session's socket could have
   * forged it. **Treat an unverified refusal as a hint.** Stop sending for the player it
   * points at, then carry the player again (the answer to a carry is always verified) or
   * check the player's access through the Application API, and act on that answer. The
   * session itself changes no state on a refusal, whatever its code: the signed word that
   * the session's own token ended is `sessionReleased`.
   */
  genericError?(notification: Notified<'genericError'>, verified: boolean): void;
  /**
   * Every carry the server answered or that timed out, including the carries made again
   * after the session moved. A carry ended here before it was sent (`'tableFull'`,
   * `'released'`, `'closed'`) reaches only the promise `carry` returned.
   */
  carryResult?(result: FleetCarryResult): void;
  /** The server ended a carry. The session no longer carries the player when this fires. */
  released?(released: FleetReleased): void;
  /**
   * The session needs another realtime server: the one it is on told it to connect elsewhere
   * (and keeps answering for about 5 seconds), or said nothing for `silenceTimeoutMs`.
   * `refreshDue()` is true: call `refreshFleetSession` without a `currentServer`
   * (`refreshInput()` leaves it out) and give the answer to `applyRefresh`. A session that was
   * closed through the Application API is told by `sessionReleased` with reason 0 on realtime
   * servers from v0.50.3; an earlier server sends it nothing, so the silence shows it here.
   * Either way the refresh answers `NOT_FOUND`.
   */
  moveOrdered?(): void;
  /**
   * The realtime server released the session, in a frame signed with the fleet token
   * (`SessionReleaseReason`): it answers this session no more and its carries have ended.
   * Reason 0 is the fleet token revoked (the session was closed through the Application API,
   * or its organization token was revoked); 2 is the fleet token expiring; 1, 3 and 4 are
   * staleness, overload and a move.
   * Whatever the reason, `refreshDue()` is true and `refreshInput()` names no server, as
   * after a move order. A refresh that succeeds reconnects and carries every player again;
   * one refused `NOT_FOUND` means the session ended (after reason 0 or 2 it has), so open a new
   * one.
   */
  sessionReleased?(reason: number): void;
  status?(status: FleetSessionStatus): void;
  /** A socket failure, or a handler that threw. */
  error?(error: Error): void;
}

/**
 * - `idle`: made, and not yet connected.
 * - `connecting`: the socket is open and the capabilities are sent; nothing has verified yet.
 * - `connected`: the realtime server answered with something that verified.
 * - `released`: the realtime server released the session; refresh it.
 * - `closed`: `close()` was called.
 */
export type FleetSessionStatus = 'idle' | 'connecting' | 'connected' | 'released' | 'closed';

export interface FleetSessionConfig {
  /** `openFleetSession`'s answer (`client.fleetSessions.open(appId)`). */
  session: FleetSessionGrant;
  handlers?: FleetHandlers;
  /**
   * Ask for the state this session's own carried players sent, when another of its carried
   * players is in range (`ClientCapability.FLEET_OWN_STATE`). Default false: a game server
   * simulates its own players. A voxel edit reaches the session that sent it either way.
   */
  fleetOwnState?: boolean;
  /**
   * Ask for a carried speaker's own spatial voice and video inside the deliveries
   * (`ClientCapability.OWN_MEDIA_ECHO`). Default false.
   */
  ownMediaEcho?: boolean;
  /** An unanswered `FLEET_CARRY` is sent again this often, with a new time and proof. Default 250. */
  carryRetryMs?: number;
  /** A carry with no answer this long after its first send ends `'timedOut'`. Default 5,000. */
  carryTimeoutMs?: number;
  /**
   * The most `FLEET_CARRY` messages sent in any one second, first sends and retries together.
   * Default 60, and never above 63: the realtime servers drop a session's carries past 64 a
   * second without an answer.
   */
  maxCarriesPerSecond?: number;
  /** How often the session's own keepalive (a heartbeat with no actor) is sent. Default 2,000. */
  keepAliveIntervalMs?: number;
  /**
   * A carried player's actor that sent nothing for this long is kept present with a heartbeat
   * under the player's id. Default 2,000; 0 leaves heartbeats to you (`sendHeartbeat`).
   */
  actorHeartbeatMs?: number;
  /**
   * How often the capabilities are sent again once the server answered. Default 15,000, and
   * never more than a third of `silenceTimeoutMs`. The server acknowledges each one with a
   * signed frame, which is what an otherwise idle session hears: one every 15 seconds, so the
   * acknowledgements of two in a row can be lost before 45 seconds of silence have passed.
   */
  capabilitiesIntervalMs?: number;
  /** How often the capabilities are sent again until the server answers. Default 500. */
  bindRetryMs?: number;
  /**
   * How long the realtime server may say nothing that verifies before the session takes it
   * for gone: `refreshDue()` turns true, and the refresh that follows carries every player
   * again. Default 45,000, three times `capabilitiesIntervalMs`; at least 3,000; 0 never
   * does.
   */
  silenceTimeoutMs?: number;
  /**
   * How often the session does its timed work (carry sends and retries, keepalives), in
   * milliseconds. Default 20. 0 starts no timer: call {@link FleetSession.tick} yourself.
   */
  tickIntervalMs?: number;
  /** The UDP socket. Default: `node:dgram` (`nodeFleetSocket()`). */
  socket?: FleetSocketFactory;
  /** Epoch milliseconds. Default `Date.now`. A carry's time comes from it. */
  now?: () => number;
  logger?: CrowdyLogger;
}

/** {@link FleetSession.stats}. */
export interface FleetSessionStats {
  datagramsSent: number;
  bytesSent: number;
  /** Messages sent, by type: 49 and 50 count carries and releases. */
  sentByType: Record<number, number>;
  datagramsReceived: number;
  bytesReceived: number;
  /** Frames dropped because their HMAC did not verify. */
  hmacFailures: number;
  /** Frames dropped because they could not be read. */
  malformed: number;
  /** Notifications dropped because they carried no signature. */
  unsigned: number;
  /**
   * Notifications dropped because they named another app than the session's. A fleet
   * session is in one app, so state or a communication of another app is never its own,
   * however it was signed. Anything but 0 is worth reporting to Crowded Kingdoms.
   */
  wrongApp: number;
  /** Datagrams dropped because they were above 1,242 bytes. */
  oversized: number;
  /** Control frames dropped: bound to another connection, or unbound after the server acknowledged the bound forms. */
  staleControl: number;
  /**
   * `CONTROL_BOUND_ACK`s (46) verified for this connection's nonce: the realtime server's
   * answer to each of the session's capabilities.
   */
  boundControlAcks: number;
  /** `FLEET_CARRY_RESULT`s that matched no carry waiting for one. */
  unmatchedCarryResults: number;
  /** Carries answered "no live token" that were asked once more before settling. */
  noLiveTokenRetries: number;
  /**
   * `FLEET_CARRY_RESULT` and `FLEET_RELEASED` frames that named a game token id this session
   * has replaced with the same player's newer one. They are late words about the old token,
   * and change nothing.
   */
  replacedIdFrames: number;
  /** `GenericErrorResponse`s received, verified or not. */
  errorsReceived: number;
  /** Of those, `UNAUTHORIZED`. */
  unauthorizedReceived: number;
  /** Of `errorsReceived`, those that arrived outside a signed bundle, so nothing verifies them. */
  unverifiedErrorsReceived: number;
  /** Carries refused here because the table was full (`'tableFull'`). */
  carriesRefusedTableFull: number;
}

/**
 * A send named a player this session does not carry now: never carried, a carry still
 * waiting for its result, or one that ended. Nothing was sent.
 */
export class FleetNotCarriedError extends CrowdyError {
  readonly code = 'FLEET_NOT_CARRIED';
  readonly playerGameTokenId: string;

  constructor(playerGameTokenId: string) {
    super({ message: `this fleet session does not carry player ${playerGameTokenId} now` });
    this.playerGameTokenId = playerGameTokenId;
  }
}

/** A send's input without what the session supplies: the app and the sequence number. */
type ForSession<T> = Omit<T, 'appId' | 'sequenceNumber'>;

type SpatialInput = ForSession<SpatialSendBase>;

/** The speakers whose spatial voice and video a carried player receives. */
export interface FleetSpeakerChange {
  /** Only these actors (none for `[]`), everyone in range for `null`; left as it is when omitted. */
  voice?: readonly string[] | null;
  video?: readonly string[] | null;
}

interface Attempt {
  /** When the next `FLEET_CARRY` goes out. */
  nextSendAt: number;
  /** When the carry times out; 0 until its first send. */
  deadline: number;
  /** Queue order between attempts due at the same time. */
  order: number;
  resolvers: Array<(result: FleetCarryResult) => void>;
  /**
   * A status 1 is asked about once more: `waiting` while that retry is due, `retried` once it
   * went out. Only an answer that comes after it settles the carry as refused.
   */
  noLiveToken: 'none' | 'waiting' | 'retried';
}

/** The token a player was carried under before the one that is being carried now. */
interface Previous {
  gameTokenId: string;
  token: string;
  ctx: RelaySignContext;
  /** The reason of a `FLEET_RELEASED` that named this id while the new carry waited. */
  ended: number | null;
}

interface Actor {
  chunk: { x: string; y: string; z: string };
  lastSentAt: number;
}

interface Player {
  /** The newest game token id the player was carried or asked for under: the table's key. */
  gameTokenId: string;
  token: string;
  /**
   * What sends for the player are signed with now. It names `previous`'s id until the
   * `FLEET_CARRY` for `gameTokenId` goes out, and `gameTokenId` from that moment.
   */
  ctx: RelaySignContext;
  /** Set while a carry with a refreshed token waits: the carry that stands meanwhile. */
  previous: Previous | null;
  userId: string | null;
  carried: boolean;
  attempt: Attempt | null;
  /** The time the last `FLEET_CARRY` for this player carried: the next one is later. */
  lastCarryEpoch: number;
  actors: Map<string, Actor>;
  voice: readonly string[] | null | undefined;
  video: readonly string[] | null | undefined;
}

/**
 * How many rows a session's table may hold past its `maxPlayers`: room for carries that wait
 * for an answer while the table is full, such as a player's carry with a refreshed token
 * before it replaces the row the same user had. The realtime servers allow a session the
 * same 32 carries past `maxPlayers` at once.
 */
export const FLEET_TABLE_MARGIN = 32;
/** The most players any session may carry, used when a grant names no `maxPlayers`. */
const FLEET_MAX_PLAYERS_CEILING = 1_024;

const OWN_TYPES: ReadonlySet<number> = new Set([
  WireMessageType.CLIENT_CAPABILITIES,
  WireMessageType.FLEET_CARRY,
  WireMessageType.FLEET_RELEASE,
  WireMessageType.CLIENT_ACTOR_HEARTBEAT,
]);

const CARRY_OUTCOMES: Record<number, FleetCarryOutcome> = {
  [FleetCarryStatus.CARRIED]: 'carried',
  [FleetCarryStatus.NO_LIVE_TOKEN]: 'noLiveToken',
  [FleetCarryStatus.OTHER_ORGANIZATION]: 'otherOrganization',
  [FleetCarryStatus.PROOF_FAILED]: 'proofFailed',
  [FleetCarryStatus.SESSION_FULL]: 'sessionFull',
};

/**
 * What was given where an id belongs, described and never shown: a token passed by mistake
 * would otherwise be in the error's message, and messages are logged.
 */
function notAnId(id: unknown): string {
  if (typeof id === 'string') return `a string of ${id.length} characters`;
  if (typeof id === 'number') return Number.isFinite(id) ? 'a number that is not a safe integer' : 'a number that is not finite';
  if (typeof id === 'bigint') return 'an integer outside the 64-bit range';
  return id === null ? 'null' : `a value of type ${typeof id}`;
}

function idString(id: FleetId, what: string): string {
  try {
    if (typeof id === 'number' && !Number.isSafeInteger(id)) throw new RangeError();
    if (typeof id === 'string' && !/^-?\d+$/.test(id)) throw new RangeError();
    return BigInt(id).toString();
  } catch {
    throw new RangeError(`${what} must be a whole 64-bit number, and was ${notAnId(id)}`);
  }
}

function speakerChange(list: readonly string[] | null | undefined): SpeakerListChange {
  if (list === undefined) return { mode: SpeakerListMode.KEEP, names: [] };
  if (list === null) return { mode: SpeakerListMode.EVERYONE, names: [] };
  return { mode: SpeakerListMode.ONLY, names: list };
}

/**
 * A fleet session: one realtime session an organization's game server opens for itself, in
 * which it carries the players who are on it (realtime servers v0.50.3). It connects to the
 * realtime server over UDP, so it runs on Node, on a server the organization runs.
 *
 * **Security: an org token and a fleet token never go into a browser page or a game
 * client.** The fleet token signs for every player the session carries. Keep it where the
 * org token is kept, on a server your organization runs. A game on a player's device uses
 * that player's own app token (`client.udp`).
 *
 * ```ts
 * import { createCrowdyClient } from '@crowdedkingdoms/crowdyjs';
 * import { FleetSession } from '@crowdedkingdoms/crowdyjs/fleet';
 *
 * const api = createCrowdyClient({ httpUrl });
 * api.setToken(process.env.CK_ORG_TOKEN);            // cko_…, scope fleet:session
 *
 * const fleet = new FleetSession({
 *   session: await api.fleetSessions.open(appId),    // one session for each game server
 *   handlers: {
 *     actorUpdate: (n) => world.apply(n),            // state: once for the session
 *     text: (n, players) => players?.forEach((p) => chat.deliver(p, n)),  // only these players
 *     released: (r) => roster.remove(r.playerGameTokenId),
 *   },
 * });
 * await fleet.connect();
 *
 * // A player joined this server. The token and its id are the player's app token's.
 * const carry = await fleet.carry({ token: player.token, gameTokenId: player.gameTokenId });
 * if (carry.carried) await fleet.sendActorUpdate(carry.playerGameTokenId, { chunk, uuid, state });
 *
 * // Now and then: keep the session, and follow it to another realtime server.
 * if (fleet.refreshDue()) await fleet.applyRefresh(await api.fleetSessions.refresh(fleet.refreshInput()));
 * ```
 *
 * What the session sends: for a carried player, the message that player's own session would
 * send, with the player's game token id in its tail and the HMAC keyed with the fleet token.
 * Under its own game token id it sends only its capabilities (29), `FLEET_CARRY` (49),
 * `FLEET_RELEASE` (50) and its keepalive (26). The platform applies each carried player's own
 * permissions, blocks, age rules, speaker lists, rate budget (500 messages a second, bursts
 * to 1,000) and idle timeout.
 *
 * What it receives: state once for the session, and communications inside `FLEET_DELIVERY`
 * with the carried players who may receive them ({@link FleetPlayers}). Every notification
 * is verified with the fleet token before a handler sees it, and no option turns that off.
 * One that names another app than the session's is dropped and counted (`stats().wrongApp`).
 * A refusal of a send has no room for a signature when it arrives alone, so `genericError`
 * is told whether it was verified.
 *
 * The session makes no Application API call. {@link refreshDue} says when to call
 * `refreshFleetSession`, and {@link applyRefresh} takes the answer.
 */
export class FleetSession {
  private grant: FleetSessionGrant;
  private handlers: FleetHandlers;
  private readonly logger: CrowdyLogger | undefined;
  private readonly socketFactory: FleetSocketFactory;
  private readonly now: () => number;
  private readonly carryRetryMs: number;
  private readonly carryTimeoutMs: number;
  private readonly maxCarriesPerSecond: number;
  private readonly keepAliveIntervalMs: number;
  private readonly actorHeartbeatMs: number;
  private readonly capabilitiesIntervalMs: number;
  private readonly bindRetryMs: number;
  private readonly silenceTimeoutMs: number;
  private readonly tickIntervalMs: number;

  private ctx: RelaySignContext | null = null;
  private socket: FleetSocket | null = null;
  private server: FleetServer;
  /** Counts connections: a datagram or a send of an earlier one is dropped. */
  private generation = 0;
  private controlNonce: Uint8Array | null = null;
  /** The server acknowledged this connection's nonce: it sends no unbound control frame. */
  private boundAcked = false;
  /** Something from the server verified on this connection. */
  private answered = false;
  /** When the server last said something that verified, or when this connection was opened. */
  private lastHeardAt = 0;
  /** The connection is being opened: nothing goes out before its capabilities. */
  private binding = false;
  private currentStatus: FleetSessionStatus = 'idle';
  private capabilityFlags: number;
  private moveWasOrdered = false;
  /** The server holds no carry for this session: the next refresh carries every player again. */
  private carriesLost = false;
  private expiresAtMs: number | null;
  private grantedAtMs: number;

  private readonly table = new Map<string, Player>();
  /** A player's previous game token id, while the carry that replaces it waits: id -> row key. */
  private readonly aliases = new Map<string, string>();
  /** Game token ids replaced by the same player's newer one, and when: late frames are ignored. */
  private readonly replaced = new Map<string, number>();
  private attemptOrder = 0;
  /** Each `FLEET_CARRY` of the last second: when it was sent, and whether it was a retry. */
  private carrySends: Array<{ at: number; retry: boolean }> = [];
  private nextSequence = 0;
  private nextCapabilitiesAt = 0;
  private lastKeepAliveAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private inbound: Promise<void> = Promise.resolve();
  private connecting: Promise<void> | null = null;

  private readonly counters: FleetSessionStats = {
    datagramsSent: 0,
    bytesSent: 0,
    sentByType: {},
    datagramsReceived: 0,
    bytesReceived: 0,
    hmacFailures: 0,
    malformed: 0,
    unsigned: 0,
    wrongApp: 0,
    oversized: 0,
    staleControl: 0,
    boundControlAcks: 0,
    unmatchedCarryResults: 0,
    noLiveTokenRetries: 0,
    replacedIdFrames: 0,
    errorsReceived: 0,
    unauthorizedReceived: 0,
    unverifiedErrorsReceived: 0,
    carriesRefusedTableFull: 0,
  };

  constructor(config: FleetSessionConfig) {
    const grant = config.session;
    if (typeof grant?.token !== 'string' || grant.token.length !== FLEET_TOKEN_CHARS) {
      throw new RangeError(`the fleet token must be ${FLEET_TOKEN_CHARS} characters`);
    }
    this.grant = {
      ...grant,
      gameTokenId: idString(grant.gameTokenId, 'the fleet gameTokenId'),
      appId: idString(grant.appId, 'appId'),
      server: { ...grant.server },
    };
    fleetServerAddress(this.grant.server);
    this.server = this.grant.server;
    this.handlers = config.handlers ?? {};
    this.logger = config.logger;
    this.socketFactory = config.socket ?? nodeFleetSocket();
    this.now = config.now ?? Date.now;
    this.carryRetryMs = Math.max(1, config.carryRetryMs ?? 250);
    this.carryTimeoutMs = Math.max(1, config.carryTimeoutMs ?? 5_000);
    this.maxCarriesPerSecond = Math.max(1, Math.min(63, Math.floor(config.maxCarriesPerSecond ?? 60)));
    this.keepAliveIntervalMs = Math.max(100, config.keepAliveIntervalMs ?? 2_000);
    this.actorHeartbeatMs = Math.max(0, config.actorHeartbeatMs ?? 2_000);
    const silence = config.silenceTimeoutMs ?? 45_000;
    this.silenceTimeoutMs = silence > 0 ? Math.max(3_000, silence) : 0;
    // An idle session hears only the acknowledgements of its capabilities, so the silence it
    // tolerates is at least three of their intervals.
    const capabilities = Math.max(1_000, config.capabilitiesIntervalMs ?? 15_000);
    this.capabilitiesIntervalMs =
      this.silenceTimeoutMs > 0 ? Math.min(capabilities, Math.floor(this.silenceTimeoutMs / 3)) : capabilities;
    this.bindRetryMs = Math.max(50, config.bindRetryMs ?? 500);
    this.tickIntervalMs = Math.max(0, config.tickIntervalMs ?? 20);
    this.capabilityFlags =
      ClientCapability.BUNDLE_SIGNED |
      ClientCapability.BOUND_CONTROL |
      (config.fleetOwnState ? ClientCapability.FLEET_OWN_STATE : 0) |
      (config.ownMediaEcho ? ClientCapability.OWN_MEDIA_ECHO : 0);
    this.grantedAtMs = this.now();
    this.expiresAtMs = expiryOf(grant.expiresAt);
  }

  // ----- What the session is ---------------------------------------------------

  /** The app the session is in. */
  get appId(): string {
    return this.grant.appId;
  }

  /** The session's own game token id: what `refreshFleetSession` and `closeFleetSession` name it by. */
  get gameTokenId(): string {
    return this.grant.gameTokenId;
  }

  /** How many players the session may carry at once, when the grant said. */
  get maxPlayers(): number | null {
    return this.grant.maxPlayers ?? null;
  }

  /** When the session ends unless it is refreshed first, in epoch milliseconds; null when unknown. */
  get expiresAt(): number | null {
    return this.expiresAtMs;
  }

  /** The realtime server the session is on, or will connect to. */
  get currentServer(): FleetServer {
    return { ...this.server };
  }

  get status(): FleetSessionStatus {
    return this.currentStatus;
  }

  /** Replace the handlers. */
  setHandlers(handlers: FleetHandlers): void {
    this.handlers = handlers;
  }

  /** A copy of the session's counters. */
  stats(): FleetSessionStats {
    return { ...this.counters, sentByType: { ...this.counters.sentByType } };
  }

  /** Never the tokens: what a log line or `JSON.stringify` shows of a session. */
  toJSON(): Record<string, unknown> {
    return {
      appId: this.appId,
      gameTokenId: this.gameTokenId,
      status: this.currentStatus,
      server: this.currentServer,
      players: this.table.size,
      carried: this.carriedCount,
    };
  }

  /** @internal Node's `console.log` and `util.inspect` show {@link toJSON}, never the tokens. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `FleetSession ${JSON.stringify(this.toJSON())}`;
  }

  // ----- Connecting --------------------------------------------------------------

  /**
   * Open the socket to the realtime server and bind the session: its capabilities are its
   * first datagram, under its own game token id. Resolves once they are sent. The
   * capabilities go again every `bindRetryMs` until the server answers, since the session's
   * token may reach the server a moment after `openFleetSession` returns; the status is then
   * `'connected'`. Carries asked for before that wait and are sent in order.
   */
  connect(): Promise<void> {
    if (this.currentStatus === 'closed') {
      return Promise.reject(new CrowdyRealtimeError('the fleet session is closed', { code: 'FLEET_CLOSED' }));
    }
    if (this.socket) return Promise.resolve();
    if (!this.connecting) {
      this.connecting = this.open(this.server).finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async open(server: FleetServer): Promise<void> {
    const generation = ++this.generation;
    this.ctx ??= await createFleetSignContext(this.grant.gameTokenId, this.grant.token);
    const nonce = new Uint8Array(CONTROL_NONCE_BYTES);
    crypto.getRandomValues(nonce);
    const socket = await this.socketFactory(server, {
      onDatagram: (datagram) => this.onDatagram(generation, datagram),
      onError: (error) => this.report(error),
    });
    if (generation !== this.generation || this.currentStatus === 'closed') {
      socket.close();
      return;
    }
    const now = this.now();
    this.binding = true;
    try {
      this.socket = socket;
      this.server = { ...server };
      this.controlNonce = nonce;
      this.boundAcked = false;
      this.answered = false;
      this.carrySends = [];
      this.lastHeardAt = now;
      this.setStatus('connecting');
      // The capabilities are the connection's first datagram: they bind the session.
      await this.sendCapabilities();
      this.nextCapabilitiesAt = now + this.bindRetryMs;
      this.lastKeepAliveAt = now;
    } finally {
      this.binding = false;
    }
    if (this.tickIntervalMs > 0 && !this.timer) {
      this.timer = setInterval(() => void this.tick(), this.tickIntervalMs);
      (this.timer as { unref?: () => void }).unref?.();
    }
  }

  /**
   * Close the socket and stop the timers. Carries waiting for an answer end `'closed'`, and
   * the table is emptied. This does not end the session on the platform: call
   * `client.fleetSessions.close` for that, or it ends at its `expiresAt`.
   */
  close(): void {
    if (this.currentStatus === 'closed') return;
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
    for (const player of this.table.values()) {
      this.settle(player, { status: 'closed', wireStatus: null, userId: null }, false);
    }
    this.table.clear();
    this.aliases.clear();
    this.replaced.clear();
    this.setStatus('closed');
  }

  // ----- Refreshing ----------------------------------------------------------------

  /**
   * True after the realtime server told the session to move, released it (for any reason, the
   * fleet token expiring among them) or went quiet for `silenceTimeoutMs`, until a refresh is
   * applied.
   */
  get moveOrdered(): boolean {
    return this.moveWasOrdered;
  }

  /**
   * True when it is time to call `refreshFleetSession`: a move was ordered
   * ({@link moveOrdered}), or less than half of the session's lifetime is left (12 hours into
   * a 24-hour session, counted from when this object was given the grant). The session makes
   * no call itself: ask this from your own loop.
   */
  refreshDue(): boolean {
    if (this.currentStatus === 'closed') return false;
    if (this.moveWasOrdered) return true;
    if (this.expiresAtMs === null) return false;
    return this.now() >= this.grantedAtMs + (this.expiresAtMs - this.grantedAtMs) / 2;
  }

  /**
   * The input of `refreshFleetSession` for this session (`client.fleetSessions.refresh`). It
   * names the realtime server the session is on, so the session stays there while that
   * server still serves the app. After a move was ordered it names none, and the answer's
   * server is the next one.
   *
   * `currentServer` is the address the session connected to and the port: the server's `ip4`
   * when it has one, its `ip6` otherwise (18.41.0; naming an `ip6` needs Application API
   * v2.90.0, and until 18.41.0 a session that connected over `ip6` named no server).
   */
  refreshInput(): {
    appId: string;
    gameTokenId: string;
    currentServer?: { ip4: string; clientPort: number } | { ip6: string; clientPort: number };
  } {
    const input = { appId: this.appId, gameTokenId: this.gameTokenId };
    if (this.moveWasOrdered) return input;
    const { host, family, port } = fleetServerAddress(this.server);
    return {
      ...input,
      currentServer: family === 4 ? { ip4: host, clientPort: port } : { ip6: host, clientPort: port },
    };
  }

  /**
   * Take the answer of `refreshFleetSession`: the new expiry and the realtime server.
   *
   * - **The same server:** the carries stand. The session sends its capabilities again and no
   *   `FLEET_CARRY`.
   * - **Another server**, or the same one after it released the session or went quiet: the
   *   server holds no carry. The session connects there, sends its capabilities, then a new `FLEET_CARRY` (a
   *   new time and proof) for every player, paced under 64 a second. Until each is answered,
   *   sends for that player are refused locally; each answer reaches `handlers.carryResult`.
   *
   * @throws {CrowdyError} with nothing changed, for an answer that is another session's (a
   *   different app or `gameTokenId`) or carries no usable token or server.
   */
  async applyRefresh(answer: FleetSessionGrant): Promise<void> {
    if (this.currentStatus === 'closed') {
      throw new CrowdyRealtimeError('the fleet session is closed', { code: 'FLEET_CLOSED' });
    }
    if (typeof answer?.token !== 'string' || answer.token.length !== FLEET_TOKEN_CHARS) {
      throw new CrowdyError({ message: `the refreshed fleet token must be ${FLEET_TOKEN_CHARS} characters` });
    }
    if (idString(answer.appId, 'appId') !== this.appId || idString(answer.gameTokenId, 'gameTokenId') !== this.gameTokenId) {
      throw new CrowdyError({
        message: 'that answer is another fleet session\u2019s: a refresh keeps the app and the gameTokenId',
      });
    }
    const next = fleetServerAddress(answer.server);
    const current = fleetServerAddress(this.server);
    const sameServer = next.host === current.host && next.port === current.port;
    const newToken = answer.token !== this.grant.token;

    this.grant = { ...this.grant, token: answer.token, expiresAt: answer.expiresAt, maxPlayers: answer.maxPlayers ?? this.grant.maxPlayers };
    this.grantedAtMs = this.now();
    this.expiresAtMs = expiryOf(answer.expiresAt);
    this.moveWasOrdered = false;

    if (newToken) {
      // A refresh keeps the token. One that does not is taken as a new key for everything.
      this.ctx = await createFleetSignContext(this.grant.gameTokenId, this.grant.token);
      for (const player of this.table.values()) player.ctx = carriedPlayerContext(this.ctx, player.gameTokenId);
    }

    if (!this.socket && this.currentStatus === 'idle') {
      // Not connected yet: connect() goes to the server the answer names.
      this.server = { ...answer.server };
      return;
    }

    if (sameServer && !this.carriesLost && !newToken && this.socket) {
      await this.sendCapabilities();
      this.nextCapabilitiesAt = this.now() + (this.answered ? this.capabilitiesIntervalMs : this.bindRetryMs);
      return;
    }

    // Another server (or this one again after it let the session go): it holds no carry.
    this.generation += 1;
    this.socket?.close();
    this.socket = null;
    this.carriesLost = false;
    const now = this.now();
    for (const player of this.table.values()) {
      player.carried = false;
      if (player.previous) {
        // The new server holds no carry to stand meanwhile: the newest token is the only one.
        this.aliases.delete(player.previous.gameTokenId);
        this.retire(player.previous.gameTokenId);
        player.previous = null;
        if (this.ctx) player.ctx = carriedPlayerContext(this.ctx, player.gameTokenId);
      }
      player.attempt = {
        nextSendAt: now,
        deadline: 0,
        order: this.attemptOrder++,
        resolvers: player.attempt?.resolvers ?? [],
        noLiveToken: 'none',
      };
    }
    await this.open({ ...answer.server });
  }

  /**
   * Start or stop asking for the state this session's own carried players sent
   * (`ClientCapability.FLEET_OWN_STATE`). Advertised at once when connected and it changed.
   */
  async setFleetOwnState(on: boolean): Promise<void> {
    await this.setCapability(ClientCapability.FLEET_OWN_STATE, on);
  }

  /** Start or stop asking for a carried speaker's own spatial voice and video. */
  async setOwnMediaEcho(on: boolean): Promise<void> {
    await this.setCapability(ClientCapability.OWN_MEDIA_ECHO, on);
  }

  private async setCapability(bit: number, on: boolean): Promise<void> {
    const flags = on ? this.capabilityFlags | bit : this.capabilityFlags & ~bit;
    if (flags === this.capabilityFlags) return;
    this.capabilityFlags = flags;
    if (this.socket) await this.sendCapabilities();
  }

  // ----- Carrying ----------------------------------------------------------------------

  /**
   * Start carrying a player. `FLEET_CARRY` is sent when the session is connected and its turn
   * comes (carries are paced under 64 a second), and again every `carryRetryMs` with a new
   * time and proof until `FLEET_CARRY_RESULT` arrives or `carryTimeoutMs` passes. Resolves
   * with how it ended; it does not reject for a refusal. Sends for the player are accepted
   * from the moment the result is `'carried'`.
   *
   * **After you refresh a carried player's token**, call it with the new token and
   * `replaces: <the id the player is carried under>`. The player stays carried throughout,
   * with their actors and speaker lists: the carry made with the old token stands until the
   * new one takes effect, and there is no `released` event. From the moment the new
   * `FLEET_CARRY` goes out, every send for the player names the new id, whichever of the two
   * ids you pass to the send; the realtime server holds those sends behind the carry. Once
   * the result is `'carried'` the old id names nothing in this session. If the new carry is
   * refused, the player stays carried under the old id.
   *
   * A carry answered "no live token" is asked once more, 250 ms later, before it settles. A
   * carry that is refused or times out leaves the player not carried under that game token
   * id; the session sends `FLEET_RELEASE` for one that timed out, since the server may hold a
   * carry whose answers were lost.
   *
   * A carry for a new player when the table is full ends `'tableFull'` with nothing sent
   * ({@link tableLimit}).
   *
   * @throws {RangeError} (as a rejection) for a token that is not 64 characters, or a game
   *   token id that is not a number or is the session's own.
   */
  async carry(player: FleetPlayerToken): Promise<FleetCarryResult> {
    const id = idString(player?.gameTokenId, 'the player gameTokenId');
    if (typeof player.token !== 'string' || player.token.length !== FLEET_TOKEN_CHARS) {
      throw new RangeError(`the player's token must be ${FLEET_TOKEN_CHARS} characters`);
    }
    if (id === this.gameTokenId) {
      throw new RangeError('a carry names a player\u2019s gameTokenId; that one is the fleet session\u2019s own gameTokenId');
    }
    if (this.currentStatus === 'closed') {
      return { playerGameTokenId: id, userId: null, status: 'closed', wireStatus: null, carried: false };
    }
    const replaces = player.replaces == null ? null : idString(player.replaces, 'replaces');
    this.ctx ??= await createFleetSignContext(this.grant.gameTokenId, this.grant.token);
    let row = this.table.get(id);
    if (!row && replaces !== null && replaces !== id) {
      // The same player with a refreshed token: the row moves to the new id at once.
      const old = this.rowOf(replaces);
      if (old) row = this.supersede(old, id, player.token);
    }
    if (!row && this.table.size >= this.tableLimit) {
      // A game server that never releases anyone must not grow the table without bound.
      this.counters.carriesRefusedTableFull += 1;
      return { playerGameTokenId: id, userId: null, status: 'tableFull', wireStatus: null, carried: false };
    }
    if (!row) {
      row = {
        gameTokenId: id,
        token: player.token,
        ctx: carriedPlayerContext(this.ctx, id),
        previous: null,
        userId: null,
        carried: false,
        attempt: null,
        lastCarryEpoch: 0,
        actors: new Map(),
        voice: undefined,
        video: undefined,
      };
      this.table.set(id, row);
    }
    row.token = player.token;
    return new Promise<FleetCarryResult>((resolve) => {
      const target = row as Player;
      if (target.attempt) {
        target.attempt.resolvers.push(resolve);
      } else {
        target.attempt = {
          nextSendAt: this.now(),
          deadline: 0,
          order: this.attemptOrder++,
          resolvers: [resolve],
          noLiveToken: 'none',
        };
      }
      if (this.tickIntervalMs > 0) void this.tick();
    });
  }

  /** The row a game token id names: its own, or the one a waiting replacement moved it to. */
  private rowOf(id: string): Player | undefined {
    return this.table.get(id) ?? this.table.get(this.aliases.get(id) ?? '');
  }

  /** `id` was replaced by the same player's newer token: late frames that name it are ignored. */
  private retire(id: string): void {
    this.replaced.set(id, this.now());
  }

  /**
   * Move a player's row to the id of their refreshed token. A carried player stays carried:
   * the carry under the old id stands, and sends keep naming it, until the `FLEET_CARRY` for
   * the new id goes out. A row whose own carry was never confirmed simply takes the new token.
   */
  private supersede(row: Player, id: string, token: string): Player {
    const from = row.gameTokenId;
    this.table.delete(from);
    if (!row.carried) {
      if (row.previous) {
        this.aliases.delete(row.previous.gameTokenId);
        this.retire(row.previous.gameTokenId);
        row.previous = null;
      }
      this.retire(from);
      if (this.ctx) row.ctx = carriedPlayerContext(this.ctx, id);
    } else if (row.previous) {
      // A newer token while the last replacement still waited: the id that waited is dropped.
      this.retire(from);
      row.ctx = row.previous.ctx;
    } else {
      row.previous = { gameTokenId: from, token: row.token, ctx: row.ctx, ended: null };
    }
    if (row.previous) this.aliases.set(row.previous.gameTokenId, id);
    row.gameTokenId = id;
    row.token = token;
    this.table.set(id, row);
    // The carry with the new token starts over; whoever waited on the old one hears its answer.
    row.attempt = {
      nextSendAt: this.now(),
      deadline: 0,
      order: this.attemptOrder++,
      resolvers: row.attempt?.resolvers ?? [],
      noLiveToken: 'none',
    };
    return row;
  }

  /**
   * The player left the game: sends `FLEET_RELEASE` and takes them out of the table at once.
   * Their actors leave as when a player's own session ends, about 5 seconds after their last
   * message. A carry still waiting for the player ends `'released'`. The message has no
   * answer; one that is lost leaves the carry on the server until the player is carried
   * elsewhere, their sign-in ends, or they idle out. Stop sending for a player before you hand
   * them to another server: the other session's carry is what moves them, and no release is
   * needed for it.
   */
  async release(playerGameTokenId: FleetId): Promise<void> {
    const id = idString(playerGameTokenId, 'the player gameTokenId');
    // An id this session replaced with the player's newer one names nothing here any more,
    // and a release under it could end the carry that replaced it.
    if (this.replaced.has(id) && !this.table.has(id)) return;
    const row = this.rowOf(id);
    const ids = [id];
    if (row) {
      ids.length = 0;
      ids.push(row.gameTokenId);
      this.table.delete(row.gameTokenId);
      if (row.previous) {
        // A replacement was waiting: the player is let go under both of their ids.
        ids.push(row.previous.gameTokenId);
        this.aliases.delete(row.previous.gameTokenId);
        row.previous = null;
      }
      row.carried = false;
      this.settle(row, { status: 'released', wireStatus: null, userId: null }, false);
    }
    if (!this.socket || this.currentStatus === 'released') return;
    for (const each of ids) await this.sendRelease(each);
  }

  /**
   * True when the server confirmed a carry of this player and nothing ended it. While a carry
   * with a refreshed token waits, both of the player's ids answer true.
   */
  carries(playerGameTokenId: FleetId): boolean {
    return this.rowOf(idString(playerGameTokenId, 'the player gameTokenId'))?.carried === true;
  }

  /** Every row of the table: carried players and carries still waiting. */
  players(): FleetPlayer[] {
    return [...this.table.values()].map((p) => ({
      gameTokenId: p.gameTokenId,
      userId: p.userId,
      carried: p.carried,
      pending: p.attempt !== null,
    }));
  }

  /**
   * The most rows the table holds, carried players and carries waiting together: `maxPlayers`
   * (1,024 when the grant named none) and {@link FLEET_TABLE_MARGIN} more. A `carry` for a
   * new player past it ends `'tableFull'`.
   */
  get tableLimit(): number {
    const max = this.grant.maxPlayers;
    const players = typeof max === 'number' && max > 0 ? Math.min(max, FLEET_MAX_PLAYERS_CEILING) : FLEET_MAX_PLAYERS_CEILING;
    return players + FLEET_TABLE_MARGIN;
  }

  /** How many players the server confirmed and nothing ended. */
  get carriedCount(): number {
    let n = 0;
    for (const p of this.table.values()) if (p.carried) n += 1;
    return n;
  }

  // ----- Sends for a carried player ------------------------------------------------------
  //
  // The realtime client's sends with the carried player first. Each resolves with the
  // sequence number it was sent under, and rejects FleetNotCarriedError, with nothing sent,
  // for a game token id this session does not carry now.

  /**
   * An actor update for one of the player's actors. The session then keeps that actor
   * present with heartbeats while it sends nothing (`actorHeartbeatMs`), until
   * {@link forgetActor} or the carry ends.
   */
  async sendActorUpdate(player: FleetId, input: SpatialInput & { state: string }): Promise<number> {
    const seq = await this.sendFor(player, (ctx, sequenceNumber) =>
      serializeActorUpdate(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
    this.touchActor(player, input.uuid, input.chunk);
    return seq;
  }

  /** A voxel edit. The player's grid permissions decide it. */
  sendVoxelUpdate(
    player: FleetId,
    input: SpatialInput & { voxel: { x: number; y: number; z: number }; voxelType: number; voxelState?: string },
  ): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) => {
      assertVoxelEdit(input);
      return serializeVoxelUpdate(ctx, { ...input, appId: this.appId, sequenceNumber });
    });
  }

  /** A client event (`eventType` and a base64 `state`). */
  sendClientEvent(player: FleetId, input: SpatialInput & { eventType: number; state: string }): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) =>
      serializeClientEvent(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
  }

  /** Spatial text. The player's tier needs `use_text_chat`. */
  sendTextPacket(player: FleetId, input: SpatialInput & { text: string }): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) =>
      serializeTextPacket(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
  }

  /** Spatial voice (base64 `audioData`). It does not keep the player from idling out. */
  sendAudioPacket(player: FleetId, input: SpatialInput & { audioData: string }): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) =>
      serializeAudioPacket(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
  }

  /** One webcam video fragment (base64 `videoData`, from `fragmentFrame`). */
  sendVideoPacket(player: FleetId, input: SpatialInput & { videoData: string }): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) =>
      serializeVideoPacket(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
  }

  /** An app-defined spatial message (base64 `payload`, at most 1,123 bytes). */
  sendGenericSpatial(player: FleetId, input: SpatialInput & { payload?: string | null }): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) =>
      serializeGenericSpatial(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
  }

  /** A direct message to one actor, named by its chunk and uuid. */
  sendSingleActorMessage(
    player: FleetId,
    input: { chunk: { x: string; y: string; z: string }; targetUuid: string; payload?: string | null },
  ): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) =>
      serializeSingleActorMessage(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
  }

  /** A channel message. */
  sendChannelMessage(player: FleetId, input: ForSession<ChannelSendInput>): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) => serializeChannelMessage(ctx, { ...input, sequenceNumber }));
  }

  /** Channel audio. */
  sendChannelAudio(player: FleetId, input: ForSession<ChannelSendInput>): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) => serializeChannelAudio(ctx, { ...input, sequenceNumber }));
  }

  /** A channel message only members within `maxDistance` chunks of `chunk` receive. */
  sendRangedChannelMessage(
    player: FleetId,
    input: ForSession<ChannelSendInput> & { chunk: { x: string; y: string; z: string }; maxDistance: number },
  ): Promise<number> {
    return this.sendFor(player, (ctx, sequenceNumber) =>
      serializeRangedChannelMessage(ctx, { ...input, appId: this.appId, sequenceNumber }),
    );
  }

  /**
   * A heartbeat for one of the player's actors, under the player's id: it keeps the actor
   * present without sending its state. The session sends these itself for actors it knows
   * from {@link sendActorUpdate}; call this for an actor it does not know, or with
   * `actorHeartbeatMs: 0`. A heartbeat is not gameplay input: it does not hold off the app's
   * idle timeout.
   */
  async sendHeartbeat(player: FleetId, actor: { chunk: { x: string; y: string; z: string }; uuid: string }): Promise<number> {
    const seq = await this.sendFor(player, (ctx, sequenceNumber) =>
      serializeActorHeartbeat(ctx, { appId: this.appId, chunk: actor.chunk, uuid: actor.uuid, sequenceNumber }),
    );
    this.touchActor(player, actor.uuid, actor.chunk);
    return seq;
  }

  /** Stop keeping one of the player's actors present. It leaves about 5 seconds later. */
  forgetActor(player: FleetId, uuid: string): void {
    this.rowOf(idString(player, 'the player gameTokenId'))?.actors.delete(uuid);
  }

  /**
   * The speakers whose spatial voice and video a carried player receives
   * (`CLIENT_MEDIA_SPEAKERS`, under the player's id). Each carried player has their own
   * lists. A changed kind is sent at once, and every list again with each periodic
   * capabilities advertisement and after the player is carried again.
   * @throws {CrowdyRealtimeError} `SPEAKER_LIST_TOO_LONG` over 32 names; {@link FleetNotCarriedError}.
   */
  async setSpeakers(player: FleetId, change: FleetSpeakerChange): Promise<void> {
    const id = idString(player, 'the player gameTokenId');
    for (const [kind, list] of [
      ['voice', change.voice],
      ['video', change.video],
    ] as const) {
      if (list && list.length > MAX_MEDIA_SPEAKERS) {
        throw new CrowdyRealtimeError(
          `A ${kind} speaker list names at most ${MAX_MEDIA_SPEAKERS} actors (got ${list.length})`,
          { code: 'SPEAKER_LIST_TOO_LONG' },
        );
      }
    }
    const row = this.rowOf(id);
    if (!row?.carried) throw new FleetNotCarriedError(id);
    // One kind a message: 32 names of each would not fit one datagram.
    if (change.voice !== undefined) {
      row.voice = change.voice ? [...change.voice] : null;
      await this.sendSpeakers(row, speakerChange(row.voice), speakerChange(undefined));
    }
    if (change.video !== undefined) {
      row.video = change.video ? [...change.video] : null;
      await this.sendSpeakers(row, speakerChange(undefined), speakerChange(row.video));
    }
  }

  private async sendSpeakers(row: Player, voice: SpeakerListChange, video: SpeakerListChange): Promise<void> {
    if (!row.carried || !this.socket) return;
    await this.sendFor(row.gameTokenId, (ctx, sequenceNumber) =>
      serializeClientMediaSpeakers(ctx, this.appId, voice, video, sequenceNumber),
    );
  }

  private async resendSpeakers(row: Player): Promise<void> {
    if (row.voice !== undefined && row.voice !== null) {
      await this.sendSpeakers(row, speakerChange(row.voice), speakerChange(undefined));
    }
    if (row.video !== undefined && row.video !== null) {
      await this.sendSpeakers(row, speakerChange(undefined), speakerChange(row.video));
    }
  }

  private touchActor(player: FleetId, uuid: string, chunk: { x: string; y: string; z: string }): void {
    const row = this.rowOf(idString(player, 'the player gameTokenId'));
    if (!row?.carried || !uuid) return;
    row.actors.set(uuid, { chunk: { x: String(chunk.x), y: String(chunk.y), z: String(chunk.z) }, lastSentAt: this.now() });
  }

  // ----- The wire ---------------------------------------------------------------------------

  private sequence(): number {
    const seq = this.nextSequence;
    this.nextSequence = (this.nextSequence + 1) & 0xff;
    return seq;
  }

  private transmit(generation: number, datagram: Uint8Array): boolean {
    const socket = this.socket;
    if (!socket || generation !== this.generation) return false;
    socket.send(datagram);
    this.counters.datagramsSent += 1;
    this.counters.bytesSent += datagram.length;
    this.counters.sentByType[datagram[0]] = (this.counters.sentByType[datagram[0]] ?? 0) + 1;
    return true;
  }

  /** A message for a carried player: the player's id in the tail, signed with the fleet token. */
  private async sendFor(
    player: FleetId,
    build: (ctx: RelaySignContext, sequenceNumber: number) => Promise<Uint8Array>,
  ): Promise<number> {
    const id = idString(player, 'the player gameTokenId');
    const row = this.rowOf(id);
    if (!row?.carried) throw new FleetNotCarriedError(id);
    if (!this.socket || this.currentStatus === 'released') {
      throw new CrowdyRealtimeError('the fleet session is not connected', { code: 'FLEET_NOT_CONNECTED', retryable: true });
    }
    const generation = this.generation;
    const seq = this.sequence();
    let ctx = row.ctx;
    let datagram = await build(ctx, seq);
    // The id the player's sends name can change while a message is being signed (a carry with
    // a refreshed token went out, or was refused): no message leaves under the id of before.
    while (row.ctx !== ctx) {
      ctx = row.ctx;
      datagram = await build(ctx, seq);
    }
    // The carry may have ended while the message was being signed.
    if (!row.carried || this.table.get(row.gameTokenId) !== row) throw new FleetNotCarriedError(id);
    if (!this.transmit(generation, datagram)) {
      throw new CrowdyRealtimeError('the fleet session is not connected', { code: 'FLEET_NOT_CONNECTED', retryable: true });
    }
    return seq;
  }

  /**
   * A message of the session's own, under its own game token id. Only four kinds exist: the
   * realtime servers answer any other `UNAUTHORIZED`.
   */
  private async sendOwn(
    type: number,
    build: (ctx: RelaySignContext, sequenceNumber: number) => Promise<Uint8Array>,
    /** Runs in the same turn as the send, just before it, when the message does go out. */
    beforeTransmit?: () => void,
  ): Promise<boolean> {
    if (!OWN_TYPES.has(type)) {
      throw new CrowdyError({ message: `a fleet session sends no message of type ${type} under its own id` });
    }
    const ctx = this.ctx;
    if (!ctx || !this.socket) return false;
    // A connection's first datagram is its capabilities: nothing else goes out before them.
    if (this.binding && type !== WireMessageType.CLIENT_CAPABILITIES) return false;
    const generation = this.generation;
    const datagram = await build(ctx, this.sequence());
    if (datagram[0] !== type) {
      throw new CrowdyError({ message: `built a message of type ${datagram[0]} where ${type} was meant` });
    }
    if (!this.socket || generation !== this.generation) return false;
    beforeTransmit?.();
    return this.transmit(generation, datagram);
  }

  private sendCapabilities(): Promise<boolean> {
    return this.sendOwn(WireMessageType.CLIENT_CAPABILITIES, (ctx, seq) =>
      serializeClientCapabilities(ctx, this.appId, this.capabilityFlags, seq, this.controlNonce ?? undefined),
    );
  }

  private sendRelease(id: string): Promise<boolean> {
    return this.sendOwn(WireMessageType.FLEET_RELEASE, (ctx, seq) =>
      serializeFleetRelease(ctx, { appId: this.appId, playerGameTokenId: id, sequenceNumber: seq }),
    );
  }

  // ----- Timed work ---------------------------------------------------------------------------

  /**
   * Do the session's timed work once: the capabilities and keepalive that are due, the
   * `FLEET_CARRY` sends and retries that are due and that the pace allows, the carries that
   * timed out, and the heartbeats of carried players' actors. The session calls this itself
   * every `tickIntervalMs`; call it yourself with `tickIntervalMs: 0`.
   */
  async tick(): Promise<void> {
    if (this.ticking || this.binding || !this.socket) return;
    if (this.currentStatus === 'closed' || this.currentStatus === 'released') return;
    this.ticking = true;
    try {
      const now = this.now();
      if (this.silenceTimeoutMs > 0 && now - this.lastHeardAt >= this.silenceTimeoutMs) {
        // Nothing verified for three capabilities intervals: the server is gone, or never took
        // the session. It may hold no carry by the time it is heard again.
        this.orderMove(true);
      }
      if (now >= this.nextCapabilitiesAt) {
        await this.sendCapabilities();
        this.nextCapabilitiesAt = now + (this.answered ? this.capabilitiesIntervalMs : this.bindRetryMs);
        // The server keeps a player's speaker lists no longer than it keeps the capabilities.
        if (this.answered) for (const row of [...this.table.values()]) await this.resendSpeakers(row);
      }
      if (now - this.lastKeepAliveAt >= this.keepAliveIntervalMs) {
        this.lastKeepAliveAt = now;
        await this.sendOwn(WireMessageType.CLIENT_ACTOR_HEARTBEAT, (ctx, seq) =>
          serializeActorHeartbeat(ctx, { appId: this.appId, sequenceNumber: seq }),
        );
      }
      await this.driveCarries(now);
      if (this.actorHeartbeatMs > 0) await this.heartbeatActors(now);
      // A replaced id's late frames arrive within seconds: a minute on, it can be forgotten.
      for (const [id, at] of this.replaced) if (now - at > 60_000) this.replaced.delete(id);
    } catch (error) {
      this.report(error);
    } finally {
      this.ticking = false;
    }
  }

  private async driveCarries(now: number): Promise<void> {
    const firsts: Player[] = [];
    const retries: Player[] = [];
    for (const row of [...this.table.values()]) {
      const attempt = row.attempt;
      if (!attempt) continue;
      if (attempt.deadline !== 0 && now >= attempt.deadline) {
        this.table.delete(row.gameTokenId);
        const ids = [row.gameTokenId];
        if (row.previous) {
          // Nothing says which of the player's two carries the server holds: neither stands.
          ids.push(row.previous.gameTokenId);
          this.aliases.delete(row.previous.gameTokenId);
          row.previous = null;
        }
        row.carried = false;
        this.settle(row, { status: 'timedOut', wireStatus: null, userId: null }, true);
        // The server may hold a carry whose answers were lost: both sides now agree it ended.
        for (const id of ids) await this.sendRelease(id);
        continue;
      }
      if (attempt.nextSendAt <= now) (attempt.deadline === 0 ? firsts : retries).push(row);
    }
    if (firsts.length === 0 && retries.length === 0) return;
    const byTurn = (a: Player, b: Player) => {
      const x = a.attempt as Attempt;
      const y = b.attempt as Attempt;
      return x.nextSendAt - y.nextSendAt || x.order - y.order;
    };
    firsts.sort(byTurn);
    retries.sort(byTurn);
    this.carrySends = this.carrySends.filter((sent) => sent.at >= now - 1_000);
    // Retries take at most half of a second's carries while first sends wait, so one lost
    // answer is asked for again before its carry times out, and a server that answers
    // nothing does not keep new players from being asked for at all.
    const retryShare = Math.max(1, Math.floor(this.maxCarriesPerSecond / 2));
    let retriesSent = this.carrySends.filter((sent) => sent.retry).length;
    while (this.carrySends.length < this.maxCarriesPerSecond) {
      const retry = retries.length > 0 && (retriesSent < retryShare || firsts.length === 0);
      const row = retry ? retries.shift() : firsts.shift();
      if (!row) break;
      const attempt = row.attempt;
      if (!attempt || this.table.get(row.gameTokenId) !== row) continue;
      // A new time for every send, later than the last one this player's carry was made for.
      const epoch = Math.max(now, row.lastCarryEpoch + 1);
      row.lastCarryEpoch = epoch;
      const carriedId = row.gameTokenId;
      const sent = await this.sendOwn(
        WireMessageType.FLEET_CARRY,
        (ctx, seq) =>
          serializeFleetCarry(ctx, {
            appId: this.appId,
            playerGameTokenId: carriedId,
            playerToken: row.token,
            epochMillis: epoch,
            sequenceNumber: seq,
          }),
        () => {
          if (attempt.noLiveToken === 'waiting') attempt.noLiveToken = 'retried';
          // A refreshed token's carry: from the moment it goes out, the player's sends name
          // the new id. The realtime server holds them behind the carry.
          if (row.previous && row.gameTokenId === carriedId && row.ctx === row.previous.ctx && this.ctx) {
            row.ctx = carriedPlayerContext(this.ctx, carriedId);
          }
        },
      );
      if (!sent) break;
      this.carrySends.push({ at: now, retry });
      if (retry) retriesSent += 1;
      attempt.nextSendAt = now + this.carryRetryMs;
      if (attempt.deadline === 0) attempt.deadline = now + this.carryTimeoutMs;
    }
  }

  private async heartbeatActors(now: number): Promise<void> {
    for (const row of [...this.table.values()]) {
      if (!row.carried) continue;
      for (const [uuid, actor] of [...row.actors]) {
        if (now - actor.lastSentAt < this.actorHeartbeatMs) continue;
        actor.lastSentAt = now;
        try {
          await this.sendFor(row.gameTokenId, (ctx, sequenceNumber) =>
            serializeActorHeartbeat(ctx, { appId: this.appId, chunk: actor.chunk, uuid, sequenceNumber }),
          );
        } catch (error) {
          if (!(error instanceof FleetNotCarriedError)) throw error;
          break;
        }
      }
    }
  }

  // ----- Receiving ------------------------------------------------------------------------------

  private onDatagram(generation: number, datagram: Uint8Array): void {
    if (generation !== this.generation) return;
    this.counters.datagramsReceived += 1;
    this.counters.bytesReceived += datagram.length;
    if (datagram.length > FLEET_MAX_DATAGRAM_BYTES) {
      this.counters.oversized += 1;
      return;
    }
    // A copy: the socket may reuse its buffer before the datagram's turn comes.
    const bytes = new Uint8Array(datagram);
    this.inbound = this.inbound
      .then(() => this.read(generation, bytes))
      .catch((error) => this.report(error));
  }

  /**
   * Resolves once every datagram received so far has been verified and its handlers have
   * run: what to wait for before `close()` when nothing received may be lost.
   */
  settled(): Promise<void> {
    return this.inbound;
  }

  private async read(generation: number, datagram: Uint8Array): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || generation !== this.generation) return;
    const parsed = await parseFleetDatagram(ctx, datagram, { controlNonce: this.controlNonce });
    if (generation !== this.generation) return;
    this.counters.hmacFailures += parsed.hmacFailures;
    this.counters.malformed += parsed.malformed;
    this.counters.unsigned += parsed.unsigned;
    this.counters.staleControl += parsed.staleControl;
    for (const message of parsed.messages) {
      if (generation !== this.generation) return;
      if (!(message.kind === 'notification' && !message.verified)) {
        this.lastHeardAt = this.now();
        if (!this.answered) {
          this.answered = true;
          this.nextCapabilitiesAt = this.lastHeardAt + this.capabilitiesIntervalMs;
          this.setStatus('connected');
        }
      }
      await this.handle(message);
    }
  }

  private async handle(message: FleetInbound): Promise<void> {
    switch (message.kind) {
      case 'controlBoundAck':
        this.boundAcked = true;
        this.counters.boundControlAcks += 1;
        return;
      case 'reconnect':
        if (!message.bound && this.boundAcked) {
          // This server sends only the bound form: one without the nonce was captured earlier.
          this.counters.staleControl += 1;
          return;
        }
        this.orderMove(false);
        return;
      case 'sessionReleased':
        if (!message.bound && this.boundAcked) {
          this.counters.staleControl += 1;
          return;
        }
        this.onSessionReleased(message.reason);
        return;
      case 'carryResult':
        await this.onCarryResult(message.playerGameTokenId, message.userId, message.status);
        return;
      case 'released':
        this.onReleased(message.playerGameTokenId, message.reason);
        return;
      case 'delivery':
        this.dispatch(message.notification, message.players);
        return;
      case 'notification':
        if (message.notification.__typename === 'GenericErrorResponse') {
          // A refusal of one send changes no state here, whatever its code. TOKEN_EXPIRED is
          // about the token of the player the send named, and FLEET_RELEASED follows it; the
          // signed word that the session's own token expired is COMMAND_SESSION_RELEASED.
          this.dispatchError(message.notification, message.verified);
          return;
        }
        if (!message.verified) {
          // The codec returns state only verified. Should that ever change, a session still
          // gives no handler a notification the realtime server did not sign.
          this.counters.unsigned += 1;
          return;
        }
        this.dispatch(message.notification, null);
        return;
    }
  }

  /**
   * The session needs a refresh before anything else: the server asked it to move, or went
   * quiet. `carriesLost` when the server may hold no carry.
   */
  private orderMove(carriesLost: boolean): void {
    if (carriesLost) this.carriesLost = true;
    if (this.moveWasOrdered) return;
    this.moveWasOrdered = true;
    this.call(() => this.handlers.moveOrdered?.());
  }

  private onSessionReleased(reason: number): void {
    // The server answers this session no more, and its carries ended unannounced.
    this.carriesLost = true;
    this.moveWasOrdered = true;
    for (const row of this.table.values()) {
      row.carried = false;
      if (row.attempt) {
        row.attempt.nextSendAt = Number.POSITIVE_INFINITY;
        row.attempt.deadline = 0;
      }
    }
    this.setStatus('released');
    this.call(() => this.handlers.sessionReleased?.(reason));
  }

  private async onCarryResult(id: string, userId: string, status: number): Promise<void> {
    if (this.aliases.has(id) || (this.replaced.has(id) && !this.table.has(id))) {
      // A late answer about a token the player's newer one replaced, or is replacing.
      this.counters.replacedIdFrames += 1;
      return;
    }
    const row = this.table.get(id);
    if (!row) {
      this.counters.unmatchedCarryResults += 1;
      // The server carries a player this session let go meanwhile: say so again.
      if (status === FleetCarryStatus.CARRIED && this.socket) await this.sendRelease(id);
      return;
    }
    const attempt = row.attempt;
    if (!attempt) {
      // An answer to a carry sent twice: the first one settled it.
      if (status !== FleetCarryStatus.CARRIED || !row.carried) this.counters.unmatchedCarryResults += 1;
      return;
    }
    if (status === FleetCarryStatus.NO_LIVE_TOKEN && attempt.noLiveToken !== 'retried') {
      // A token minted or refreshed a moment ago may not have reached this server yet: ask
      // once more, with a new time and proof. Answers to carries sent before that one wait.
      if (attempt.noLiveToken === 'none') {
        attempt.noLiveToken = 'waiting';
        attempt.nextSendAt = this.now() + this.carryRetryMs;
        this.counters.noLiveTokenRetries += 1;
      }
      return;
    }
    if (status !== FleetCarryStatus.CARRIED) {
      const refusal = { status: CARRY_OUTCOMES[status] ?? 'refused', wireStatus: status, userId: null } as const;
      const previous = row.previous;
      if (previous) {
        // The refreshed token's carry was refused: the carry under the old id stands.
        this.table.delete(id);
        this.aliases.delete(previous.gameTokenId);
        this.retire(id);
        this.settle(row, refusal, true);
        row.gameTokenId = previous.gameTokenId;
        row.token = previous.token;
        row.ctx = previous.ctx;
        row.previous = null;
        if (previous.ended === null && row.carried) {
          this.table.set(row.gameTokenId, row);
          return;
        }
        // Unless the server said meanwhile that it ended: then the player is carried no more.
        if (row.carried) {
          row.carried = false;
          const reason = previous.ended ?? 0;
          this.call(() => this.handlers.released?.({ playerGameTokenId: row.gameTokenId, userId: row.userId, reason }));
        }
        return;
      }
      const wasCarried = row.carried;
      row.carried = false;
      this.table.delete(id);
      this.settle(row, refusal, true);
      // The carry that stood before this one was refused is let go, so both sides agree.
      if (wasCarried && this.socket) await this.sendRelease(id);
      return;
    }
    row.carried = true;
    const previous = row.previous;
    if (previous) {
      // The new carry took effect: the old id names nothing now, and its late frames are ignored.
      this.aliases.delete(previous.gameTokenId);
      this.retire(previous.gameTokenId);
      row.previous = null;
      if (this.ctx) row.ctx = carriedPlayerContext(this.ctx, row.gameTokenId);
      if (row.userId !== null && row.userId !== userId) {
        // `replaces` named another player. That player's carry still stands on the server
        // under the old id, with nobody here to send for it: let it go.
        this.report(
          new CrowdyError({
            message: `carry: replaces named game token id ${previous.gameTokenId}, which is another player's; that player was released`,
          }),
        );
        this.replaced.delete(previous.gameTokenId);
        row.actors.clear();
        row.voice = undefined;
        row.video = undefined;
        if (this.socket) await this.sendRelease(previous.gameTokenId);
      }
    }
    row.userId = userId;
    // The carry belongs to the player: a row the same user had under an older token is replaced.
    for (const other of [...this.table.values()]) {
      if (other === row || other.userId !== userId) continue;
      this.table.delete(other.gameTokenId);
      this.retire(other.gameTokenId);
      if (other.previous) {
        this.aliases.delete(other.previous.gameTokenId);
        this.retire(other.previous.gameTokenId);
      }
      for (const [uuid, actor] of other.actors) if (!row.actors.has(uuid)) row.actors.set(uuid, actor);
      if (row.voice === undefined) row.voice = other.voice;
      if (row.video === undefined) row.video = other.video;
      this.settle(other, { status: 'released', wireStatus: null, userId: null }, false);
    }
    this.settle(row, { status: 'carried', wireStatus: status, userId }, true);
    await this.resendSpeakers(row);
  }

  private onReleased(id: string, reason: number): void {
    const moved = this.aliases.get(id);
    if (moved !== undefined) {
      // The carry under the old id ended while the refreshed token's carry waits. The player
      // is not dropped: the new carry's answer decides, and remembers this if it is refused.
      const waiting = this.table.get(moved);
      if (waiting?.previous) waiting.previous.ended = reason;
      this.counters.replacedIdFrames += 1;
      return;
    }
    if (this.replaced.has(id) && !this.table.has(id)) {
      this.counters.replacedIdFrames += 1;
      return;
    }
    const row = this.table.get(id);
    if (!row) return;
    const wasCarried = row.carried;
    row.carried = false;
    // A carry sent since then is still waiting for its own answer.
    if (!row.attempt) this.table.delete(id);
    if (wasCarried) {
      this.call(() => this.handlers.released?.({ playerGameTokenId: id, userId: row.userId, reason }));
    }
  }

  /** End a row's waiting carry, if it has one, and tell whoever waits. */
  private settle(
    row: Player,
    outcome: { status: FleetCarryOutcome; wireStatus: number | null; userId: string | null },
    announce: boolean,
  ): void {
    const attempt = row.attempt;
    if (!attempt) return;
    row.attempt = null;
    const result: FleetCarryResult = {
      playerGameTokenId: row.gameTokenId,
      userId: outcome.userId,
      status: outcome.status,
      wireStatus: outcome.wireStatus,
      carried: outcome.status === 'carried',
    };
    for (const resolve of attempt.resolvers) resolve(result);
    if (announce) this.call(() => this.handlers.carryResult?.(result));
  }

  /** A refusal of one send. It reaches the handler either way, with whether it was verified. */
  private dispatchError(notification: Notified<'genericError'>, verified: boolean): void {
    this.counters.errorsReceived += 1;
    if ((notification.errorCode as string) === 'UNAUTHORIZED') this.counters.unauthorizedReceived += 1;
    if (!verified) this.counters.unverifiedErrorsReceived += 1;
    this.call(() => this.handlers.genericError?.(notification, verified));
  }

  /** A verified notification, and the players it is for. */
  private dispatch(notification: UdpNotification, players: FleetPlayers): void {
    const h = this.handlers;
    // A refusal inside a FLEET_DELIVERY is not a thing the servers send, and the codec
    // refuses one; it has no handler here.
    if (notification.__typename === 'GenericErrorResponse') return;
    // The session is in one app. A notification that names another is not this session's,
    // even verified: it reaches no handler. (A channel notification names no app.)
    const app = (notification as { appId?: unknown }).appId;
    if (typeof app === 'string' && app !== this.grant.appId) {
      this.counters.wrongApp += 1;
      return;
    }
    this.call(() => h.any?.(notification, players));
    this.call(() => {
      switch (notification.__typename) {
        case 'ActorUpdateNotification':
          return h.actorUpdate?.(notification, players);
        case 'VoxelUpdateNotification':
          return h.voxelUpdate?.(notification, players);
        case 'ActorLeftNotification':
          return h.actorLeft?.(notification, players);
        case 'ChunkChangedNotification':
          return h.chunkChanged?.(notification, players);
        case 'ClientEventNotification':
          return h.clientEvent?.(notification, players);
        case 'ServerEventNotification':
          return h.serverEvent?.(notification, players);
        case 'GenericSpatialNotification':
          return h.genericSpatial?.(notification, players);
        case 'ClientAudioNotification':
          return h.audio?.(notification, players);
        case 'ClientVideoNotification':
          return h.video?.(notification, players);
        case 'ClientTextNotification':
          return h.text?.(notification, players);
        case 'SingleActorMessageNotification':
          return h.singleActorMessage?.(notification, players);
        case 'ChannelMessageNotification':
          return h.channelMessage?.(notification, players);
        case 'ChannelAudioNotification':
          return h.channelAudio?.(notification, players);
        default:
          return undefined;
      }
    });
  }

  private setStatus(status: FleetSessionStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.call(() => this.handlers.status?.(status));
  }

  private call(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.report(error);
    }
  }

  private report(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    this.logger?.warn?.('fleet session', failure);
    try {
      this.handlers.error?.(failure);
    } catch {
      /* the error handler's own failure has nowhere to go */
    }
  }
}

function expiryOf(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) ? at : null;
}
