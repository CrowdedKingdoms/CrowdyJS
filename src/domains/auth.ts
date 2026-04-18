import type { GraphQLClient } from '../client.js';
import type { AuthState } from '../auth-state.js';

import {
  LoginDocument,
  type LoginMutation,
  type LoginMutationVariables,
  RegisterDocument,
  type RegisterMutation,
  type RegisterMutationVariables,
  LogoutDocument,
  type LogoutMutation,
  LogoutAllDevicesDocument,
  type LogoutAllDevicesMutation,
  ConfirmEmailDocument,
  type ConfirmEmailMutationVariables,
  RequestPasswordResetDocument,
  type RequestPasswordResetMutationVariables,
  ResetPasswordDocument,
  type ResetPasswordMutationVariables,
  ResendConfirmationEmailDocument,
  type ResendConfirmationEmailMutationVariables,
  ChangePasswordDocument,
  type ChangePasswordMutationVariables,
} from '../generated/graphql.js';

/**
 * Authentication operations. Exposed as `client.auth.<method>`.
 *
 * `login` / `register` write the returned token into the shared `AuthState`
 * so the WebSocket subscription manager picks it up automatically. `logout`
 * / `logoutAllDevices` clear it.
 */
export class AuthAPI {
  constructor(
    private gql: GraphQLClient,
    private authState: AuthState,
  ) {}

  async login(input: LoginMutationVariables['input']): Promise<LoginMutation['login']> {
    const data = await this.gql.request(LoginDocument, { input });
    if (data.login?.token) {
      this.authState.setToken(data.login.token);
    }
    return data.login;
  }

  async register(
    input: RegisterMutationVariables['input'],
  ): Promise<RegisterMutation['register']> {
    const data = await this.gql.request(RegisterDocument, { input });
    if (data.register?.token) {
      this.authState.setToken(data.register.token);
    }
    return data.register;
  }

  async logout(): Promise<LogoutMutation['logout']> {
    const data = await this.gql.request(LogoutDocument, undefined);
    this.authState.setToken(null);
    return data.logout;
  }

  async logoutAllDevices(): Promise<LogoutAllDevicesMutation['logoutAllDevices']> {
    const data = await this.gql.request(LogoutAllDevicesDocument, undefined);
    this.authState.setToken(null);
    return data.logoutAllDevices;
  }

  /**
   * Manual token override - lets callers seed an existing session token
   * (e.g. on app reload) or stamp out the in-memory token without firing
   * a logout mutation. Pass `null` to clear.
   */
  setToken(token: string | null): void {
    this.authState.setToken(token);
  }

  getToken(): string | null {
    return this.authState.getToken();
  }

  async confirmEmail(token: ConfirmEmailMutationVariables['token']): Promise<boolean> {
    const data = await this.gql.request(ConfirmEmailDocument, { token });
    return data.confirmEmail;
  }

  async requestPasswordReset(
    email: RequestPasswordResetMutationVariables['email'],
  ): Promise<boolean> {
    const data = await this.gql.request(RequestPasswordResetDocument, { email });
    return data.requestPasswordReset;
  }

  async resetPassword(
    input: ResetPasswordMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(ResetPasswordDocument, { input });
    return data.resetPassword;
  }

  async resendConfirmationEmail(
    email: ResendConfirmationEmailMutationVariables['email'],
  ): Promise<boolean> {
    const data = await this.gql.request(ResendConfirmationEmailDocument, { email });
    return data.resendConfirmationEmail;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const vars: ChangePasswordMutationVariables = { currentPassword, newPassword };
    const data = await this.gql.request(ChangePasswordDocument, vars);
    return data.changePassword;
  }
}
