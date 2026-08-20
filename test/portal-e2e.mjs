// Portal / app-scoped token e2e against a live local API.
//
// Validates the Overworld token model end-to-end at the GraphQL layer:
//   - mintAppToken (auto-grant free) issues an app-scoped token
//   - an app token is confined to its app (rejected for another app's gameplay)
//   - an identity session token cannot play games
//   - app tokens cannot mint other tokens; me/refresh are allowed
//   - the PKCE authorization-code exchange yields an app token (one-time, verified)
//   - refreshAppToken rotates same-app and revokes the old token
//   - expiry is enforced
//   - logout cascades session -> child app tokens
//
// Run: API=http://127.0.0.1:3001 node test/portal-e2e.mjs
// GAME defaults to API and differs only when the app is placed in another datacenter.
import { createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';

const API = (process.env.API ?? 'http://127.0.0.1:3001') + '/graphql';
const GAME = process.env.GAME ? process.env.GAME + '/graphql' : API;
const APP_A = process.env.APP_A ?? '1';
const APP_B = process.env.APP_B ?? '2';

let pass = 0;
let fail = 0;
const log = (ok, msg, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.error(`  FAIL  ${msg}  ${extra}`); }
};

async function gql(endpoint, query, variables, token) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return json;
}
const code = (j) => j?.errors?.[0]?.extensions?.code ?? null;
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const Q = {
  register: `mutation($i: RegisterUserInput!){ register(registerUserInput:$i){ token gameTokenId user { userId } } }`,
  mint: `mutation($i: MintAppTokenInput!){ mintAppToken(input:$i){ token gameTokenId appId expiresAt gameApiUrl } }`,
  createCode: `mutation($i: CreatePortalAuthorizationCodeInput!){ createPortalAuthorizationCode(input:$i){ code redirectUri expiresAt } }`,
  exchange: `mutation($i: ExchangePortalCodeInput!){ exchangePortalCode(input:$i){ token gameTokenId appId } }`,
  refresh: `mutation{ refreshAppToken{ token gameTokenId appId } }`,
  me: `query{ me { userId } }`,
  bootstrap: `query($a: BigInt!){ gameClientBootstrap(appId:$a){ appId me { userId } } }`,
  logout: `mutation{ logout }`,
};

async function main() {
  const email = `portal-e2e-${Date.now()}@example.com`;
  // 1. register a brand-new account -> identity session token.
  //
  // A NEW address is required, not merely convenient: `register` returns a
  // session only for an address it is creating. One that already exists gets the
  // password attached pending email confirmation and NO token, so reusing an
  // address here would fail with a message about confirming an inbox.
  const password = `Aa1!portal-${Date.now()}`;
  const reg = await gql(API, Q.register, { i: { email, password } });
  const session = reg.data?.register?.token;
  const userId = reg.data?.register?.user?.userId;
  log(!!session && !!userId, '1. register returns an identity session token', JSON.stringify(reg.errors ?? ''));

  // 2. mint app tokens for two apps (auto-grant free)
  const a1 = (await gql(API, Q.mint, { i: { appId: APP_A } }, session)).data?.mintAppToken;
  log(a1?.appId === APP_A && !!a1?.token && !!a1?.expiresAt, '2a. mintAppToken(A) issues an app token with expiry (auto-grant free)');
  const a2 = (await gql(API, Q.mint, { i: { appId: APP_B } }, session)).data?.mintAppToken;
  log(a2?.appId === APP_B && !!a2?.token, '2b. mintAppToken(B) issues an app token');
  log(a1?.token !== session && a1?.token !== a2?.token, '2c. app tokens are distinct from the session token and each other');

  // 3. app token A works on its own app's gameplay
  const bootA = await gql(GAME, Q.bootstrap, { a: APP_A }, a1?.token);
  log(bootA.data?.gameClientBootstrap?.appId === APP_A, '3. app-A token -> gameClientBootstrap(A) succeeds', JSON.stringify(bootA.errors ?? ''));

  // 4. CONFINEMENT: app token A rejected for app B's gameplay
  const crossA = await gql(GAME, Q.bootstrap, { a: APP_B }, a1?.token);
  log(!crossA.data?.gameClientBootstrap && code(crossA) === 'SCOPE_MISSING', '4. CONFINEMENT: app-A token -> gameClientBootstrap(B) rejected (SCOPE_MISSING)', code(crossA) ?? '');

  // 5. identity session token cannot play
  const sessPlay = await gql(GAME, Q.bootstrap, { a: APP_A }, session);
  log(!sessPlay.data?.gameClientBootstrap && code(sessPlay) === 'SCOPE_MISSING', '5. identity session token -> gameClientBootstrap(A) rejected (SCOPE_MISSING)', code(sessPlay) ?? '');

  // 6. app token cannot mint; me is allowed for an app token
  const mintWithApp = await gql(API, Q.mint, { i: { appId: APP_A } }, a1?.token);
  log(!mintWithApp.data?.mintAppToken && code(mintWithApp) === 'SCOPE_MISSING', '6a. app token cannot mintAppToken (SCOPE_MISSING)', code(mintWithApp) ?? '');
  const meApp = await gql(API, Q.me, {}, a1?.token);
  log(meApp.data?.me?.userId === userId, '6b. app token CAN read me (allow-listed)');

  // 7. PKCE authorization-code exchange
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const codeRes = await gql(API, Q.createCode, { i: { appId: APP_A, codeChallenge: challenge, codeChallengeMethod: 'S256', redirectUri: 'http://localhost:5173/' } }, session);
  const authCode = codeRes.data?.createPortalAuthorizationCode?.code;
  log(!!authCode, '7a. createPortalAuthorizationCode (session) returns a one-time code', JSON.stringify(codeRes.errors ?? ''));
  const ex = await gql(API, Q.exchange, { i: { code: authCode, codeVerifier: verifier } });
  const aPrime = ex.data?.exchangePortalCode;
  log(aPrime?.appId === APP_A && !!aPrime?.token, '7b. exchangePortalCode (PKCE) returns an app token');
  const bootPrime = await gql(GAME, Q.bootstrap, { a: APP_A }, aPrime?.token);
  log(bootPrime.data?.gameClientBootstrap?.appId === APP_A, '7c. exchanged token plays app A');
  const reuse = await gql(API, Q.exchange, { i: { code: authCode, codeVerifier: verifier } });
  log(!reuse.data?.exchangePortalCode, '7d. authorization code is single-use (reuse rejected)');
  // wrong verifier
  const codeRes2 = await gql(API, Q.createCode, { i: { appId: APP_A, codeChallenge: challenge, codeChallengeMethod: 'S256', redirectUri: 'http://localhost:5173/' } }, session);
  const badPkce = await gql(API, Q.exchange, { i: { code: codeRes2.data?.createPortalAuthorizationCode?.code, codeVerifier: 'wrong-verifier' } });
  log(!badPkce.data?.exchangePortalCode, '7e. PKCE verification rejects a wrong verifier');

  // 8. refresh rotates same-app and revokes the old token
  const refreshed = (await gql(API, Q.refresh, {}, aPrime?.token)).data?.refreshAppToken;
  log(refreshed?.appId === APP_A && refreshed?.token && refreshed.token !== aPrime?.token, '8a. refreshAppToken rotates the app token (new token, same app)');
  const bootRefreshed = await gql(GAME, Q.bootstrap, { a: APP_A }, refreshed?.token);
  log(bootRefreshed.data?.gameClientBootstrap?.appId === APP_A, '8b. refreshed token plays app A');
  // old token revoked (game-api caches introspection ~60s, so check via mgmt me which is live)
  const oldMe = await gql(API, Q.me, {}, aPrime?.token);
  log(!oldMe.data?.me, '8c. the rotated-out token is revoked (me rejected)', code(oldMe) ?? '');

  // 9. expiry enforced (mint, expire in DB, then use). Only when the management
  // DB is locally reachable (builder smoke stack); skipped for remote envs where
  // expiry is validated separately via portal-mgmt-test.
  if (process.env.PORTAL_E2E_LOCAL_DB === '1') {
    const e = (await gql(API, Q.mint, { i: { appId: APP_A } }, session)).data?.mintAppToken;
    execSync(`sudo -u postgres psql -d cks_management -c "UPDATE game_tokens SET expires_at = now() - interval '5 minutes' WHERE token = '${e.token}';"`, { stdio: 'ignore' });
    const expBoot = await gql(GAME, Q.bootstrap, { a: APP_A }, e.token);
    log(!expBoot.data?.gameClientBootstrap, '9a. an expired app token is rejected for gameplay', code(expBoot) ?? '');
    const expMe = await gql(API, Q.me, {}, e.token);
    log(!expMe.data?.me, '9b. an expired app token is rejected on the management plane');
  }

  // 10. logout cascades session -> child app tokens
  await gql(API, Q.logout, {}, session);
  const afterLogout = await gql(GAME, Q.bootstrap, { a: APP_A }, refreshed?.token);
  // game-api caches introspection up to 60s; assert via the live mgmt plane instead
  const refreshedMe = await gql(API, Q.me, {}, refreshed?.token);
  log(!refreshedMe.data?.me, '10a. logout revokes child app tokens (refreshed token me rejected)');
  const sessMe = await gql(API, Q.me, {}, session);
  log(!sessMe.data?.me, '10b. logout revokes the session token');
  void afterLogout;

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
