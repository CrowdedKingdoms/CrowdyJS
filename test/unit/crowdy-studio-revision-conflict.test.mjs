import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The Studio save path's conflict recovery, which was unreachable.
 *
 * `saveProject` catches a failed save and, when it recognises a revision
 * conflict, refetches the remote project and rethrows a
 * `CrowdyStudioRevisionConflictError` carrying it -- so an editor can show the
 * user what moved underneath them instead of an opaque failure. It recognised
 * the conflict by asking for `extensions.code === 'CONFLICT'` with
 * `CROWDY_STUDIO_REVISION_CONFLICT` somewhere in the MESSAGE. The server sends
 * `CROWDY_STUDIO_REVISION_CONFLICT` as the code and does not repeat it in the
 * message, so the branch never ran and every conflict surfaced as a bare
 * CrowdyGraphQLError.
 *
 * It came from the SDL description, which said the mutation "returns CONFLICT
 * with CROWDY_STUDIO_REVISION_CONFLICT" -- readable as a code plus a detail
 * string, and actually one code with a long name. The description is corrected
 * in ck-api v1.60.0; this test is what stops the client half regressing, and it
 * accepts BOTH shapes so a tier that words it either way still recovers.
 */

const projectDto = (revision) => ({
  projectId: 'p-1',
  appId: '80000000000001',
  gridId: 'g-1',
  name: 'A project',
  description: null,
  serverModuleName: null,
  clientModuleName: null,
  pairingPreference: 'SERVER_ONLY',
  files: [{ target: 'SERVER', path: 'main.rs', content: 'fn main() {}' }],
  sdkVersion: '0.1.5',
  abiVersion: 0,
  revision,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
});

const saveInput = {
  appId: '80000000000001',
  gridId: 'g-1',
  projectId: 'p-1',
  expectedRevisionId: '3',
  metadata: { name: 'A project', pairingPreference: 'SERVER_ONLY' },
  files: [{ target: 'SERVER', path: 'main.rs', content: 'fn main() { } // mine' }],
};

/**
 * A GraphQLClient double: answers project reads, and fails the save with one
 * scripted GraphQL error entry.
 */
function harness(saveError) {
  return {
    async request(document) {
      const name = document.definitions[0]?.name?.value ?? '';
      if (/Save/i.test(name)) throw saveError;
      // The remote is at revision 4; the caller thinks it is at 3.
      return { crowdyStudioProject: projectDto(4) };
    },
  };
}

async function attemptSave(saveError) {
  const { CrowdyStudioAPI, CrowdyStudioRevisionConflictError } = await import(
    '../../dist/index.js'
  );
  const api = new CrowdyStudioAPI(harness(saveError));
  try {
    await api.saveProject(saveInput);
    assert.fail('the save was supposed to be refused');
  } catch (error) {
    return { error, CrowdyStudioRevisionConflictError };
  }
}

test('a revision conflict identified by CODE becomes a CrowdyStudioRevisionConflictError', async () => {
  const { CrowdyGraphQLError } = await import('../../dist/index.js');
  // The real wire form, read off a live tier: the code is the long name and the
  // message says nothing a matcher could key on.
  const wire = new CrowdyGraphQLError([
    {
      message:
        'Project p-1 has moved on: expected revision 3 but the current revision is 4.',
      extensions: { code: 'CROWDY_STUDIO_REVISION_CONFLICT' },
    },
  ]);

  const { error, CrowdyStudioRevisionConflictError } = await attemptSave(wire);
  assert.ok(
    error instanceof CrowdyStudioRevisionConflictError,
    `got ${error?.constructor?.name}: ${error?.message}`,
  );
  // The refetched remote is the point of the recovery -- without it the caller
  // knows it lost the race and nothing about what it lost to.
  assert.equal(error.remoteProject?.revision?.id, '4');
});

test('the older message-only shape is still recognised', async () => {
  const { CrowdyGraphQLError } = await import('../../dist/index.js');
  const legacy = new CrowdyGraphQLError([
    {
      message: 'CROWDY_STUDIO_REVISION_CONFLICT: expected 3, found 4',
      extensions: { code: 'CONFLICT' },
    },
  ]);
  const { error, CrowdyStudioRevisionConflictError } = await attemptSave(legacy);
  assert.ok(error instanceof CrowdyStudioRevisionConflictError);
});

test('an unrelated failure is rethrown untouched', async () => {
  const { CrowdyGraphQLError } = await import('../../dist/index.js');
  // A generic CONFLICT must NOT be adopted: recovering from it by refetching
  // and reporting "the remote moved" would be a wrong diagnosis of a real
  // problem, which costs more than no diagnosis.
  const unrelated = new CrowdyGraphQLError([
    { message: 'Idempotency key reused', extensions: { code: 'CONFLICT' } },
  ]);
  const { error, CrowdyStudioRevisionConflictError } =
    await attemptSave(unrelated);
  assert.ok(!(error instanceof CrowdyStudioRevisionConflictError));
  assert.ok(error instanceof CrowdyGraphQLError);
});
