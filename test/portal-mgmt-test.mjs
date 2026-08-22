// Portal validation of the management surface against a deployed API.
// Validates mint / PKCE exchange / refresh / capability-confinement / expiry /
// logout-cascade.
//
// Run: API=<tier origin> TEST_DB_CONN="host=... dbname=... user=postgres sslmode=require" \
//      PGPASSWORD=... node test/portal-mgmt-test.mjs
//
// API IS REQUIRED AND HAS NO DEFAULT, and this line is why: it read
// `process.env.API ?? 'https://api.dev.crowdedkingdoms.com'`, a host retired
// before the tier root moved and now answering 503. Every request failed and the
// failures looked like the API rather than like an unset variable. Derive it:
//
//   . cks-michael-root/scripts/tier-facts.sh && tier_client_graphql dev
//
// (that helper returns the /graphql URL; this file appends its own, so pass the
// ORIGIN -- e.g. ${url%/graphql}.)
import { createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';

if (!process.env.API) {
  console.error('portal-mgmt-test: API is required and has no default (it used to name a host that answers 503).');
  console.error('  API=https://<tier client origin> node test/portal-mgmt-test.mjs');
  process.exit(2);
}
const API = process.env.API + '/graphql';
const APP_A = process.env.APP_A ?? '1';
const CONN = process.env.TEST_DB_CONN; // optional; enables the expiry test
let pass = 0, fail = 0;
const log = (ok, m, x = '') => { ok ? (pass++, console.log(`  PASS  ${m}`)) : (fail++, console.error(`  FAIL  ${m}  ${x}`)); };
async function gql(q, v, t) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ query: q, variables: v }) });
  return r.json();
}
const code = (j) => j?.errors?.[0]?.extensions?.code ?? null;
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const Q = {
  register: `mutation($i: RegisterUserInput!){ register(registerUserInput:$i){ token gameTokenId user { userId } } }`,
  mint: `mutation($i: MintAppTokenInput!){ mintAppToken(input:$i){ token gameTokenId appId expiresAt gameApiUrl } }`,
  createCode: `mutation($i: CreatePortalAuthorizationCodeInput!){ createPortalAuthorizationCode(input:$i){ code redirectUri expiresAt } }`,
  exchange: `mutation($i: ExchangePortalCodeInput!){ exchangePortalCode(input:$i){ token appId } }`,
  refresh: `mutation{ refreshAppToken{ token appId } }`,
  me: `query{ me { userId } }`,
  logout: `mutation{ logout }`,
};
async function main() {
  const email = `portal-mgmt-${Date.now()}@test.invalid`;
  const password = `Aa1!portal-mgmt-${Date.now()}`;
  const reg = await gql(Q.register, { i: { email, password } });
  const session = reg.data?.register?.token, userId = reg.data?.register?.user?.userId;
  log(!!session, '1. register -> identity session token', JSON.stringify(reg.errors ?? ''));

  const a1 = (await gql(Q.mint, { i: { appId: APP_A } }, session)).data?.mintAppToken;
  log(a1?.appId === APP_A && !!a1?.token && !!a1?.expiresAt, '2. mintAppToken auto-grants free app + returns app token w/ expiry', JSON.stringify(a1 ?? ''));
  log(a1?.token !== session, '3. app token distinct from session token');

  const mintWithApp = await gql(Q.mint, { i: { appId: APP_A } }, a1?.token);
  log(code(mintWithApp) === 'SCOPE_MISSING', '4. app token cannot mint (SCOPE_MISSING)', code(mintWithApp) ?? '');
  const meApp = await gql(Q.me, {}, a1?.token);
  log(meApp.data?.me?.userId === userId, '5. app token CAN read me (allow-listed)');

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const cc = await gql(Q.createCode, { i: { appId: APP_A, codeChallenge: challenge, codeChallengeMethod: 'S256', redirectUri: 'http://localhost/cb' } }, session);
  const authCode = cc.data?.createPortalAuthorizationCode?.code;
  log(!!authCode, '6. createPortalAuthorizationCode (session) returns one-time code', JSON.stringify(cc.errors ?? ''));
  const ex = await gql(Q.exchange, { i: { code: authCode, codeVerifier: verifier } });
  log(ex.data?.exchangePortalCode?.appId === APP_A, '7. exchangePortalCode (PKCE) returns app token');
  const reuse = await gql(Q.exchange, { i: { code: authCode, codeVerifier: verifier } });
  log(!reuse.data?.exchangePortalCode, '8. code is single-use (reuse rejected)');

  const refreshed = (await gql(Q.refresh, {}, ex.data.exchangePortalCode.token)).data?.refreshAppToken;
  log(!!refreshed?.token && refreshed.token !== ex.data.exchangePortalCode.token, '9. refreshAppToken rotates the token');
  const oldMe = await gql(Q.me, {}, ex.data.exchangePortalCode.token);
  log(!oldMe.data?.me, '10. rotated-out token revoked (me rejected)');

  if (CONN) {
    const e = (await gql(Q.mint, { i: { appId: APP_A } }, session)).data?.mintAppToken;
    execSync(`psql "${CONN}" -c "UPDATE game_tokens SET expires_at = now() - interval '5 min' WHERE token = '${e.token}';"`, { stdio: 'ignore' });
    const expMe = await gql(Q.me, {}, e.token);
    log(!expMe.data?.me, '11. expired app token rejected on management plane');
  }

  await gql(Q.logout, {}, session);
  const sm = await gql(Q.me, {}, session);
  log(!sm.data?.me, '12. logout revokes session');
  const cm = await gql(Q.me, {}, refreshed?.token);
  log(!cm.data?.me, '13. logout cascades to child app tokens');

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
