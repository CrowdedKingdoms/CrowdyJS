import { parse } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { GraphQLClient } from '../client.js';
import type { AuthState } from '../auth-state.js';
import { LogoutAllDevicesDocument, LogoutDocument } from '../generated/graphql.js';

/**
 * Authentication and account lifecycle — exposed as `client.auth`.
 *
 * Crowded Kingdoms is **passwordless**. There is no email+password login: a user
 * authenticates with an emailed magic link, a federated social provider (OIDC),
 * or — in development only — the dev bypass. Every path returns an identity
 * SESSION token (management-plane), which is stored on the shared session state
 * automatically. Gameplay tokens are minted separately via `client.portal`.
 *
 * Part of the management surface.
 *
 * **Public (no session):** {@link requestLoginLink}, {@link completeLoginLink},
 * {@link socialLoginStart}, {@link socialLoginComplete}, {@link devLogin},
 * {@link availableLoginProviders}. **Require a session:** {@link logout},
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

const AUTH_RESPONSE_FIELDS = 'token gameTokenId user { userId email gamertag }';
const IDENTITY_FIELDS =
  'identityId provider subject email emailVerified createdAt lastLoginAt';

const RequestLoginLinkDocument = parse(
  `mutation RequestLoginLink($input: RequestLoginLinkInput!) { requestLoginLink(input: $input) { sent devToken } }`,
) as TypedDocumentNode<
  { requestLoginLink: { sent: boolean; devToken: string | null } },
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

const DevLoginDocument = parse(
  `mutation DevLogin($input: DevLoginInput!) { devLogin(input: $input) { ${AUTH_RESPONSE_FIELDS} } }`,
) as TypedDocumentNode<
  { devLogin: AuthResponse },
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
   * account on first sign-in). Always resolves `sent: true` (no enumeration). In
   * development (`DEV_AUTH_BYPASS`) the response also carries `devToken`, the
   * token to pass straight to {@link completeLoginLink} without an inbox.
   */
  async requestLoginLink(input: {
    email: string;
    redirectUri?: string;
  }): Promise<{ sent: boolean; devToken: string | null }> {
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
   * DEV ONLY bypass sign-in (active only when the server has `DEV_AUTH_BYPASS`).
   * Returns a session for `email` without email/social verification; stores it.
   * Throws `FORBIDDEN` when the bypass is disabled (e.g. production).
   */
  async devLogin(email: string): Promise<AuthResponse> {
    const data = await this.graphql.request(DevLoginDocument, {
      input: { email },
    });
    if (data.devLogin?.token) this.session.setToken(data.devLogin.token);
    return data.devLogin;
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
