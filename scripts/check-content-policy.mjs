// Public content policy: CrowdyJS is a public package. Nothing in it may name a
// private repository or internal infrastructure. CI fails if a denylisted term
// appears anywhere in the corpus below.
//
// WHY THIS WALKS THE TREE INSTEAD OF ASKING GIT. The sibling C++ SDK's equivalent
// gate is `git grep --untracked`, and that shape could not have caught the leak
// that prompted this file. `dist/` is gitignored here and is also the ONLY thing
// npm ships (package.json `files` is ["dist", README, MIGRATION]) -- so the
// private-repo reference reached 69 published versions inside
// dist/generated/graphql.d.ts, a path no git-backed search can see. A gate whose
// corpus is "what git tracks" polices the input and not the artifact.
//
// So: walk from a named root, skip directories by name with a reason beside each,
// never read an ignore file, and print the corpus size on every run so a reader
// can tell a clean tree from an unopened one. Those two answers otherwise print
// the same line.
//
// THERE IS NO SCHEMA EXEMPTION, deliberately. The C++ gate exempts `schema.gql`
// on the grounds that it is a verbatim copy of the published SDL and that
// "description fixes belong server-side". That was the right diagnosis with no
// follow-through: the server-side fix was never made, so the exemption became
// permanent cover for a real leak. The descriptions were fixed upstream in the
// API's own GraphQL decorators on 2026-08-23, so the SDL is clean at the source
// and the exemption is no longer load-bearing anywhere.
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');

const DENYLIST = [
  'cks-udp-api',
  'cks-michael-root',
  'cks-project-root',
  'MessageType.hpp',
  'wire-protocol-reference',
  'P2P_SECRET',
  'P2P_TOKEN',
  'CHANNEL_MUTATION',
  'peer port',
  'port 9081',
  ':9081',
  'buddydev',
  'BUDDY_BUILDER',
  'dev-run-buddy',
];

// Skipped by NAME, never by an ignore file, with the reason each one is skipped.
// `dist` is deliberately absent from this list: it is the published artifact and
// therefore the most important directory in the corpus.
const SKIP_DIRS = new Map([
  ['node_modules', 'third-party dependencies; not our text to police'],
  ['.git', 'object store; contains every historical revision by construction'],
  ['coverage', 'test-run output, regenerated per run'],
  ['.nyc_output', 'test-run output, regenerated per run'],
]);

// `.git` is a DIRECTORY in a clone and a FILE in a worktree, where it holds
// `gitdir: <absolute path>`. That path names the checkout's ancestor directories,
// so scanning it reported the enclosing private repos as findings -- true text,
// but git plumbing rather than repository content, and only ever in a worktree.
// CI clones, so this would have failed on a developer's box and passed in CI:
// the disagreement is the expensive kind, so the name is skipped in both forms.
const SKIP_ANY = new Set(['.git']);

// Binary-ish payloads have no reviewable prose. Listed by extension so the
// exclusion is a decision rather than a heuristic over file contents.
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.tgz', '.zip']);

// This file quotes every denylisted term above, so scanning it would always fail.
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (SKIP_ANY.has(entry.name)) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (SKIP_EXT.has(extname(entry.name).toLowerCase())) continue;
      out.push(full);
    }
  }
  return out;
}

export function scan(root) {
  const files = walk(root, []);
  const findings = [];
  let scanned = 0;
  for (const file of files) {
    const rel = relative(root, file);
    if (rel === SELF) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // unreadable is not a pass: it is counted out of `scanned` below
    }
    if (text.includes('\u0000')) continue;
    scanned += 1;
    const lines = text.split('\n');
    for (const term of DENYLIST) {
      lines.forEach((line, i) => {
        if (line.includes(term)) findings.push({ term, file: rel, line: i + 1, text: line.trim().slice(0, 160) });
      });
    }
  }
  return { corpus: files.length, scanned, findings, distPresent: files.some((f) => relative(root, f).startsWith('dist')) };
}

function report(root, label) {
  const { corpus, scanned, findings, distPresent } = scan(root);
  console.log(`[content-policy] ${label}: corpus ${corpus} files, ${scanned} scanned as text, ${DENYLIST.length} terms`);
  // `dist` is what npm publishes. Its absence means this run judged the SOURCE
  // only, which is a weaker claim than it looks -- say so rather than implying
  // the shipped artifact was checked.
  console.log(
    distPresent
      ? '[content-policy] dist/ present and INCLUDED -- the published artifact was checked'
      : '[content-policy] dist/ absent: source checked, PUBLISHED ARTIFACT NOT CHECKED (run after `npm run build` to cover it)',
  );
  for (const f of findings) console.error(`  DENYLISTED '${f.term}'  ${f.file}:${f.line}: ${f.text}`);
  if (findings.length) {
    console.error(`[content-policy] FAILED: ${findings.length} reference(s) to private repositories or internal infrastructure.`);
    return 1;
  }
  console.log('[content-policy] passed.');
  return 0;
}

// A gate that has never been observed refusing is unproven. This plants the exact
// leak that prompted the gate -- a private-repo name inside a generated .d.ts
// under dist/ -- and asserts refusal, so the corpus decision above is verified
// rather than asserted.
function selfTest() {
  let failures = 0;
  const check = (name, got, want) => {
    const ok = got === want;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} (exit ${got}, wanted ${want})`);
    if (!ok) failures += 1;
  };

  const fixture = mkdtempSync(join(tmpdir(), 'cp-selftest-'));
  mkdirSync(join(fixture, 'src'), { recursive: true });
  writeFileSync(join(fixture, 'src', 'index.ts'), 'export const ok = 1;\n');
  check('a clean tree passes', scan(fixture).findings.length === 0 ? 0 : 1, 0);

  // The real leak: generated types under dist/, which git cannot see.
  mkdirSync(join(fixture, 'dist', 'generated'), { recursive: true });
  writeFileSync(
    join(fixture, 'dist', 'generated', 'graphql.d.ts'),
    '/** UUID of the runtime/Buddy (cks-udp-api) instance. */\n',
  );
  const planted = scan(fixture);
  check('a reference in dist/ (the published artifact) is refused', planted.findings.length > 0 ? 1 : 0, 1);
  check('dist/ is reported as covered when present', planted.distPresent ? 0 : 1, 0);

  // And the same term in ordinary source.
  rmSync(join(fixture, 'dist'), { recursive: true, force: true });
  writeFileSync(join(fixture, 'src', 'notes.ts'), '// see cks-michael-root/scripts\n');
  check('a reference in src/ is refused', scan(fixture).findings.length > 0 ? 1 : 0, 1);

  // An ignore file must not shrink the corpus.
  writeFileSync(join(fixture, '.gitignore'), 'src/\ndist/\n');
  check('a .gitignore cannot hide a finding', scan(fixture).findings.length > 0 ? 1 : 0, 1);

  rmSync(fixture, { recursive: true, force: true });
  console.log(failures ? `[content-policy] SELF-TEST FAILED (${failures})` : '[content-policy] self-test passed (5 cases)');
  return failures ? 1 : 0;
}

// Guarded so `scan` can be imported -- by the self-test above, and to point the
// same corpus rule at a tree that is not this checkout (a published tarball, say).
// Without this, importing the module ran the whole check and called process.exit.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = process.argv[2];
  process.exit(arg === '--self-test' ? selfTest() : report(ROOT, 'CrowdyJS'));
}
