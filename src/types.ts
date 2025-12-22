/**
 * Type definitions for Crowded Kingdoms SDK
 */

// BigInt is represented as string in GraphQL
export type BigInt = string;

// Chunk coordinates
export interface ChunkCoordinates {
  x: BigInt;
  y: BigInt;
  z: BigInt;
}

export interface ChunkCoordinatesInput {
  x: BigInt;
  y: BigInt;
  z: BigInt;
}

// Voxel coordinates
export interface VoxelCoordinates {
  x: number;
  y: number;
  z: number;
}

export interface VoxelCoordinatesInput {
  x: number;
  y: number;
  z: number;
}

// Error codes
export enum UdpErrorCode {
  NO_ERROR = 'NO_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  EMAIL_NOT_FOUND = 'EMAIL_NOT_FOUND',
  BAD_PASSWORD = 'BAD_PASSWORD',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  INVALID_TOKEN = 'INVALID_TOKEN',
  MAP_NOT_FOUND = 'MAP_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  MAP_NOT_LOADED = 'MAP_NOT_LOADED',
  EMAIL_TOO_SHORT = 'EMAIL_TOO_SHORT',
  EMAIL_TOO_LONG = 'EMAIL_TOO_LONG',
  PASSWORD_TOO_SHORT = 'PASSWORD_TOO_SHORT',
  PASSWORD_TOO_LONG = 'PASSWORD_TOO_LONG',
  GAME_TOKEN_WRONG_SIZE = 'GAME_TOKEN_WRONG_SIZE',
  NAME_TOO_LONG = 'NAME_TOO_LONG',
  INVALID_REQUEST = 'INVALID_REQUEST',
  EMAIL_INVALID = 'EMAIL_INVALID',
  INVALID_TOKEN_LENGTH = 'INVALID_TOKEN_LENGTH',
  INVALID_MAP_ID = 'INVALID_MAP_ID',
  CHUNK_NOT_FOUND = 'CHUNK_NOT_FOUND',
  USER_NOT_AUTHENTICATED = 'USER_NOT_AUTHENTICATED',
  INVALID_STATE_DATA = 'INVALID_STATE_DATA',
  USER_NOT_APP_ADMIN = 'USER_NOT_APP_ADMIN',
  GRID_OUTSIDE_ASSIGNMENT = 'GRID_OUTSIDE_ASSIGNMENT',
  NO_MATCHING_GRID_ASSIGNMENT = 'NO_MATCHING_GRID_ASSIGNMENT',
  INVALID_GRID_COORDINATES = 'INVALID_GRID_COORDINATES',
  GRID_ALREADY_EXISTS = 'GRID_ALREADY_EXISTS',
  GRID_OVERLAPS_EXISTING = 'GRID_OVERLAPS_EXISTING',
  GAMERTAG_ALREADY_EXISTS = 'GAMERTAG_ALREADY_EXISTS',
}

// User types
export interface User {
  userId: BigInt;
  email: string;
  gamertag?: string;
  disambiguation?: string;
  state?: string;
  isConfirmed: boolean;
  createdAt: string;
  grantEarlyAccess: boolean;
  grantEarlyAccessOverride: boolean;
}

export interface AuthResponse {
  token: string;
  gameTokenId: string;
  user: User;
}

// UDP Proxy Connection Status
export interface UdpProxyConnectionStatus {
  connected: boolean;
  serverIp6?: string;
  serverClientPort?: number;
  lastMessageTime?: string;
}

// Actor Update Request
export interface ActorUpdateRequestInput {
  mapId: BigInt;
  modId: BigInt;
  chunk: ChunkCoordinatesInput;
  uuid: string;
  state: string; // Base64-encoded 96-byte binary data
}

// Voxel Update Request
export interface VoxelUpdateRequestInput {
  mapId: BigInt;
  modId: BigInt;
  chunk: ChunkCoordinatesInput;
  voxel: VoxelCoordinatesInput;
  voxelType: number;
  voxelState: string; // Base64-encoded 24-byte binary data
}

// Client Audio Packet
export interface ClientAudioPacketInput {
  mapId: BigInt;
  modId: BigInt;
  chunk: ChunkCoordinatesInput;
  uuid: string;
  audioData: string; // Base64-encoded compressed audio
}

// Client Text Packet
export interface ClientTextPacketInput {
  mapId: BigInt;
  modId: BigInt;
  chunk: ChunkCoordinatesInput;
  uuid: string;
  text: string;
}

// Client Event Notification
export interface ClientEventNotificationInput {
  mapId: BigInt;
  modId: BigInt;
  chunk: ChunkCoordinatesInput;
  uuid: string;
  eventType: number;
  state: string; // Base64-encoded event state
}

// Notification Types (from GraphQL union)
export interface ActorUpdateNotification {
  __typename: 'ActorUpdateNotification';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  uuid: string;
  state: string; // Base64-encoded 96-byte binary data
  modId: BigInt;
}

export interface ActorUpdateResponse {
  __typename: 'ActorUpdateResponse';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  uuid: string;
  errorCode: UdpErrorCode;
  modId: BigInt;
}

export interface VoxelUpdateNotification {
  __typename: 'VoxelUpdateNotification';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  voxelX: number;
  voxelY: number;
  voxelZ: number;
  voxelType: number;
  voxelState: string; // Base64-encoded 24-byte binary data
  modId: BigInt;
}

export interface VoxelUpdateResponse {
  __typename: 'VoxelUpdateResponse';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  voxelX: number;
  voxelY: number;
  voxelZ: number;
  errorCode: UdpErrorCode;
  modId: BigInt;
}

export interface ClientAudioNotification {
  __typename: 'ClientAudioNotification';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  uuid: string;
  audioData: string; // Base64-encoded compressed audio
  modId: BigInt;
}

export interface ClientTextNotification {
  __typename: 'ClientTextNotification';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  uuid: string;
  text: string;
  modId: BigInt;
}

export interface ClientEventNotification {
  __typename: 'ClientEventNotification';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  uuid: string;
  eventType: number;
  state: string; // Base64-encoded event state
  modId: BigInt;
}

export interface ServerEventNotification {
  __typename: 'ServerEventNotification';
  mapId: BigInt;
  chunkX: BigInt;
  chunkY: BigInt;
  chunkZ: BigInt;
  uuid: string;
  eventType: number;
  state: string; // Base64-encoded event state
  modId: BigInt;
}

// Union type for all notifications
export type UdpNotification =
  | ActorUpdateNotification
  | ActorUpdateResponse
  | VoxelUpdateNotification
  | VoxelUpdateResponse
  | ClientAudioNotification
  | ClientTextNotification
  | ClientEventNotification
  | ServerEventNotification;

// Client Configuration
export interface CrowdyClientConfig {
  graphqlEndpoint?: string;
  wsEndpoint?: string;
  timeout?: number;
}

// Handler types
export type ActorUpdateHandler = (notification: ActorUpdateNotification) => void;
export type ActorUpdateResponseHandler = (response: ActorUpdateResponse) => void;
export type VoxelUpdateHandler = (notification: VoxelUpdateNotification) => void;
export type VoxelUpdateResponseHandler = (response: VoxelUpdateResponse) => void;
export type ClientAudioHandler = (notification: ClientAudioNotification) => void;
export type ClientTextHandler = (notification: ClientTextNotification) => void;
export type ClientEventHandler = (notification: ClientEventNotification) => void;
export type ServerEventHandler = (notification: ServerEventNotification) => void;

// Unsubscribe function
export type UnsubscribeFn = () => void;

