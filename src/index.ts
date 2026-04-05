/**
 * CrowdyJS SDK - Client SDK for Crowded Kingdoms GraphQL API
 */

export const VERSION = '1.0.3';
console.log(`CrowdyJS v${VERSION}`);

export { CrowdyClient } from './crowdy-client.js';
export type {
  // Configuration
  CrowdyClientConfig,
  // Types
  BigInt,
  ChunkCoordinates,
  ChunkCoordinatesInput,
  VoxelCoordinates,
  VoxelCoordinatesInput,
  UdpErrorCode,
  User,
  AuthResponse,
  UdpProxyConnectionStatus,
  // Request Inputs
  ActorUpdateRequestInput,
  VoxelUpdateRequestInput,
  ClientAudioPacketInput,
  ClientTextPacketInput,
  ClientEventNotificationInput,
  // Notifications
  ActorUpdateNotification,
  ActorUpdateResponse,
  VoxelUpdateNotification,
  VoxelUpdateResponse,
  ClientAudioNotification,
  ClientTextNotification,
  ClientEventNotification,
  ServerEventNotification,
  GenericErrorResponse,
  UdpNotification,
  // Handlers
  ActorUpdateHandler,
  ActorUpdateResponseHandler,
  VoxelUpdateHandler,
  VoxelUpdateResponseHandler,
  ClientAudioHandler,
  ClientTextHandler,
  ClientEventHandler,
  ServerEventHandler,
  GenericErrorHandler,
  UnsubscribeFn,
} from './types.js';

