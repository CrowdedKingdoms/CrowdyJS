/**
 * `@crowdedkingdoms/crowdyjs/fleet`: a fleet session for an organization's own game servers.
 *
 * A fleet session is one realtime session a game server opens for itself, in which it
 * carries the players who are on it. It talks to the realtime server over UDP
 * (`node:dgram`), so this entry point is for Node and is kept out of the root entry: no
 * browser bundle imports it. Importing it where `node:dgram` does not exist throws.
 *
 * **Security: an org token and a fleet token never go into a browser page or a game
 * client.** They stay on a server your organization runs. The fleet token signs for every
 * player the session carries; a game on a player's device uses that player's own app token.
 *
 * The Application API's part (open, refresh, close, with the org token) is
 * `client.fleetSessions` in the root entry, and the hub connection is
 * `client.exec.connectAsServer`.
 */
import { assertFleetRuntime } from './socket.js';

assertFleetRuntime();

export {
  FleetSession,
  FleetNotCarriedError,
  FLEET_TABLE_MARGIN,
  KEEPALIVE_ANSWER_WAIT_MS,
  NOT_PRESENT_IDLE_MS,
  type ActorNotPresent,
  type NotPresentEnd,
  type FleetSessionConfig,
  type FleetSessionGrant,
  type FleetSessionStatus,
  type FleetSessionStats,
  type FleetHandlers,
  type FleetPlayers,
  type FleetPlayer,
  type FleetPlayerToken,
  type FleetCarryOutcome,
  type FleetCarryResult,
  type FleetReleased,
  type FleetSpeakerChange,
} from './session.js';
export {
  nodeFleetSocket,
  type FleetServer,
  type FleetSocket,
  type FleetSocketEvents,
  type FleetSocketFactory,
  type NodeFleetSocketOptions,
} from './socket.js';
export {
  FLEET_MAX_DATAGRAM_BYTES,
  FLEET_MAX_DELIVERY_PLAYERS,
  FLEET_TOKEN_CHARS,
  FLEET_CARRY_PROOF_LABEL,
  FLEET_CARRY_CLOCK_TOLERANCE_MS,
  FLEET_CARRY_PAYLOAD_BYTES,
  FLEET_CARRY_RESULT_BYTES,
  FLEET_RELEASED_BYTES,
  FleetCarryStatus,
  FleetReleaseReason,
  SessionReleaseReason,
  createFleetSignContext,
  carriedPlayerContext,
  fleetCarryProof,
  serializeFleetCarry,
  serializeFleetRelease,
  parseFleetCarryResult,
  parseFleetReleased,
  parseFleetDelivery,
  parseFleetDatagram,
  type FleetId,
  type FleetCarryInput,
  type FleetCarryResultFrame,
  type FleetReleasedFrame,
  type FleetDeliveryFrame,
  type FleetInbound,
  type FleetDatagram,
  type FleetParseOptions,
} from '../fleet-wire.js';
