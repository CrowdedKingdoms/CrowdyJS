/**
 * Channel and team bans: each method sends its own mutation with the arguments it was given and
 * returns that field, and a refusal surfaces as the typed reader the caller branches on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { ChannelsAPI } = await import('../../dist/domains/channels.js');
const { TeamsAPI } = await import('../../dist/domains/teams.js');
const errors = await import('../../dist/errors.js');

/** A GraphQL client that records each request and answers from `respond`. */
function fakeGql(respond) {
  const calls = [];
  return {
    calls,
    async request(document, variables) {
      const op = document.definitions.find((d) => d.kind === 'OperationDefinition');
      const field = op.selectionSet.selections[0].name.value;
      calls.push({ operation: op.name?.value, field, variables });
      return respond(field, variables);
    },
  };
}

const banned = (userId) => ({ groupMemberId: '9', groupId: '5', userId, status: 'banned', roles: [] });

for (const [label, Api, kind] of [
  ['channels', ChannelsAPI, 'Channel'],
  ['teams', TeamsAPI, 'Team'],
]) {
  test(`${label}.ban sends ban${kind}Member with the reason, or null without one`, async () => {
    const gql = fakeGql((field, v) => ({ [field]: banned(v.userId) }));
    const api = new Api(gql);
    const member = await api.ban('5', '3', 'spam');
    assert.equal(member.status, 'banned');
    await api.ban('5', '4');
    assert.deepEqual(
      gql.calls.map((c) => [c.field, c.variables]),
      [
        [`ban${kind}Member`, { groupId: '5', userId: '3', reason: 'spam' }],
        [`ban${kind}Member`, { groupId: '5', userId: '4', reason: null }],
      ],
    );
  });

  test(`${label}.unban sends unban${kind}Member and returns whether there was a ban`, async () => {
    const gql = fakeGql((field, v) => ({ [field]: v.userId === '3' }));
    const api = new Api(gql);
    assert.equal(await api.unban('5', '3'), true);
    assert.equal(await api.unban('5', '4'), false);
    assert.deepEqual(gql.calls[0], {
      operation: gql.calls[0].operation,
      field: `unban${kind}Member`,
      variables: { groupId: '5', userId: '3' },
    });
  });

  test(`${label}: a refused ban or a banned join surfaces as the typed refusal`, async () => {
    const gql = fakeGql((field) => {
      if (field.startsWith('ban')) {
        throw new errors.CrowdyGraphQLError([
          { message: "A group's owner cannot be banned from it", extensions: { code: 'FORBIDDEN' } },
        ]);
      }
      throw new errors.CrowdyGraphQLError([
        { message: 'banned', extensions: { code: 'GROUP_MEMBER_BANNED' } },
      ]);
    });
    const api = new Api(gql);
    const refusal = await api.ban('5', '2').catch((e) => e);
    assert.ok(refusal instanceof errors.CrowdyGraphQLError);
    assert.equal(errors.groupMemberBannedOf(refusal), false);
    assert.equal(errors.groupMemberBannedOf(await api.join('5').catch((e) => e)), true);
  });
}
