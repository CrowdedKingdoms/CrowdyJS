import { parse } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { GraphQLClient } from '../client.js';
import type { AuthState } from '../auth-state.js';
import { LogoutAllDevicesDocument, LogoutDocument } from '../generated/graphql.js';

/**
 * Authentication and account lifecycle — exposed as `client.auth`.
 *
 * Four ways to sign in: email + password ({@link register} / {@link login}), an
 * emailed magic link, or a federated social provider (OIDC). Every path returns
 * an identity SESSION token (management-plane), which is stored on the shared
 * session state automatically. Gameplay tokens are minted separately via
 * `client.portal`.
 *
 * This comment used to say Crowded Kingdoms was passwordless and that there was
 * no email+password login. That was never true of the server: `login` and
 * `register` have been first-class in the API throughout, and the C++ load
 * tester has used them all along. Only this SDK pretended otherwise, and the
 * gap sent integrators to the dev bypass — which no longer exists on any tier.
 *
 * Part of the management surface.
 *
 * **Public (no session):** {@link register}, {@link login},
 * {@link requestLoginLink}, {@link completeLoginLink}, {@link socialLoginStart},
 * {@link socialLoginComplete}, {@link availableLoginProviders},
 * {@link checkAuthMethod}. **Require a session:** {@link logout},
 * {@link logoutAllDevices}, {@link myIdentities}, {@link linkIdentity},
 * {@link unlinkIdentity}.
 */
export interface AuthUser {
  userId: string;
  email?: string | null;
  gamertag?: string | null;
}

export interface AuthResponse {
  /** Identity session token; stored on the session state automatically. */
  token: string;
  gameTokenId: string;
  user: AuthUser;
}

export interface UserIdentity {
  identityId: string;
  provider: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/**
 * `register` refused because the address already has an account.
 *
 * Matched on WORDING rather than on an error code, which looks fragile and is
 * the only thing that works: the server raises a Nest `ConflictException` and it
 * arrives over GraphQL as `INTERNAL_SERVER_ERROR` — verified against a live
 * tier — so a caller keying on `CONFLICT` matches nothing and treats a routine
 * "this account exists" as a server fault.
 */
export function isAlreadyRegisteredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /account with this email already exists/i.test(message);
}

/**
 * `login` refused because the password is real but not yet confirmed, on an
 * account that has another verified sign-in method. The remedy is the emailed
 * confirmation link, not a different password — so this must not be reported to
 * the user as "wrong password".
 */
export function isPasswordUnconfirmedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /confirm your email to enable password sign-in/i.test(message);
}

const AUTH_RESPONSE_FIELDS = 'token gameTokenId user { userId email gamertag }';
const IDENTITY_FIELDS =
  'identityId provider subject email emailVerified createdAt lastLoginAt';

// `devToken` is NOT selected. The field returned the magic-link token in
// plaintext whenever the server had the dev bypass on, which made an emailed
// one-time secret readable by any unauthenticated caller. It is gone from the
// server; selecting it here would make every requestLoginLink call fail
// validation against a current API.
const RequestLoginLinkDocument = parse(
  `mutation RequestLoginLink($input: RequestLoginLinkInput!) { requestLoginLink(input: $input) { sent } }`,
) as TypedDocumentNode<
  { requestLoginLink: { sent: boolean } },
  { input: { email: string; redirectUri?: string } }
>;

const CompleteLoginLinkDocument = parse(
  `mutation CompleteLoginLink($input: CompleteLoginLinkInput!) { completeLoginLink(input: $input) { ${AUTH_RESPONSE_FIELDS} } }`,
) as TypedDocumentNode<
  { completeLoginLink: AuthResponse },
  { input: { token: string } }
>;

const SocialLoginStartDocument = parse(
  `mutation SocialLoginStart($input: SocialLoginStartInput!) { socialLoginStart(input: $input) { authorizeUrl state } }`,
) as TypedDocumentNode<
  { socialLoginStart: { authorizeUrl: string; state: string } },
  { input: { provider: string; redirectUri: string } }
>;

const SocialLoginCompleteDocument = parse(
  `mutation SocialLoginComplete($input: SocialLoginCompleteInput!) { socialLoginComplete(input: $input) { ${AUTH_RESPONSE_FIELDS} } }`,
) as TypedDocumentNode<
  { socialLoginComplete: AuthResponse },
  { input: { provider: string; code: string; state: string } }
>;

// `login` and `register` take a NON-STANDARD argument name -- `loginUserInput`
// and `registerUserInput` rather than `input`. That is the server's spelling and
// it is not negotiable from here; getting it wrong produces a validation error
// naming a field the caller never wrote.
const LoginDocument = parse(
  `mutation Login($loginUserInput: LoginUserInput!) { login(loginUserInput: $loginUserInput) { ${AUTH_RESPONSE_FIELDS} } }`,
) as TypedDocumentNode<
  { login: AuthResponse },
  { loginUserInput: { email: string; password: string } }
>;

const RegisterDocument = parse(
  `mutation Register($registerUserInput: RegisterUserInput!) { register(registerUserInput: $registerUserInput) { ${AUTH_RESPONSE_FIELDS} } }`,
) as TypedDocumentNode<
  { register: AuthResponse },
  { registerUserInput: { email: string; password: string; gamertag?: string } }
>;

const CheckAuthMethodDocument = parse(
  `query CheckAuthMethod($input: CheckAuthMethodInput!) { checkAuthMethod(input: $input) { hasPassword } }`,
) as TypedDocumentNode<
  { checkAuthMethod: { hasPassword: boolean } },
  { input: { email: string } }
>;

const AvailableLoginProvidersDocument = parse(
  `query AvailableLoginProviders { availableLoginProviders }`,
) as TypedDocumentNode<
  { availableLoginProviders: string[] },
  Record<string, never>
>;

const MyIdentitiesDocument = parse(
  `query MyIdentities { myIdentities { ${IDENTITY_FIELDS} } }`,
) as TypedDocumentNode<{ myIdentities: UserIdentity[] }, Record<string, never>>;

const LinkIdentityDocument = parse(
  `mutation LinkIdentity($input: LinkIdentityInput!) { linkIdentity(input: $input) { ${IDENTITY_FIELDS} } }`,
) as TypedDocumentNode<
  { linkIdentity: UserIdentity },
  { input: { provider: string; code: string; state: string } }
>;

const UnlinkIdentityDocument = parse(
  `mutation UnlinkIdentity($identityId: String!) { unlinkIdentity(identityId: $identityId) }`,
) as TypedDocumentNode<{ unlinkIdentity: boolean }, { identityId: string }>;

export class AuthAPI {
  constructor(
    private readonly graphql: GraphQLClient,
    private readonly session: AuthState,
  ) {}

  /** The federated sign-in providers currently enabled (e.g. `['google']`). */
  async availableLoginProviders(): Promise<string[]> {
    const data = await this.graphql.request(AvailableLoginProvidersDocument);
    return data.availableLoginProviders;
  }

  /**
   * Passwordless: email the address a one-time magic sign-in link (creating the
   * account on first sign-in). Always resolves `sent: true` (no enumeration).
   *
   * The token arrives only by email. There is no longer a `devToken` shortcut —
   * automated callers that need a session without an inbox should
   * {@link register} an account they own the password to.
   */
  async requestLoginLink(input: {
    email: string;
    redirectUri?: string;
  }): Promise<{ sent: boolean }> {
    const data = await this.graphql.request(RequestLoginLinkDocument, { input });
    return data.requestLoginLink;
  }

  /** Complete a magic-link sign-in; stores the session token on success. */
  async completeLoginLink(token: string): Promise<AuthResponse> {
    const data = await this.graphql.request(CompleteLoginLinkDocument, {
      input: { token },
    });
    if (data.completeLoginLink?.token)
      this.session.setToken(data.completeLoginLink.token);
    return data.completeLoginLink;
  }

  /**
   * Begin a federated (social) sign-in. Returns an `authorizeUrl` to redirect the
   * user to and an opaque `state` to round-trip back to {@link socialLoginComplete}.
   */
  async socialLoginStart(
    provider: string,
    redirectUri: string,
  ): Promise<{ authorizeUrl: string; state: string }> {
    const data = await this.graphql.request(SocialLoginStartDocument, {
      input: { provider, redirectUri },
    });
    return data.socialLoginStart;
  }

  /** Complete a federated sign-in from the provider callback; stores the token. */
  async socialLoginComplete(input: {
    provider: string;
    code: string;
    state: string;
  }): Promise<AuthResponse> {
    const data = await this.graphql.request(SocialLoginCompleteDocument, {
      input,
    });
    if (data.socialLoginComplete?.token)
      this.session.setToken(data.socialLoginComplete.token);
    return data.socialLoginComplete;
  }

  /**
   * Sign in with email + password; stores the session token on success.
   *
   * Throws when the credentials are wrong, and — separately — when the account
   * has another verified sign-in method and the password has not yet been
   * confirmed by email. {@link isPasswordUnconfirmedError} tells those apart,
   * because they need different things from the user.
   */
  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const data = await this.graphql.request(LoginDocument, {
      loginUserInput: input,
    });
    if (data.login?.token) this.session.setToken(data.login.token);
    return data.login;
  }

  /**
   * Create an email + password account; stores the session token on success.
   *
   * **A brand-new address gets a session immediately.** An address that already
   * has an account does NOT: the password is attached pending email
   * confirmation and the server throws instead of returning a token, so the
   * caller cannot treat "registered" and "signed in" as one outcome. Use
   * {@link isAlreadyRegisteredError} to detect it and fall back to
   * {@link login} or {@link requestLoginLink}.
   */
  async register(input: {
    email: string;
    password: string;
    gamertag?: string;
  }): Promise<AuthResponse> {
    const data = await this.graphql.request(RegisterDocument, {
      registerUserInput: input,
    });
    if (data.register?.token) this.session.setToken(data.register.token);
    return data.register;
  }

  /**
   * Email-first adaptive login: does this address have password sign-in enabled?
   * Public, and deliberately does not reveal whether the address is registered.
   */
  async checkAuthMethod(email: string): Promise<{ hasPassword: boolean }> {
    const data = await this.graphql.request(CheckAuthMethodDocument, {
      input: { email },
    });
    return data.checkAuthMethod;
  }

  /** The signed-in user's linked sign-in identities. Requires a session. */
  async myIdentities(): Promise<UserIdentity[]> {
    const data = await this.graphql.request(MyIdentitiesDocument);
    return data.myIdentities;
  }

  /** Link an additional federated identity (from a social callback). */
  async linkIdentity(input: {
    provider: string;
    code: string;
    state: string;
  }): Promise<UserIdentity> {
    const data = await this.graphql.request(LinkIdentityDocument, { input });
    return data.linkIdentity;
  }

  /** Unlink a federated identity (cannot remove the last sign-in method). */
  async unlinkIdentity(identityId: string): Promise<boolean> {
    const data = await this.graphql.request(UnlinkIdentityDocument, {
      identityId,
    });
    return data.unlinkIdentity;
  }

  /** Single-device logout; clears the in-memory token on success. */
  async logout(): Promise<boolean> {
    const data = await this.graphql.request(LogoutDocument);
    this.session.setToken(null);
    return data.logout;
  }

  /** Revoke every active session for the user. Requires a session. */
  async logoutAllDevices(): Promise<boolean> {
    const data = await this.graphql.request(LogoutAllDevicesDocument);
    return data.logoutAllDevices;
  }

  /** Imperatively set the in-memory bearer token (e.g. rehydrate). */
  setToken(token: string | null): void {
    this.session.setToken(token);
  }

  /** Read the current in-memory bearer token. */
  getToken(): string | null {
    return this.session.getToken();
  }
}
