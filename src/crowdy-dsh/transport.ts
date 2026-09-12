/**
 * The game-API surface the Studio agent pane needs beyond project files:
 * the provider-data consent, the player's own model usage, and the list of
 * models the metered endpoint will serve for this app.
 *
 * Every call carries the app-scoped token the game already holds; there is no
 * second credential. The model list is REST (`GET /v1/model/models`, the
 * OpenAI shape the harness reads) and the rest is GraphQL.
 */

import type { GraphQLClient } from '../client.js';

export interface CrowdyStudioProviderConsent {
  appId: string;
  consented: boolean;
  consentedAt: string | null;
}

export interface CrowdyStudioModelUsageEntry {
  usageId: string;
  payerKind: string;
  status: string;
  requestedModel: string;
  resolvedModel: string | null;
  promptTokens: string;
  completionTokens: string;
  reasoningTokens: string;
  chargeMicrousd: string;
  occurredAt: string;
  client: string;
}

export interface CrowdyStudioModelUsage {
  appId: string;
  /** `PLAYER` (the caller's wallet), `ORG` (the app's org wallet) or `PLATFORM`. */
  payerKind: string;
  todayRequests: string;
  todayChargeMicrousd: string;
  dayLimitMicrousd: string;
  recent: CrowdyStudioModelUsageEntry[];
}

export interface CrowdyStudioModelCatalogEntry {
  id: string;
  name: string;
  contextWindow: number | null;
  inputModalities: string[];
  pricingMicrousdPerMillion: { input: number; output: number; reasoning: number; cachedInput: number };
}

const CONSENT = `
  query CrowdyStudioProviderConsent($appId: BigInt!) {
    crowdyStudioProviderConsent(appId: $appId) { appId consented consentedAt }
  }
`;

const SET_CONSENT = `
  mutation CrowdyStudioSetProviderConsent($input: SetCrowdyStudioProviderConsentInput!) {
    crowdyStudioSetProviderConsent(input: $input) { appId consented consentedAt }
  }
`;

const USAGE = `
  query CrowdyStudioModelUsage($appId: BigInt!, $limit: Int) {
    crowdyStudioModelUsage(appId: $appId, limit: $limit) {
      appId payerKind todayRequests todayChargeMicrousd dayLimitMicrousd
      recent { usageId payerKind status requestedModel resolvedModel promptTokens completionTokens reasoningTokens chargeMicrousd occurredAt client }
    }
  }
`;

export class CrowdyStudioDshTransport {
  constructor(
    private readonly graphql: GraphQLClient,
    private readonly options: {
      /** Origin of the game API, e.g. `https://ck-or.dev.crowdedkingdoms.com` or the page origin behind a proxy. */
      apiOrigin: string;
      getToken(): string | null;
    },
  ) {}

  /** Base URL the harness posts completions to (`<origin>/v1/model`). */
  get modelBaseUrl(): string {
    return `${this.options.apiOrigin.replace(/\/+$/, '')}/v1/model`;
  }

  async consent(appId: string): Promise<CrowdyStudioProviderConsent> {
    const data = await this.graphql.query<{ crowdyStudioProviderConsent: CrowdyStudioProviderConsent }>(CONSENT, {
      appId,
    });
    return data.crowdyStudioProviderConsent;
  }

  async setConsent(appId: string, consented: boolean): Promise<CrowdyStudioProviderConsent> {
    const data = await this.graphql.query<{ crowdyStudioSetProviderConsent: CrowdyStudioProviderConsent }>(
      SET_CONSENT,
      { input: { appId, consented } },
    );
    return data.crowdyStudioSetProviderConsent;
  }

  async usage(appId: string, limit = 20): Promise<CrowdyStudioModelUsage> {
    const data = await this.graphql.query<{ crowdyStudioModelUsage: CrowdyStudioModelUsage }>(USAGE, {
      appId,
      limit,
    });
    return data.crowdyStudioModelUsage;
  }

  /** Models the metered endpoint offers this caller; empty when the agent is disabled for the app. */
  async models(appId: string): Promise<CrowdyStudioModelCatalogEntry[]> {
    const token = this.options.getToken();
    if (!token) throw new Error('No app token; sign in before opening the agent');
    const response = await fetch(`${this.modelBaseUrl}/models?appId=${encodeURIComponent(appId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string; code?: string } };
        if (body.error?.message) message = `${body.error.code ?? 'ERROR'}: ${body.error.message}`;
      } catch {
        // keep the status
      }
      throw new Error(`Model catalog unavailable (${message})`);
    }
    const body = (await response.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_window?: number | null;
        input_modalities?: string[];
        pricing_microusd_per_million?: { input: number; output: number; reasoning: number; cached_input: number };
      }>;
    };
    return (body.data ?? []).map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextWindow: model.context_window ?? null,
      inputModalities: model.input_modalities ?? ['text'],
      pricingMicrousdPerMillion: {
        input: model.pricing_microusd_per_million?.input ?? 0,
        output: model.pricing_microusd_per_million?.output ?? 0,
        reasoning: model.pricing_microusd_per_million?.reasoning ?? 0,
        cachedInput: model.pricing_microusd_per_million?.cached_input ?? 0,
      },
    }));
  }
}
