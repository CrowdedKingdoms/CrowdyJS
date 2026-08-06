/**
 * Overworld portal: the client side of app-scoped tokens.
 *
 * Two distinct credential kinds replace the old single app-agnostic token:
 *   - an identity SESSION token (from `client.auth.login` / `register`) that
 *     talks to the Management API and is the ONLY thing that can mint app
 *     tokens. Never send it to a game stack.
 *   - short-lived, app-scoped GAMEPLAY tokens, one per game, used against that
 *     game's Game API + realtime surface.
 *
 * Typical wiring is two `CrowdyClient`s sharing nothing but the same Management
 * URL: an "Overworld"/identity client holding the session token, and a per-game
 * client whose token store holds that game's app token.
 *
 * Browser handoff (cross-origin) is an OAuth2 Authorization-Code + PKCE flow:
 *   1. game origin: `beginEntry()` -> redirect the player to the Overworld
 *      `/authorize` page carrying a PKCE challenge + the game's redirect URI.
 *   2. Overworld origin (holds the session): `handleAuthorizeRequest()` ->
 *      mints a one-time code and redirects back to the game.
 *   3. game origin: `completeEntry()` -> exchanges the code (+ the PKCE verifier
 *      it kept locally) for an app token and stores it.
 *
 * Native / same-origin callers can skip the redirect dance and call
 * `mintAppToken(appId)` directly with a session token.
 */

import { parse } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { GraphQLClient } from '../client.js';
import type { SessionStore } from '../session.js';
import { generatePkcePair, generateState } from '../pkce.js';

export interface AppTokenResponse {
  /** Opaque app-scoped gameplay token. Send to the app's Game API as a Bearer. */
  token: string;
  gameTokenId: string;
  /** The app this token is confined to (decimal string). */
  appId: string;
  /** ISO-8601 UTC expiry. Refresh (same app) or re-portal before this. */
  expiresAt: string;
  /** Base HTTPS URL of the Game API serving this app (null if unrouted). */
  gameApiUrl: string | null;
  /** WebSocket URL of the Game API serving this app. */
  gameApiWsUrl: string | null;
  /**
   * Stable entry origin that reaches SOME healthy instance, whatever has failed.
   *
   * WHY THIS IS NOT `gameApiUrl`. The published origin resolves to EVERY datacenter's
   * load balancer, while `gameApiUrl` is the ONE datacenter holding this app's shards.
   * So `gameApiUrl` is where the gameplay goes and this is the way back: it is the only
   * address that survives losing a datacenter.
   *
   * It matters most for a client holding only an app token, which is the normal state
   * after a portal entry. Such a client CANNOT re-mint — minting needs the identity
   * session it does not have — so without this it has nothing left to ask when its
   * endpoint stops answering. Pass it as `realtime.discoveryUrl` and the SDK builds
   * re-discovery from it.
   *
   * Null against a Game API older than the datacenter rebuild, which did not return it.
   */
  discoveryUrl: string | null;
  /** Browser launch URL for this app, if configured. */
  launchUrl: string | null;
}

export interface PortalAuthorizationCode {
  code: string;
  redirectUri: string;
  expiresAt: string;
}

/** Persists the PKCE verifier across the cross-origin redirect round-trip. */
export interface PkceStore {
  get(state: string): string | null | Promise<string | null>;
  set(state: string, verifier: string): void | Promise<void>;
  remove(state: string): void | Promise<void>;
}

/** Default PKCE store backed by sessionStorage; no-op when unavailable (SSR). */
export class BrowserSessionPkceStore implements PkceStore {
  constructor(private readonly prefix = 'crowdyjs:pkce:') {}
  private ss(): Storage | null {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  }
  get(state: string): string | null {
    return this.ss()?.getItem(this.prefix + state) ?? null;
  }
  set(state: string, verifier: string): void {
    this.ss()?.setItem(this.prefix + state, verifier);
  }
  remove(state: string): void {
    this.ss()?.removeItem(this.prefix + state);
  }
}

const APP_TOKEN_FIELDS =
  'token gameTokenId appId expiresAt gameApiUrl gameApiWsUrl discoveryUrl launchUrl';

const MintAppTokenDocument = parse(
  `mutation MintAppToken($input: MintAppTokenInput!) { mintAppToken(input: $input) { ${APP_TOKEN_FIELDS} } }`,
) as TypedDocumentNode<
  { mintAppToken: AppTokenResponse },
  { input: { appId: string } }
>;

const CreatePortalAuthorizationCodeDocument = parse(
  `mutation CreatePortalAuthorizationCode($input: CreatePortalAuthorizationCodeInput!) { createPortalAuthorizationCode(input: $input) { code redirectUri expiresAt } }`,
) as TypedDocumentNode<
  { createPortalAuthorizationCode: PortalAuthorizationCode },
  {
    input: {
      appId: string;
      codeChallenge: string;
      codeChallengeMethod?: string;
      redirectUri: string;
    };
  }
>;

const ExchangePortalCodeDocument = parse(
  `mutation ExchangePortalCode($input: ExchangePortalCodeInput!) { exchangePortalCode(input: $input) { ${APP_TOKEN_FIELDS} } }`,
) as TypedDocumentNode<
  { exchangePortalCode: AppTokenResponse },
  { input: { code: string; codeVerifier?: string } }
>;

const RefreshAppTokenDocument = parse(
  `mutation RefreshAppToken { refreshAppToken { ${APP_TOKEN_FIELDS} } }`,
) as TypedDocumentNode<{ refreshAppToken: AppTokenResponse }, Record<string, never>>;

export interface PortalConsentState {
  appId: string;
  appName: string | null;
  /** True for first-party/trusted apps (consent always skipped). */
  trusted: boolean;
  alreadyGranted: boolean;
  /** True if the Overworld must show a consent screen before minting a code. */
  consentRequired: boolean;
}

export interface AppAuthorizationGrant {
  grantId: string;
  appId: string;
  appName: string | null;
  scopes: string[];
  status: string;
  grantedAt: string;
  revokedAt: string | null;
}

/** Thrown by {@link PortalAPI.handleAuthorizeRequest} when the user must consent. */
export class PortalConsentRequiredError extends Error {
  constructor(
    public readonly appId: string,
    public readonly appName: string | null,
  ) {
    super(`Consent required for app ${appId}`);
    this.name = 'PortalConsentRequiredError';
  }
}

const PortalConsentDocument = parse(
  `query PortalConsent($appId: BigInt!) { portalConsent(appId: $appId) { appId appName trusted alreadyGranted consentRequired } }`,
) as TypedDocumentNode<
  { portalConsent: PortalConsentState },
  { appId: string }
>;

const AuthorizeAppDocument = parse(
  `mutation AuthorizeApp($input: AuthorizeAppInput!) { authorizeApp(input: $input) { grantId appId status scopes } }`,
) as TypedDocumentNode<
  { authorizeApp: AppAuthorizationGrant },
  { input: { appId: string; scopes?: string[] } }
>;

const RevokeAppAuthorizationDocument = parse(
  `mutation RevokeAppAuthorization($appId: BigInt!) { revokeAppAuthorization(appId: $appId) }`,
) as TypedDocumentNode<
  { revokeAppAuthorization: boolean },
  { appId: string }
>;

const MyAuthorizedAppsDocument = parse(
  `query MyAuthorizedApps { myAuthorizedApps { grantId appId appName scopes status grantedAt revokedAt } }`,
) as TypedDocumentNode<
  { myAuthorizedApps: AppAuthorizationGrant[] },
  Record<string, never>
>;

const SetAppClientSettingsDocument = parse(
  `mutation SetAppClientSettings($input: SetAppClientSettingsInput!) { setAppClientSettings(input: $input) { appId appName trusted consentRequired } }`,
) as TypedDocumentNode<
  { setAppClientSettings: PortalConsentState },
  {
    input: {
      appId: string;
      redirectUris?: string[];
      clientType?: string;
      launchUrl?: string;
    };
  }
>;

export interface BeginEntryParams {
  /** Target app id (decimal string). */
  appId: string;
  /** The Overworld identity origin's authorize page, e.g. `https://overworld.example.com/authorize`. */
  authorizeUrl: string;
  /** Where the Overworld should send the player back (this game's callback). */
  redirectUri: string;
  /** Optional CSRF/correlation state; one is generated if omitted. */
  state?: string;
}

export class PortalAPI {
  constructor(
    private readonly management: GraphQLClient,
    private readonly session: SessionStore,
    private readonly pkceStore: PkceStore = new BrowserSessionPkceStore(),
  ) {}

  /**
   * Native/direct mint: exchange the caller's identity session token for an
   * app-scoped gameplay token. Returns the token; it is NOT stored on this
   * client (build a per-game client with it). Free/open apps auto-grant access;
   * paid apps require an existing entitlement.
   */
  async mintAppToken(appId: string): Promise<AppTokenResponse> {
    const data = await this.management.request(MintAppTokenDocument, {
      input: { appId },
    });
    return data.mintAppToken;
  }

  /**
   * Overworld/identity side: mint a one-time authorization code for a target
   * app, bound to the destination game's PKCE challenge + redirect URI.
   * Requires the identity session token.
   */
  async createAuthorizationCode(params: {
    appId: string;
    codeChallenge: string;
    codeChallengeMethod?: string;
    redirectUri: string;
  }): Promise<PortalAuthorizationCode> {
    const data = await this.management.request(
      CreatePortalAuthorizationCodeDocument,
      { input: params },
    );
    return data.createPortalAuthorizationCode;
  }

  /**
   * Destination-game side: exchange a one-time code (+ PKCE verifier) for an app
   * token and store it on this client's session so subsequent Game API calls are
   * authenticated. Public — no session token required.
   */
  async exchangeCode(
    code: string,
    codeVerifier?: string,
  ): Promise<AppTokenResponse> {
    const data = await this.management.request(ExchangePortalCodeDocument, {
      input: { code, codeVerifier },
    });
    this.session.setToken(data.exchangePortalCode.token);
    return data.exchangePortalCode;
  }

  /**
   * Same-app refresh: rotate the current app token for a fresh one (extended
   * TTL) and store it. Call before expiry to keep playing without bouncing
   * through the Overworld. Requires the current app token on this session.
   */
  async refresh(): Promise<AppTokenResponse> {
    const data = await this.management.request(RefreshAppTokenDocument, {});
    this.session.setToken(data.refreshAppToken.token);
    return data.refreshAppToken;
  }

  // ----- Consent + connected apps ------------------------------------------

  /** Whether portaling into an app needs a consent prompt (Overworld side). */
  async getConsent(appId: string): Promise<PortalConsentState> {
    const data = await this.management.request(PortalConsentDocument, { appId });
    return data.portalConsent;
  }

  /** Record the user's consent for an app (call from the consent screen). */
  async authorizeApp(
    appId: string,
    scopes?: string[],
  ): Promise<AppAuthorizationGrant> {
    const data = await this.management.request(AuthorizeAppDocument, {
      input: { appId, scopes },
    });
    return data.authorizeApp;
  }

  /** Revoke a prior authorization; also revokes the user's live tokens for it. */
  async revokeAppAuthorization(appId: string): Promise<boolean> {
    const data = await this.management.request(RevokeAppAuthorizationDocument, {
      appId,
    });
    return data.revokeAppAuthorization;
  }

  /** The user's active app authorizations ("connected apps"). */
  async myAuthorizedApps(): Promise<AppAuthorizationGrant[]> {
    const data = await this.management.request(MyAuthorizedAppsDocument);
    return data.myAuthorizedApps;
  }

  /** Register/update an app's portal client settings (requires manage_apps). */
  async setAppClientSettings(input: {
    appId: string;
    redirectUris?: string[];
    clientType?: string;
    launchUrl?: string;
  }): Promise<PortalConsentState> {
    const data = await this.management.request(SetAppClientSettingsDocument, {
      input,
    });
    return data.setAppClientSettings;
  }

  // ----- Browser PKCE redirect helpers -------------------------------------

  /**
   * Destination-game side, step 1: generate a PKCE pair, persist the verifier,
   * and return the Overworld authorize URL to navigate to. The caller does
   * `window.location.assign(url)`.
   */
  async beginEntry(params: BeginEntryParams): Promise<string> {
    const state = params.state ?? generateState();
    const pkce = await generatePkcePair();
    await this.pkceStore.set(state, pkce.verifier);
    const url = new URL(params.authorizeUrl);
    url.searchParams.set('app_id', params.appId);
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', pkce.method);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /**
   * Overworld/identity side: handle an incoming `/authorize` request. Reads the
   * game's params from the URL, mints a code with the session token, and returns
   * the URL to redirect the player back to (carrying `code` + `state`).
   */
  async handleAuthorizeRequest(
    search?: string,
    options?: { grantConsent?: boolean; scopes?: string[] },
  ): Promise<string> {
    const params = new URLSearchParams(search ?? defaultSearch());
    const appId = params.get('app_id');
    const codeChallenge = params.get('code_challenge');
    const redirectUri = params.get('redirect_uri');
    const state = params.get('state') ?? '';
    const codeChallengeMethod =
      params.get('code_challenge_method') ?? 'S256';
    if (!appId || !codeChallenge || !redirectUri) {
      throw new Error(
        'authorize request missing app_id, code_challenge, or redirect_uri',
      );
    }
    // Consent gate: trusted apps + already-granted apps proceed silently. For an
    // untrusted, not-yet-granted app, either record consent (when the user
    // approved on the consent screen) or signal the caller to show one.
    const consent = await this.getConsent(appId);
    if (consent.consentRequired) {
      if (options?.grantConsent) {
        await this.authorizeApp(appId, options.scopes);
      } else {
        throw new PortalConsentRequiredError(appId, consent.appName);
      }
    }
    const result = await this.createAuthorizationCode({
      appId,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
    });
    const back = new URL(result.redirectUri);
    back.searchParams.set('code', result.code);
    if (state) back.searchParams.set('state', state);
    return back.toString();
  }

  /**
   * Destination-game side, step 3: read `code` + `state` from the callback URL,
   * load the stored verifier, exchange for an app token, and store it. Returns
   * null when there is no `code` param (so it's safe to call unconditionally on
   * boot).
   */
  async completeEntry(search?: string): Promise<AppTokenResponse | null> {
    const params = new URLSearchParams(search ?? defaultSearch());
    const code = params.get('code');
    if (!code) return null;
    const state = params.get('state') ?? '';
    const verifier = (await this.pkceStore.get(state)) ?? undefined;
    const token = await this.exchangeCode(code, verifier);
    if (state) await this.pkceStore.remove(state);
    return token;
  }
}

function defaultSearch(): string {
  const loc = (globalThis as { location?: { search?: string } }).location;
  return loc?.search ?? '';
}
