import type { GraphQLClient } from '../client.js';
import type { AuthState } from '../auth-state.js';
import {
  ChangePasswordDocument,
  ConfirmEmailDocument,
  LoginDocument,
  LogoutAllDevicesDocument,
  LogoutDocument,
  RegisterDocument,
  RequestPasswordResetDocument,
  ResendConfirmationEmailDocument,
  ResetPasswordDocument,
  type LoginMutation,
  type LoginUserInput,
  type RegisterMutation,
  type RegisterUserInput,
  type ResetPasswordInput,
} from '../generated/graphql.js';

/**
 * Authentication and account-lifecycle flows — exposed as `client.auth`.
 *
 * Targets the **management-api**: every call routes to `managementUrl` (falling
 * back to the game-api endpoint only in legacy single-endpoint mode). The
 * management API owns the `game_tokens` table that backs every login / register
 * / password / email-confirmation flow; the `token` it returns is a
 * `game_tokens` row that game-api validates against the same shared Postgres.
 *
 * {@link login} and {@link register} mint that session token **and** store it on
 * the shared session state automatically, so every later call on *either*
 * endpoint (auth, users, apps, actors, chunks, udp, ...) is authenticated
 * without you threading the token through by hand. Use {@link setToken} to
 * rehydrate a saved token and {@link getToken} to read the current one. `BigInt`
 * ids on the returned user (e.g. `userId`, `orgId`) are decimal strings.
 *
 * **Public — no session required:** {@link login}, {@link register},
 * {@link confirmEmail}, {@link requestPasswordReset}, {@link resetPassword}, and
 * {@link resendConfirmationEmail}. **Require a valid session:** {@link logout},
 * {@link logoutAllDevices}, and {@link changePassword}, which otherwise throw
 * {@link CrowdyGraphQLError} with `UNAUTHENTICATED` when the bearer token is
 * missing, expired, or revoked.
 */
export class AuthAPI {
  constructor(
    private readonly graphql: GraphQLClient,
    private readonly session: AuthState,
  ) {}

  /**
   * Authenticate with email + password and start a new session. **Public** — no
   * existing session required.
   *
   * On success the returned `token` is minted **and** stored on the shared
   * session state, so subsequent calls on any sub-client (management-api or
   * game-api) carry it automatically — no need to call {@link setToken}.
   *
   * @param input - Credentials ({@link LoginUserInput}): `email` and `password`
   *   (min 8 characters).
   * @returns An {@link AuthResponse}: the opaque session `token` (sent as
   *   `Authorization: Bearer <token>`), `gameTokenId` (the session row id, a
   *   string), and the authenticated `user`.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` on invalid credentials, or
   *   `BAD_USER_INPUT` on malformed input.
   * @example
   * ```ts
   * const { user } = await client.auth.login({ email, password });
   * // the session token is now stored; later calls are authenticated for you
   * await client.users.me();
   * ```
   */
  async login(input: LoginUserInput): Promise<LoginMutation['login']> {
    const data = await this.graphql.request(LoginDocument, { input });
    if (data.login?.token) {
      this.session.setToken(data.login.token);
    }
    return data.login;
  }

  /**
   * Create a new (initially unconfirmed) account, send a confirmation email, and
   * return a session for immediate login. **Public** — no existing session
   * required. Same token-persistence behaviour as {@link login}: the new `token`
   * is stored on the shared session state automatically.
   *
   * @param input - New-account details ({@link RegisterUserInput}): `email`
   *   (where the confirmation email is sent), `password` (min 8 characters), and
   *   an optional initial `gamertag` (min 3 characters; can also be set later via
   *   `client.users.updateGamertag`).
   * @returns An {@link AuthResponse} (session `token`, `gameTokenId`, and the new
   *   `user`).
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` if the email already exists or
   *   the input is invalid.
   */
  async register(
    input: RegisterUserInput,
  ): Promise<RegisterMutation['register']> {
    const data = await this.graphql.request(RegisterDocument, { input });
    if (data.register?.token) {
      this.session.setToken(data.register.token);
    }
    return data.register;
  }

  /**
   * Single-device logout: revoke the `game_tokens` row that authenticated this
   * request; other devices/tokens are unaffected. After a successful server-side
   * revoke the in-memory token is cleared from the shared session state so the
   * other sub-clients stop using it. Requires a valid session.
   *
   * @returns `true` if a token was revoked, or `false` if the request carried no
   *   game token.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if the session is invalid.
   */
  async logout(): Promise<boolean> {
    const data = await this.graphql.request(LogoutDocument);
    this.session.setToken(null);
    return data.logout;
  }

  /**
   * Revoke **every** active session for the authenticated user (deletes all
   * their `game_tokens` rows and records revocations). Requires a valid session;
   * use {@link logout} to end only the current one.
   *
   * Note: unlike {@link logout}, this does not clear the SDK's in-memory token —
   * call {@link setToken}`(null)` afterwards if you also want to drop it locally.
   *
   * @returns `true` on success.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if the session is invalid.
   */
  async logoutAllDevices(): Promise<boolean> {
    const data = await this.graphql.request(LogoutAllDevicesDocument);
    return data.logoutAllDevices;
  }

  /**
   * Confirm a user's email address using the token from the confirmation email.
   * **Public** — the token itself authorizes the call.
   *
   * @param token - The confirmation token from the emailed link.
   * @returns `true` on success, or `false` if the token is invalid or expired.
   * @throws {CrowdyGraphQLError} on transport/validation failures (invalid or
   *   expired tokens resolve to `false` rather than throwing).
   */
  async confirmEmail(token: string): Promise<boolean> {
    const data = await this.graphql.request(ConfirmEmailDocument, { token });
    return data.confirmEmail;
  }

  /**
   * Start the password-reset flow by emailing a reset link to the address.
   * **Public**. Always returns `true` regardless of whether the email exists or
   * is confirmed, to prevent account enumeration.
   *
   * @param email - Email address to send the password-reset link to.
   * @returns `true` (always, even when no such account exists).
   * @throws {CrowdyGraphQLError} on transport/validation failures.
   */
  async requestPasswordReset(email: string): Promise<boolean> {
    const data = await this.graphql.request(RequestPasswordResetDocument, {
      email,
    });
    return data.requestPasswordReset;
  }

  /**
   * Complete a password reset using the reset token and a new password.
   * **Public** — the reset token authorizes the call. Existing sessions are
   * **not** revoked.
   *
   * @param input - {@link ResetPasswordInput}: the `token` from the emailed reset
   *   link and the `newPassword` to set (min 8 characters).
   * @returns `true` on success.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` if the token is invalid or
   *   expired.
   */
  async resetPassword(input: ResetPasswordInput): Promise<boolean> {
    const data = await this.graphql.request(ResetPasswordDocument, {
      input,
    });
    return data.resetPassword;
  }

  /**
   * Re-send the email-confirmation link. **Public**. Always returns `true`
   * regardless of whether the account exists or is already confirmed (prevents
   * enumeration); the email is only actually sent for existing unconfirmed
   * accounts.
   *
   * @param email - Email address of the account to re-send confirmation to.
   * @returns `true` (always).
   * @throws {CrowdyGraphQLError} on transport/validation failures.
   */
  async resendConfirmationEmail(email: string): Promise<boolean> {
    const data = await this.graphql.request(ResendConfirmationEmailDocument, {
      email,
    });
    return data.resendConfirmationEmail;
  }

  /**
   * Change the authenticated user's password after verifying the current one.
   * Requires a valid session. Existing sessions are **not** revoked.
   *
   * @param currentPassword - The user's current password, for verification.
   * @param newPassword - The new password to set (min 8 characters).
   * @returns `true` on success.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a valid session, or
   *   `BAD_USER_INPUT` if the current password is wrong.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const data = await this.graphql.request(ChangePasswordDocument, {
      currentPassword,
      newPassword,
    });
    return data.changePassword;
  }

  /**
   * Imperatively replace the in-memory bearer token on the shared session state
   * (e.g. to rehydrate a token persisted to disk). Affects every sub-client.
   * Local only — performs no network call. Pass `null` to clear it.
   *
   * @param token - The bearer token to use, or `null` to clear the session.
   */
  setToken(token: string | null): void {
    this.session.setToken(token);
  }

  /**
   * Read the current in-memory bearer token from the shared session state. Local
   * only — performs no network call.
   *
   * @returns The current bearer token, or `null` if none is set.
   */
  getToken(): string | null {
    return this.session.getToken();
  }
}
