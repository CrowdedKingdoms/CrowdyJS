import type { GraphQLClient } from '../client.js';
import type { SubscriptionManager } from '../subscriptions.js';

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
 * Authentication-related operations.
 *
 * Exposed on the client as `client.auth.<method>`. The legacy
 * `client.login()` / `client.register()` shortcuts continue to work and
 * delegate here.
 */
export class AuthAPI {
  constructor(private gql: GraphQLClient, private subs: SubscriptionManager) {}

  async login(input: LoginMutationVariables['input']): Promise<LoginMutation['login']> {
    const data = await this.gql.request(LoginDocument, { input });
    if (data.login?.token) {
      this.gql.setAuthToken(data.login.token);
      this.subs.setAuthToken(data.login.token);
    }
    return data.login;
  }

  async register(
    input: RegisterMutationVariables['input']
  ): Promise<RegisterMutation['register']> {
    const data = await this.gql.request(RegisterDocument, { input });
    if (data.register?.token) {
      this.gql.setAuthToken(data.register.token);
      this.subs.setAuthToken(data.register.token);
    }
    return data.register;
  }

  async logout(): Promise<LogoutMutation['logout']> {
    const data = await this.gql.request(LogoutDocument, undefined);
    this.gql.setAuthToken(null);
    return data.logout;
  }

  async logoutAllDevices(): Promise<LogoutAllDevicesMutation['logoutAllDevices']> {
    const data = await this.gql.request(LogoutAllDevicesDocument, undefined);
    this.gql.setAuthToken(null);
    return data.logoutAllDevices;
  }

  async confirmEmail(token: ConfirmEmailMutationVariables['token']): Promise<boolean> {
    const data = await this.gql.request(ConfirmEmailDocument, { token });
    return data.confirmEmail;
  }

  async requestPasswordReset(
    email: RequestPasswordResetMutationVariables['email']
  ): Promise<boolean> {
    const data = await this.gql.request(RequestPasswordResetDocument, { email });
    return data.requestPasswordReset;
  }

  async resetPassword(input: ResetPasswordMutationVariables['input']): Promise<boolean> {
    const data = await this.gql.request(ResetPasswordDocument, { input });
    return data.resetPassword;
  }

  async resendConfirmationEmail(
    email: ResendConfirmationEmailMutationVariables['email']
  ): Promise<boolean> {
    const data = await this.gql.request(ResendConfirmationEmailDocument, { email });
    return data.resendConfirmationEmail;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    const vars: ChangePasswordMutationVariables = { currentPassword, newPassword };
    const data = await this.gql.request(ChangePasswordDocument, vars);
    return data.changePassword;
  }
}
