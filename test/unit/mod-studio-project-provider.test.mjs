import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSdk } from '../helpers.mjs';

const dto = {
  projectId: '11111111-1111-4111-8111-111111111111',
  appId: '1',
  ownerUserId: '7',
  gridId: '2',
  name: 'Tools',
  description: null,
  serverModuleName: 'tools-server',
  clientModuleName: 'tools-client',
  pairingPreference: 'PAIRED',
  sdkVersion: '0.1.5',
  abiVersion: 0,
  revision: '1',
  archived: false,
  archivedAt: null,
  fileCount: 2,
  totalBytes: '28',
  createdAt: '2026-07-23T00:00:00Z',
  updatedAt: '2026-07-23T00:00:00Z',
  files: [
    {
      target: 'SERVER',
      path: 'src/lib.rs',
      content: 'fn server() {}',
      revision: '1',
      provenance: 'AUTHORED',
      provenanceLibraryFileId: null,
      provenanceLibraryRevision: null,
      provenanceCommonVersionId: null,
      createdAt: '2026-07-23T00:00:00Z',
      updatedAt: '2026-07-23T00:00:00Z',
    },
    {
      target: 'CLIENT',
      path: 'src/lib.rs',
      content: 'fn client() {}',
      revision: '1',
      provenance: 'AUTHORED',
      provenanceLibraryFileId: null,
      provenanceLibraryRevision: null,
      provenanceCommonVersionId: null,
      createdAt: '2026-07-23T00:00:00Z',
      updatedAt: '2026-07-23T00:00:00Z',
    },
  ],
};

test('playerCodeProjects maps the generated Game API contract', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({ httpUrl: 'https://game.invalid' });
  const calls = [];
  client.graphql.request = async (operation, variables) => {
    const name = operationName(operation);
    calls.push({ name, variables });
    if (name === 'PlayerCodeProjects') {
      return {
        playerCodeProjects: [
          {
            projectId: dto.projectId,
            gridId: dto.gridId,
            name: dto.name,
            serverModuleName: dto.serverModuleName,
            clientModuleName: dto.clientModuleName,
            pairingPreference: dto.pairingPreference,
            revision: dto.revision,
            archived: false,
            updatedAt: dto.updatedAt,
          },
        ],
      };
    }
    if (name === 'PlayerCodeProject') {
      return { playerCodeProject: dto };
    }
    if (name === 'PlayerCodeProjectCreate') {
      return { playerCodeProjectCreate: dto };
    }
    if (name === 'PlayerCodeProjectSave') {
      return {
        playerCodeProjectSave: {
          ...dto,
          revision: '2',
          name: variables.input.name,
        },
      };
    }
    if (name === 'PlayerCodeLibraryFiles') {
      return {
        playerCodeLibraryFiles: [
          {
            libraryFileId: '22222222-2222-4222-8222-222222222222',
            appId: '1',
            ownerUserId: '7',
            title: 'Math',
            pathHint: 'src/math.rs',
            target: 'SERVER',
            tags: ['math'],
            content: 'pub fn sum() {}',
            revision: '1',
            archived: false,
            archivedAt: null,
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt,
          },
        ],
      };
    }
    if (name === 'PlayerCodeLibrarySave') {
      return {
        playerCodeLibrarySave: {
          libraryFileId: '55555555-5555-4555-8555-555555555555',
          appId: '1',
          ownerUserId: '7',
          title: variables.input.title,
          pathHint: variables.input.pathHint,
          target: variables.input.target,
          tags: variables.input.tags,
          content: variables.input.content,
          revision: '1',
          archived: false,
          archivedAt: null,
          createdAt: dto.createdAt,
          updatedAt: dto.updatedAt,
        },
      };
    }
    if (name === 'PlayerCodeProjectImportFile') {
      return {
        playerCodeProjectImportFile: {
          ...dto,
          revision: '3',
          files: [
            ...dto.files,
            {
              ...dto.files[0],
              path: 'src/common.rs',
              content: 'pub fn common() {}',
              provenance: 'COMMON',
              provenanceCommonVersionId:
                '44444444-4444-4444-8444-444444444444',
            },
          ],
        },
      };
    }
    return {
      playerCodeCommonFiles: [
        {
          commonFileId: '33333333-3333-4333-8333-333333333333',
          appId: '1',
          slug: 'common',
          title: 'Common helper',
          description: null,
          path: 'src/common.rs',
          target: 'SERVER',
          tags: ['helper'],
          status: 'PUBLISHED',
          versionId: '44444444-4444-4444-8444-444444444444',
          versionNo: '1',
          content: 'pub fn common() {}',
          contentSha256: 'a'.repeat(64),
          publishedByUserId: '7',
          publishedAt: dto.updatedAt,
          createdAt: dto.createdAt,
          updatedAt: dto.updatedAt,
        },
      ],
    };
  };

  const scope = { appId: '1', gridId: '2' };
  assert.equal(
    (await client.playerCodeProjects.listProjects(scope))[0].kind,
    'FULL_STACK',
  );
  const project = await client.playerCodeProjects.getProject({
    ...scope,
    projectId: dto.projectId,
  });
  assert.equal(project.revision.id, '1');
  await client.playerCodeProjects.createProject({
    ...scope,
    kind: project.kind,
    metadata: project.metadata,
    files: project.files,
  });
  await client.playerCodeProjects.saveProject({
    ...scope,
    projectId: dto.projectId,
    expectedRevisionId: '1',
    metadata: { ...project.metadata, name: 'Renamed' },
    files: [
      { ...project.files[0], content: 'fn changed() {}' },
      project.files[1],
    ],
  });
  const library =
    await client.playerCodeProjects.listPersonalLibraryFiles(scope);
  const common = await client.playerCodeProjects.listCommonFiles(scope);
  await client.playerCodeProjects.savePersonalLibraryFile({
    ...scope,
    title: 'Saved helper',
    target: 'SERVER',
    path: 'src/helper.rs',
    content: 'pub fn helper() {}',
  });
  await client.playerCodeProjects.importReferenceFile({
    ...scope,
    projectId: dto.projectId,
    expectedRevisionId: '2',
    source: 'COMMON',
    referenceId: common[0].id,
    destinationPath: 'src/common.rs',
  });

  assert.equal(library[0].source, 'PERSONAL_LIBRARY');
  assert.equal(common[0].id, '44444444-4444-4444-8444-444444444444');
  assert.deepEqual(
    calls.map(({ name }) => name),
    [
      'PlayerCodeProjects',
      'PlayerCodeProject',
      'PlayerCodeProjectCreate',
      'PlayerCodeProjectSave',
      'PlayerCodeLibraryFiles',
      'PlayerCodeCommonFiles',
      'PlayerCodeLibrarySave',
      'PlayerCodeProjectImportFile',
    ],
  );
  const save = calls.find(({ name }) => name === 'PlayerCodeProjectSave');
  assert.equal(save.variables.input.expectedRevision, '1');
  assert.deepEqual(save.variables.input.deletes, []);
  assert.equal(save.variables.input.upserts.length, 1);
  assert.equal(
    'sourceFilesJson' in save.variables.input,
    false,
    'project persistence never uses the deploy wire JSON field',
  );
  client.close();
});

test('project provider uses generated operations from the merged schema', async () => {
  const source = await readFile(
    new URL('../../src/domains/playerCodeProjects.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /generated\/graphql/u);
  assert.doesNotMatch(source, /GRAPHQL_ASSUMPTIONS/u);
});

function operationName(document) {
  return document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  )?.name?.value;
}
