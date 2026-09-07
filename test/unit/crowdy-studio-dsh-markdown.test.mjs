/**
 * Harness dock Markdown renderer: headings, emphasis, tables, fences.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window();
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;

const { fillMarkdown } = await import('../../dist/crowdy-studio/dsh/markdown.js');

test('renders headings, bold, inline code, and GFM tables', () => {
  const host = document.createElement('div');
  fillMarkdown(
    host,
    [
      '## Client (client/src/lib.rs) — a fixed, hardcoded house',
      '',
      'It draws exactly **one static house** out of axis-aligned boxes via `api::draw_box`, nothing else:',
      '',
      '| Piece | Details |',
      '| --- | --- |',
      '| Foundation | brown slab |',
      '| Roof | pitched boxes |',
    ].join('\n'),
  );

  assert.equal(host.dataset.md, 'true');
  const heading = host.querySelector('h2');
  assert.ok(heading);
  assert.match(heading.textContent ?? '', /Client/);
  assert.equal(host.querySelectorAll('strong').length, 1);
  assert.equal(host.querySelector('strong')?.textContent, 'one static house');
  assert.equal(host.querySelector('code')?.textContent, 'api::draw_box');
  const cells = [...host.querySelectorAll('td')].map((cell) => cell.textContent);
  assert.deepEqual(cells, ['Foundation', 'brown slab', 'Roof', 'pitched boxes']);
});

test('keeps fenced code as a pre block', () => {
  const host = document.createElement('div');
  fillMarkdown(host, 'Intro\n\n```rs\nfn on_init() {}\n```\n');
  assert.equal(host.querySelector('pre')?.textContent, 'fn on_init() {}');
  assert.equal(host.querySelector('pre')?.dataset.lang, 'rs');
});
