// SDK browser-handoff e2e: drives client.portal's PKCE redirect orchestration
// (beginEntry -> Overworld handleAuthorizeRequest -> completeEntry) against a
// real env, with two separate clients standing in for the two origins. Proves
// the game client obtains an app token via the code+verifier WITHOUT ever
// holding the identity session token.
//
// Run: MGMT=https://api.<box> GAME=https://game.<box> APP_A=1 node test/portal-browser-flow.mjs
import { createCrowdyClient } from '../dist/index.js';

const MGMT = process.env.MGMT ?? 'https://api.ow-box-587206.test.cks-env.com';
const GAME = process.env.GAME ?? 'https://game.ow-box-587206.test.cks-env.com';
const APP_A = process.env.APP_A ?? '1';
let pass = 0, fail = 0;
const log = (ok, m, x = '') => { ok ? (pass++, console.log(`  PASS  ${m}`)) : (fail++, console.error(`  FAIL  ${m}  ${x}`)); };

// In-memory token + PKCE stores (stand-ins for per-origin browser storage).
function memTokenStore() { let t = null; return { get: () => t, set: (v) => { t = v; }, clear: () => { t = null; } }; }
function memPkceStore() { const m = new Map(); return { get: (s) => m.get(s) ?? null, set: (s, v) => { m.set(s, v); }, remove: (s) => { m.delete(s); } }; }

async function main() {
  // Overworld identity origin: holds the session token.
  const overworld = createCrowdyClient({ managementUrl: MGMT, tokenStore: memTokenStore() });
  // Game origin: separate client + its own PKCE store; starts with no token.
  const gamePkce = memPkceStore();
  const game = createCrowdyClient({ managementUrl: MGMT, httpUrl: GAME, wsUrl: GAME.replace(/^http/, 'ws'), tokenStore: memTokenStore(), pkceStore: gamePkce });

  await overworld.auth.register({ email: `portal-browser-${Date.now()}@test.invalid`, password: 'Password123!' });
  const sessionTok = overworld.getToken();
  log(!!sessionTok, '1. overworld registered (identity session token held on overworld origin)');

  // Game origin step 1: beginEntry -> build the Overworld authorize URL (verifier kept locally).
  const authorizeUrl = await game.portal.beginEntry({ appId: APP_A, authorizeUrl: `${MGMT}/authorize`, redirectUri: 'https://game.example/callback' });
  log(authorizeUrl.includes('code_challenge=') && authorizeUrl.includes('state='), '2. beginEntry builds authorize URL with PKCE challenge + state');
  log(game.getToken() === null, '3. game origin has NO token yet');

  // Overworld step 2: handleAuthorizeRequest with the incoming query -> mints code, returns redirect-back URL.
  const incomingQuery = new URL(authorizeUrl).search;
  const redirectBack = await overworld.portal.handleAuthorizeRequest(incomingQuery);
  log(redirectBack.includes('code='), '4. overworld handleAuthorizeRequest returns redirect-back URL with code');

  // Game origin step 3: completeEntry with the callback query -> exchanges code+verifier -> app token stored.
  const cbQuery = new URL(redirectBack).search;
  const appTok = await game.portal.completeEntry(cbQuery);
  log(appTok?.appId === APP_A && !!appTok?.token, '5. game completeEntry exchanges code+verifier for an app token', JSON.stringify(appTok ?? ''));
  log(game.getToken() === appTok?.token, '6. game origin now holds the app token');
  log(game.getToken() !== sessionTok, '7. CONFINEMENT: game origin never received the identity session token');

  // The game client can now play app A with its app token.
  const boot = await game.serverStatus.gameClientBootstrap(APP_A).catch((e) => ({ error: String(e) }));
  log(boot && boot.appId === APP_A, '8. game client plays app A with the app token (gameClientBootstrap)', JSON.stringify(boot?.error ?? boot ?? ''));

  // Same-app refresh rotates the app token.
  const before = game.getToken();
  const refreshed = await game.portal.refresh();
  log(!!refreshed?.token && game.getToken() === refreshed.token && refreshed.token !== before, '9. refresh rotates the app token in place');

  overworld.close(); game.close();
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
