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
 * The same gap ran one method deeper until 2026-08-21: password MANAGEMENT
 * (reset, change, and adding a first password) was served by the API and
 * wrapped here by nothing, so a game shipping this SDK had no first-class way
 * to let a player set or change a password.
 *
 * Part of the management surface.
 *
 * **Public (no session):** {@link register}, {@link login},
 * {@link requestLoginLink}, {@link completeLoginLink}, {@link socialLoginStart},
 * {@link socialLoginComplete}, {@link availableLoginProviders},
 * {@link checkAuthMethod}, {@link requestPasswordReset}, {@link resetPassword}.
 * **Require a session:** {@link logout}, {@link logoutAllDevices},
 * {@link myIdentities}, {@link linkIdentity}, {@link unlinkIdentity},
 * {@link changePassword}, {@link setInitialPassword}.
 *
 * **Which password method:** the four are distinguished by what the caller has
 * already proven, not by what they want to do. Signed in with a password →
 * {@link changePassword}. Signed in with none → {@link setInitialPassword}.
 * Not signed in, or signed in and cannot remember it →
 * {@link requestPasswordReset} then {@link resetPassword}.
 * {@link checkAuthMethod} answers `hasPassword` for an address before sign-in.
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
 * The `extensions.code` of the first GraphQL error, if there is one.
 *
 * Every predicate below asks the CODE first and the wording second, and the
 * order is not a style choice. ck-api v1.60.0 fixed a mapping defect that made
 * these codes unusable: `@nestjs/apollo` translates four HTTP statuses and
 * collapses the rest, so a 409 arrived as `INTERNAL_SERVER_ERROR` and both of
 * `changePassword`'s refusals arrived as `UNAUTHENTICATED` — the same code an
 * expired session produces. The wording fallback is therefore not legacy
 * clutter: a tier that has not deployed v1.60.0 still answers the old way, and
 * a game pinning this SDK exactly may meet either. Delete it when no tier
 * predates v1.60.0, and not before.
 */
/**
 * `extensions.code` off anything error-shaped, whether it is a
 * {@link CrowdyGraphQLError}, one raw GraphQL error entry, or the `code` getter
 * the former lifts to the top level — all three reach a caller here, depending
 * on whether the error was rethrown or destructured on the way.
 */
function codeOf(error: unknown): string | undefined {
  const shape = error as
    | { extensions?: { code?: unknown }; code?: unknown }
    | null
    | undefined;
  if (typeof shape?.extensions?.code === 'string') return shape.extensions.code;
  return typeof shape?.code === 'string' ? shape.code : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `register` refused because the address already has an account.
 *
 * `EMAIL_ALREADY_REGISTERED` from v1.60.0. Before that it arrived as
 * `INTERNAL_SERVER_ERROR`, so a caller keying on the code matched nothing and
 * treated a routine "this account exists" as a server fault; the wording branch
 * is what still works against those tiers.
 *
 * Note what this does NOT accept: a bare `CONFLICT`. From v1.60.0 that is the
 * code a generic 409 carries, and a generic code cannot identify a specific
 * condition — a predicate that accepted it would report any future conflict in
 * this mutation as "already registered". Only a code minted for this outcome
 * will do.
 */
export function isAlreadyRegisteredError(error: unknown): boolean {
  return (
    codeOf(error) === 'EMAIL_ALREADY_REGISTERED' ||
    /account with this email already exists/i.test(messageOf(error))
  );
}

/**
 * `login` refused because the password is real but not yet confirmed, on an
 * account that has another verified sign-in method. The remedy is the emailed
 * confirmation link, not a different password — so this must not be reported to
 * the user as "wrong password".
 *
 * **The one refusal here with no code of its own, and the only wording-only
 * predicate left.** ck-api v1.60.0 gave the other four a dedicated
 * `extensions.code`; this one is still a plain `UnauthorizedException`, so it
 * arrives as `UNAUTHENTICATED` — the same code as an expired session, whose
 * remedy (sign in again) is the opposite of this one's. The message is
 * therefore the only discriminator, and the absence of a `codeOf` branch below
 * is deliberate rather than an oversight: there is no code to read.
 */
export function isPasswordUnconfirmedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /confirm your email to enable password sign-in/i.test(message);
}

/**
 * {@link setInitialPassword} refused because the account already has a
 * password. The remedy is {@link changePassword}, which verifies the current
 * one.
 *
 * The refusal is deliberate and load-bearing: without it, `setInitialPassword`
 * would be `changePassword` with the current-password check deleted, which is
 * the check that stops a stolen session from silently locking the owner out.
 * So a caller must route to `changePassword` rather than retrying.
 *
 * `PASSWORD_ALREADY_SET` from ck-api v1.60.0. Before that the schema said this
 * "throws CONFLICT" and it reached clients as `INTERNAL_SERVER_ERROR`, so the
 * message was the only thing to match — which is why the wording branch is
 * still here.
 */
export function isPasswordAlreadySetError(error: unknown): boolean {
  return (
    codeOf(error) === 'PASSWORD_ALREADY_SET' ||
    /this account already has a password/i.test(messageOf(error))
  );
}

/**
 * {@link changePassword} refused because there is no password to change — a
 * magic-link or social-only account. The remedy is {@link setInitialPassword}
 * while signed in, or {@link requestPasswordReset}.
 *
 * `PASSWORD_NOT_SET` from ck-api v1.60.0. Before that this and
 * {@link isInvalidCurrentPasswordError} both arrived as `UNAUTHENTICATED`,
 * which is ALSO what an expired session looks like — so a caller keying on the
 * code signed the user out when they had merely typed the wrong current
 * password, or offered a password field on an account that has none. That is
 * the defect the new codes exist to remove, and the wording branch is what
 * still separates them on a tier that has not deployed it.
 */
export function isNoPasswordSetError(error: unknown): boolean {
  return (
    codeOf(error) === 'PASSWORD_NOT_SET' ||
    /no password is set on this account/i.test(messageOf(error))
  );
}

/**
 * {@link changePassword} refused because the current password is wrong. The
 * remedy is to ask again — the session is fine.
 *
 * `INVALID_CURRENT_PASSWORD` (HTTP 403) from ck-api v1.60.0. See
 * {@link isNoPasswordSetError} for what it used to be and why the wording
 * branch stays.
 */
export function isInvalidCurrentPasswordError(error: unknown): boolean {
  return (
    codeOf(error) === 'INVALID_CURRENT_PASSWORD' ||
    /invalid current password/i.test(messageOf(error))
  );
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

// PASSWORD MANAGEMENT. Four mutations, and they are four rather than one or two
// on purpose: each is defined by what the CALLER has already proven, and
// collapsing any pair would delete the proof.
//
//   requestPasswordReset / resetPassword  proof = the emailed token
//   changePassword                        proof = the current password
//   setInitialPassword                    proof = the session, and there is no
//                                                 password to verify
//
// `changePassword` takes its two arguments FLAT rather than in an input object,
// and `resetPassword` takes `resetPasswordInput` rather than `input`. Both are
// the server's spelling; see the note above `LoginDocument`.
const RequestPasswordResetDocument = parse(
  `mutation RequestPasswordReset($email: String!) { requestPasswordReset(email: $email) }`,
) as TypedDocumentNode<{ requestPasswordReset: boolean }, { email: string }>;

const ResetPasswordDocument = parse(
  `mutation ResetPassword($resetPasswordInput: ResetPasswordInput!) { resetPassword(resetPasswordInput: $resetPasswordInput) }`,
) as TypedDocumentNode<
  { resetPassword: boolean },
  { resetPasswordInput: { token: string; newPassword: string } }
>;

const ChangePasswordDocument = parse(
  `mutation ChangePassword($currentPassword: String!, $newPassword: String!) { changePassword(currentPassword: $currentPassword, newPassword: $newPassword) }`,
) as TypedDocumentNode<
  { changePassword: boolean },
  { currentPassword: string; newPassword: string }
>;

const SetInitialPasswordDocument = parse(
  `mutation SetInitialPassword($newPassword: String!) { setInitialPassword(newPassword: $newPassword) }`,
) as TypedDocumentNode<{ setInitialPassword: boolean }, { newPassword: string }>;

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

  /**
   * Email a password-reset link to the address. Public.
   *
   * Always resolves `true` whether or not the address has an account, so it
   * cannot be used to enumerate users — which also means a `true` here is not
   * evidence an email was sent.
   *
   * This is the ownership-proven way to add a password to an account that has
   * none, and the only one for a user who is not signed in. A user who IS
   * signed in should use {@link setInitialPassword} instead and skip the inbox.
   */
  async requestPasswordReset(email: string): Promise<boolean> {
    const data = await this.graphql.request(RequestPasswordResetDocument, {
      email,
    });
    return data.requestPasswordReset;
  }

  /**
   * Complete a password reset with the token from the emailed link. Public —
   * the token is the authorization.
   *
   * Throws if the token is invalid or expired. **Existing sessions are not
   * revoked**, so a reset does not by itself evict anyone already signed in;
   * follow it with {@link logoutAllDevices} if that is what you want.
   */
  async resetPassword(input: {
    token: string;
    newPassword: string;
  }): Promise<boolean> {
    const data = await this.graphql.request(ResetPasswordDocument, {
      resetPasswordInput: input,
    });
    return data.resetPassword;
  }

  /**
   * Change the signed-in user's password, verifying the current one. Requires a
   * session.
   *
   * **This is not the method for an account that has no password** — a
   * magic-link or social-only account, which cannot supply a current one. That
   * is {@link setInitialPassword}, and the two are kept apart deliberately:
   * the current-password check here is what stops a stolen session from
   * changing a credential the owner still knows.
   *
   * Three outcomes need telling apart and the error CODE cannot do it, because
   * a wrong current password, an account with no password, and an expired
   * session all arrive as `UNAUTHENTICATED`:
   * {@link isInvalidCurrentPasswordError} (ask again),
   * {@link isNoPasswordSetError} (send them to `setInitialPassword`), and
   * neither (the session is gone — sign in again).
   *
   * **Existing sessions are not revoked.**
   */
  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<boolean> {
    const data = await this.graphql.request(ChangePasswordDocument, input);
    return data.changePassword;
  }

  /**
   * Add a password to the signed-in account when it does not have one yet.
   * Requires a session.
   *
   * For an account created by magic link or a social provider, which until this
   * existed had no in-product route to password sign-in at all — the only door
   * was {@link requestPasswordReset}, an email round trip to add a credential to
   * an account you are already signed in to. The session is the proof of account
   * control, so **the password works immediately**: there is no confirmation
   * email to wait for, and the password identity is written verified (an
   * unverified one would be refused by {@link login} while another verified
   * method exists, which is a dead end that looks like success).
   *
   * **Refuses when a password already exists** — {@link isPasswordAlreadySetError}
   * detects it — rather than replacing it. Without that refusal this would be
   * {@link changePassword} with the current-password check deleted. Route to
   * `changePassword`, or to `requestPasswordReset` if the user has forgotten it.
   *
   * **A security notification is emailed to the account address** whenever this
   * succeeds. That is the mitigation, and it is deliberately a notification
   * rather than a refusal: a stolen session can already attach durable
   * attacker-controlled access via {@link linkIdentity}, so refusing here would
   * remove the legitimate user's only door without closing the class. Do not
   * suppress or reword that email's role when you describe this to a user —
   * "we have emailed you about this change" is part of the feature. The
   * notification is best-effort on the server, so a `true` return is not proof
   * the email was delivered.
   *
   * **Existing sessions are not revoked.**
   */
  async setInitialPassword(newPassword: string): Promise<boolean> {
    const data = await this.graphql.request(SetInitialPasswordDocument, {
      newPassword,
    });
    return data.setInitialPassword;
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
