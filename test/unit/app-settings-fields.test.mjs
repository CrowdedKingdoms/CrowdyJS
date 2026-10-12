import assert from 'node:assert/strict';
import test from 'node:test';
import { print } from 'graphql';
import {
  AppBySlugDocument,
  AppDocument,
  AppsForOrgDocument,
  CreateAppDocument,
  MyAppsDocument,
  UpdateAppDocument,
} from '../../dist/generated/graphql.js';

/**
 * An org admin who closes the wilderness with apps.update must be able to read the
 * setting back; a document that does not select it shows every app as unknown.
 */
test('app settings reads and writes select wildernessWritesOpen', () => {
  const documents = {
    AppDocument,
    AppBySlugDocument,
    AppsForOrgDocument,
    MyAppsDocument,
    CreateAppDocument,
    UpdateAppDocument,
  };
  for (const [name, document] of Object.entries(documents)) {
    assert.match(print(document), /\bwildernessWritesOpen\b/, `${name} misses wildernessWritesOpen`);
  }
});

/**
 * Replay logging (App.replayLoggingEnabled) is set with apps.update and read back on
 * every app read: an org admin must see whether an app is being recorded and billed.
 */
test('app settings reads and writes select replayLoggingEnabled', () => {
  const documents = {
    AppDocument,
    AppBySlugDocument,
    AppsForOrgDocument,
    MyAppsDocument,
    CreateAppDocument,
    UpdateAppDocument,
  };
  for (const [name, document] of Object.entries(documents)) {
    assert.match(print(document), /\breplayLoggingEnabled\b/, `${name} misses replayLoggingEnabled`);
  }
});
