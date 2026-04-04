/**
 * Core GraphQL client for HTTP queries and mutations
 */

import type {
  AuthResponse,
  UdpProxyConnectionStatus,
  ActorUpdateRequestInput,
  VoxelUpdateRequestInput,
  ClientAudioPacketInput,
  ClientTextPacketInput,
  ClientEventNotificationInput,
} from './types.js';

export class GraphQLClient {
  private token: string | null = null;
  private graphqlEndpoint: string;
  private timeout: number;

  constructor(config: { graphqlEndpoint?: string; timeout?: number } = {}) {
    this.graphqlEndpoint = config.graphqlEndpoint || 'http://localhost:3000/graphql';
    this.timeout = config.timeout || 60000;
  }

  setAuthToken(token: string | null): void {
    this.token = token;
  }

  getAuthToken(): string | null {
    return this.token;
  }

  async query<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const requestBody = { query, variables };
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const result = await response.json();

      if (result.errors) {
        const error = result.errors[0];
        const errorMessage = Array.isArray(error.message)
          ? error.message.join(', ')
          : error.message;
        console.error('GraphQL error:', error);
        throw new Error(errorMessage);
      }

      return result.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout exceeded when trying to connect');
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Network error: ${error}`);
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await this.query<{ login: AuthResponse }>(
      `
      mutation Login($input: LoginUserInput!) {
        login(loginUserInput: $input) {
          token
          gameTokenId
          user {
            userId
            email
            gamertag
          }
        }
      }
    `,
      {
        input: { email, password },
      }
    );

    if (data.login?.token) {
      this.setAuthToken(data.login.token);
      return data.login;
    }
    throw new Error('Login failed');
  }

  async register(email: string, password: string, gamertag?: string): Promise<AuthResponse> {
    const data = await this.query<{ register: AuthResponse }>(
      `
      mutation Register($input: RegisterUserInput!) {
        register(registerUserInput: $input) {
          token
          gameTokenId
          user {
            userId
            email
            gamertag
          }
        }
      }
    `,
      {
        input: { email, password, gamertag },
      }
    );

    if (data.register?.token) {
      this.setAuthToken(data.register.token);
      return data.register;
    }
    throw new Error('Registration failed');
  }

  async connectUdpProxy(): Promise<UdpProxyConnectionStatus> {
    const data = await this.query<{ connectUdpProxy: UdpProxyConnectionStatus }>(
      `
      mutation ConnectUdpProxy {
        connectUdpProxy(input: { _placeholder: true }) {
          connected
          serverIp6
          serverClientPort
          lastMessageTime
        }
      }
    `
    );
    return data.connectUdpProxy;
  }

  async disconnectUdpProxy(): Promise<boolean> {
    const data = await this.query<{ disconnectUdpProxy: boolean }>(
      `
      mutation DisconnectUdpProxy {
        disconnectUdpProxy
      }
    `
    );
    return data.disconnectUdpProxy;
  }

  async getConnectionStatus(): Promise<UdpProxyConnectionStatus> {
    const data = await this.query<{ udpProxyConnectionStatus: UdpProxyConnectionStatus }>(
      `
      query GetConnectionStatus {
        udpProxyConnectionStatus {
          connected
          serverIp6
          serverClientPort
          lastMessageTime
        }
      }
    `
    );
    return data.udpProxyConnectionStatus;
  }

  async sendActorUpdate(input: ActorUpdateRequestInput): Promise<boolean> {
    const normalizedInput = {
      mapId: String(Number(input.mapId)),
      chunk: {
        x: String(Number(input.chunk.x)),
        y: String(Number(input.chunk.y)),
        z: String(Number(input.chunk.z)),
      },
      uuid: String(input.uuid),
      state: String(input.state),
      distance: input.distance ?? 8,
      decayRate: input.decayRate ?? 1,
      ...(input.sequenceNumber != null && { sequenceNumber: input.sequenceNumber }),
    };

    const data = await this.query<{ sendActorUpdate: boolean }>(
      `
      mutation SendActorUpdate($input: ActorUpdateRequestInput!) {
        sendActorUpdate(input: $input)
      }
    `,
      { input: normalizedInput }
    );
    return data.sendActorUpdate;
  }

  async sendVoxelUpdate(input: VoxelUpdateRequestInput): Promise<boolean> {
    const normalizedInput = {
      mapId: String(Number(input.mapId)),
      chunk: {
        x: String(Number(input.chunk.x)),
        y: String(Number(input.chunk.y)),
        z: String(Number(input.chunk.z)),
      },
      uuid: String(input.uuid),
      voxel: input.voxel,
      voxelType: input.voxelType,
      voxelState: String(input.voxelState),
      distance: input.distance ?? 8,
      decayRate: input.decayRate ?? 0,
      ...(input.sequenceNumber != null && { sequenceNumber: input.sequenceNumber }),
    };

    const data = await this.query<{ sendVoxelUpdate: boolean }>(
      `
      mutation SendVoxelUpdate($input: VoxelUpdateRequestInput!) {
        sendVoxelUpdate(input: $input)
      }
    `,
      { input: normalizedInput }
    );
    return data.sendVoxelUpdate;
  }

  async sendAudioPacket(input: ClientAudioPacketInput): Promise<boolean> {
    const normalizedInput = {
      mapId: String(Number(input.mapId)),
      chunk: {
        x: String(Number(input.chunk.x)),
        y: String(Number(input.chunk.y)),
        z: String(Number(input.chunk.z)),
      },
      uuid: String(input.uuid),
      audioData: String(input.audioData),
      distance: input.distance ?? 1,
      decayRate: input.decayRate ?? 0,
      ...(input.sequenceNumber != null && { sequenceNumber: input.sequenceNumber }),
    };

    const data = await this.query<{ sendAudioPacket: boolean }>(
      `
      mutation SendAudioPacket($input: ClientAudioPacketInput!) {
        sendAudioPacket(input: $input)
      }
    `,
      { input: normalizedInput }
    );
    return data.sendAudioPacket;
  }

  async sendTextPacket(input: ClientTextPacketInput): Promise<boolean> {
    const normalizedInput = {
      mapId: String(Number(input.mapId)),
      chunk: {
        x: String(Number(input.chunk.x)),
        y: String(Number(input.chunk.y)),
        z: String(Number(input.chunk.z)),
      },
      uuid: String(input.uuid),
      text: String(input.text),
      distance: input.distance ?? 1,
      decayRate: input.decayRate ?? 0,
      ...(input.sequenceNumber != null && { sequenceNumber: input.sequenceNumber }),
    };

    const data = await this.query<{ sendTextPacket: boolean }>(
      `
      mutation SendTextPacket($input: ClientTextPacketInput!) {
        sendTextPacket(input: $input)
      }
    `,
      { input: normalizedInput }
    );
    return data.sendTextPacket;
  }

  async sendClientEvent(input: ClientEventNotificationInput): Promise<boolean> {
    const normalizedInput = {
      mapId: String(Number(input.mapId)),
      chunk: {
        x: String(Number(input.chunk.x)),
        y: String(Number(input.chunk.y)),
        z: String(Number(input.chunk.z)),
      },
      uuid: String(input.uuid),
      eventType: input.eventType,
      state: String(input.state),
      distance: input.distance ?? 8,
      decayRate: input.decayRate ?? 0,
      ...(input.sequenceNumber != null && { sequenceNumber: input.sequenceNumber }),
    };

    const data = await this.query<{ sendClientEvent: boolean }>(
      `
      mutation SendClientEvent($input: ClientEventNotificationInput!) {
        sendClientEvent(input: $input)
      }
    `,
      { input: normalizedInput }
    );
    return data.sendClientEvent;
  }
}

