import type { GraphQLClient } from '../client.js';

export interface PlayerMeshArtifactMeta {
  appId: string;
  gridId: string;
  projectId: string;
  artifactHash: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
  artifactBase64?: string | null;
}

const META_FIELDS = `
  appId
  gridId
  projectId
  artifactHash
  name
  sizeBytes
  contentType
  createdAt
`;

/**
 * Player-uploaded glTF meshes stored by SHA-256 on an owned grid.
 * Exposed as `client.meshArtifacts`. Bytes never ride host_call JSON.
 */
export class MeshArtifactsAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  async upload(input: {
    appId: string;
    gridId: string;
    projectId: string;
    name: string;
    artifactBase64: string;
  }): Promise<PlayerMeshArtifactMeta> {
    const data = await this.graphql.query<{
      playerMeshUpload: PlayerMeshArtifactMeta;
    }>(
      `mutation PlayerMeshUpload($input: UploadPlayerMeshInput!) {
         playerMeshUpload(input: $input) {
           ${META_FIELDS}
           artifactBase64
         }
       }`,
      { input },
    );
    return data.playerMeshUpload;
  }

  async list(variables: {
    appId: string;
    gridId: string;
    projectId: string;
  }): Promise<PlayerMeshArtifactMeta[]> {
    const data = await this.graphql.query<{
      playerMeshArtifacts: PlayerMeshArtifactMeta[];
    }>(
      `query PlayerMeshArtifacts($appId: BigInt!, $gridId: BigInt!, $projectId: String!) {
         playerMeshArtifacts(appId: $appId, gridId: $gridId, projectId: $projectId) {
           ${META_FIELDS}
         }
       }`,
      variables,
    );
    return data.playerMeshArtifacts;
  }

  async artifact(variables: {
    appId: string;
    gridId: string;
    artifactHash: string;
  }): Promise<PlayerMeshArtifactMeta> {
    const data = await this.graphql.query<{
      playerMeshArtifact: PlayerMeshArtifactMeta;
    }>(
      `query PlayerMeshArtifact($appId: BigInt!, $gridId: BigInt!, $artifactHash: String!) {
         playerMeshArtifact(appId: $appId, gridId: $gridId, artifactHash: $artifactHash) {
           ${META_FIELDS}
           artifactBase64
         }
       }`,
      variables,
    );
    return data.playerMeshArtifact;
  }

  async artifactBytes(variables: {
    appId: string;
    gridId: string;
    artifactHash: string;
  }): Promise<{
    bytes: ArrayBuffer;
    artifactHash: string;
    name: string;
    contentType: string;
  }> {
    const a = await this.artifact(variables);
    const encoded = a.artifactBase64 ?? '';
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return {
      bytes: bytes.buffer,
      artifactHash: a.artifactHash,
      name: a.name,
      contentType: a.contentType,
    };
  }
}
