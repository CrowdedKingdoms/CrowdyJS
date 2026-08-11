/**
 * The rule the e2e suites use to choose a datacenter for a new app.
 *
 * Worth a unit test rather than being left to the e2e runs it serves, because both of
 * its failure modes are silent there: picking an unplaceable datacenter fails 64
 * candidate ids later with a 503 that reads like an outage, and picking nothing at all
 * fails inside createApp with an error about an empty string.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { firstPlaceable } from '../provision.mjs';

test('takes the first datacenter that can actually hold an app', () => {
  const code = firstPlaceable(
    {
      datacenters: [
        { code: 'new', placeable: false },
        { code: 'or', placeable: true },
        { code: 'va', placeable: true },
      ],
    },
    'test',
  );
  // NOT 'new', which is the whole point: it is first, and it holds no shards.
  assert.equal(code, 'or');
});

test('refuses, naming what it saw, when nothing is placeable', () => {
  assert.throws(
    () =>
      firstPlaceable({ datacenters: [{ code: 'or', placeable: false }] }, 'here'),
    (err) => {
      assert.match(err.message, /here:/);
      // Names the datacenters it did see, so "none placeable" is distinguishable
      // from "none configured" without reading the code.
      assert.match(err.message, /it knows or, none placeable/);
      assert.match(err.message, /pg:upsert_datacenter_topology/);
      return true;
    },
  );
});

test('refuses on an empty list rather than returning undefined', () => {
  // An empty list is a deployment with no pushed topology. Returning undefined here
  // would send `datacenter: undefined` and surface as a validation error about a
  // missing field, twenty frames from the cause.
  assert.throws(
    () => firstPlaceable({ datacenters: [] }, 'here'),
    /it knows none/,
  );
  assert.throws(() => firstPlaceable(undefined, 'here'), /it knows none/);
});
