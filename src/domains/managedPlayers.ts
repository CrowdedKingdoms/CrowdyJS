import type { GraphQLClient } from '../client.js';
import {
  ManagedPlayersDocument,
  ManagedPlayerDocument,
  ProvisionManagedPlayersDocument,
  UpdateManagedPlayerDocument,
  EndManagedPlayerSessionsDocument,
  DeleteManagedPlayerDocument,
  OrgManagedPlayerSettingsDocument,
  OrgSigningKeysDocument,
  RegisterOrgSigningKeyDocument,
  RevokeOrgSigningKeyDocument,
  AppManagedPlayerModsDocument,
  SetAppManagedPlayerModsDocument,
  type ManagedPlayersQuery,
  type ManagedPlayerQuery,
  type ProvisionManagedPlayersMutation,
  type UpdateManagedPlayerMutation,
  type OrgManagedPlayerSettingsQuery,
  type OrgSigningKeysQuery,
  type RegisterOrgSigningKeyMutation,
  type ProvisionManagedPlayersInput,
  type UpdateManagedPlayerInput,
  type RegisterOrgSigningKeyInput,
} from '../generated/graphql.js';

/** The JWK members that only a private key has (RFC 7518: EC and OKP `d`, RSA's CRT values, `oct`'s `k`). */
const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'] as const;

function privateJwkMember(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null; // not JSON: the API refuses it with its own message
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return PRIVATE_JWK_MEMBERS.find((m) => m in (parsed as Record<string, unknown>)) ?? null;
}

/** A public key as {@link ManagedPlayersAPI.registerSigningKey} takes it: a JWK object or its JSON. */
export type OrgSigningKeyRegistration = Omit<RegisterOrgSigningKeyInput, 'publicJwk'> & {
  publicJwk: string | Record<string, unknown>;
};

/**
 * The claims of a player assertion, as the organization's sign-in service signs them (a
 * compact JWS whose header names `alg`, `EdDSA`, `ES256` or `RS256`, and the registered key's
 * `kid`). The device trades the assertion with `portal.exchangeManagedPlayerAssertion`. This
 * SDK does not sign assertions: the private key stays with the sign-in service.
 */
export interface ManagedPlayerAssertionClaims {
  /** The issuer registered with the key. */
  iss: string;
  /** The key's audience, or `ck:app:<appId>` when it has none. */
  aud: string | string[];
  /** The organization's own id for the player: 1-256 characters, no control characters. */
  sub: string;
  /** Issued at, in seconds since the epoch. */
  iat: number;
  /** Expiry, in seconds since the epoch: at most 300 seconds after `iat`. */
  exp: number;
  /** Not before, in seconds since the epoch. */
  nbf?: number;
  /** A fresh id (1-128 characters), accepted once per app. */
  jti: string;
  /** Display name, at most 64 characters. */
  gamertag?: string;
  /**
   * The player's age in whole years, as the organization knows it (ck-api v2.60.0). Stored as
   * an age bracket that sets a minor's defaults; a player under the app's, the country's or
   * the platform's youngest age is refused `AGE_REQUIREMENT_NOT_MET`. Optional while every
   * managed player is 18 or older under the Org-Managed Players Addendum (left out, the
   * player counts as an adult); required once the platform admits players under 18
   * (`AGE_REQUIRED` without it).
   */
  ageYears?: number;
  /**
   * The country the player lives in, ISO 3166-1 alpha-2 (ck-api v2.60.0). A country Crowded
   * Kingdoms does not serve is refused `TERRITORY_NOT_SUPPORTED`, and the country's own
   * youngest age applies. Optional until the platform admits players under 18, required
   * after.
   */
  country?: string;
}

/**
 * Org-managed players: an organization's own players, signed in by the organization
 * instead of with a Crowded Kingdoms email and password. Exposed as
 * `client.managedPlayers` (and `client.admin.managedPlayers`).
 *
 * An org-managed player has no email, password, session or wallet. Its organization
 * vouches for it in one of two ways, and either one ends in the player's own app token:
 *
 *   - **From its server, with an org token** (`cko_…`, scope `players:mint`): the server calls
 *     the `mintManagedPlayerToken` mutation itself and hands the response to the player's
 *     device, which stores it with `client.portal.adoptAppToken`. This SDK has no wrapper for
 *     that mutation on purpose: an org token signs in any of the organization's players, so
 *     it never belongs in a browser or a game client, and the API refuses one sent with an
 *     `Origin` header.
 *   - **With a signed assertion**: the organization registers a public key here
 *     ({@link registerSigningKey}), its sign-in service signs a short JWS for the player
 *     ({@link ManagedPlayerAssertionClaims}), and the device trades it with
 *     `client.portal.exchangeManagedPlayerAssertion`.
 *
 * **Age and country (ck-api v2.60.0).** Either way the organization says how old the player
 * is and where it lives: `ageYears` and `country` on the mint's input
 * (`MintManagedPlayerTokenInput`) or as the assertion's claims. Crowded Kingdoms stores an age
 * bracket and the country on the player, applies a minor's defaults itself, and refuses the
 * sign-in with `TERRITORY_NOT_SUPPORTED` in a country it does not serve and
 * `AGE_REQUIREMENT_NOT_MET` under the app's, the country's or the platform's youngest age,
 * before the player is created. Both are optional while every managed player is 18 or older
 * under the Org-Managed Players Addendum (left out, the player counts as an adult), and
 * required once the platform admits players under 18 (`AGE_REQUIRED` without an age).
 *
 * The methods below are the organization's administration. They take an org admin's
 * session with the `manage_players` permission (or, from the organization's server, an org
 * token with `players:manage` for the player operations). An operator turns the feature on
 * for an organization and sets its limits; {@link settings} reads them.
 *
 * **The Org-Managed Players Addendum** (ck-api v2.53.0). Before any of the organization's
 * players is created or signed in, an admin of the organization accepts the addendum in
 * Studio, on the organization's Players tab. Until then sign-ins (both ways), refreshes and
 * {@link provision} answer `ORG_LEGAL_ACCEPTANCE_REQUIRED` (`orgLegalAcceptanceRequiredOf`).
 * {@link settings} reports `termsVersion`, `termsUrl`, `termsAccepted` and whether the
 * signed-in user may accept (`viewerMayAcceptTerms`). This SDK has no wrapper for the
 * acceptance on purpose: it binds the organization, so a person makes it, in Studio.
 *
 * A tier that does not serve org-managed players answers `FEATURE_DISABLED` to every field.
 */
export class ManagedPlayersAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * The organization's players in the order they were created, a page at a time (`first`
   * defaults to 50, at most 200). `search` matches the start of an external id (exactly) or
   * of a gamertag (any case). Pass `nextCursor` back as `after` for the next page; it is
   * null on the last.
   */
  async list(
    orgId: string,
    options: { search?: string; first?: number; after?: string } = {},
  ): Promise<ManagedPlayersQuery['managedPlayers']> {
    const data = await this.api.request(ManagedPlayersDocument, { orgId, ...options });
    return data.managedPlayers;
  }

  /** One player by the id the organization knows it by, or null. */
  async get(
    orgId: string,
    externalId: string,
  ): Promise<ManagedPlayerQuery['managedPlayer']> {
    const data = await this.api.request(ManagedPlayerDocument, { orgId, externalId });
    return data.managedPlayer;
  }

  /**
   * Create players ahead of their first sign-in, up to 500 per call (one statement, much
   * faster than first sign-ins one at a time: pre-provision before a launch). A player
   * that already exists is left as it is and counted in `existing`. Refused with
   * `ORG_LEGAL_ACCEPTANCE_REQUIRED` until the organization has accepted the current
   * Org-Managed Players Addendum.
   */
  async provision(
    input: ProvisionManagedPlayersInput,
  ): Promise<ProvisionManagedPlayersMutation['provisionManagedPlayers']> {
    const data = await this.api.request(ProvisionManagedPlayersDocument, { input });
    return data.provisionManagedPlayers;
  }

  /**
   * Rename a player, or disable or enable it. Disabling ends every session the player has
   * (its devices stop at once) and refuses its sign-ins until enabled again. A block a
   * platform operator set also reads as disabled, and only an operator lifts it.
   */
  async update(
    input: UpdateManagedPlayerInput,
  ): Promise<UpdateManagedPlayerMutation['updateManagedPlayer']> {
    const data = await this.api.request(UpdateManagedPlayerDocument, { input });
    return data.updateManagedPlayer;
  }

  /** End every session of a player now (sign it out everywhere); it can sign in again. */
  async endSessions(orgId: string, externalId: string): Promise<boolean> {
    const data = await this.api.request(EndManagedPlayerSessionsDocument, { orgId, externalId });
    return data.endManagedPlayerSessions;
  }

  /**
   * Delete a player: its sessions end and its account is scrubbed. The external id is free
   * again, so a later sign-in with it creates a new player. Since Game API v2.54.0 its
   * player-side content is erased within minutes (usage and billing records and world edits
   * stay), and a legal hold on the player or its organization refuses the delete with
   * `LEGAL_HOLD`; the player stays as it was. Since v2.60.0 an open or escalated safety
   * report about the player sets such a hold first: disable the player instead
   * ({@link update}), which keeps everything.
   */
  async delete(orgId: string, externalId: string): Promise<boolean> {
    const data = await this.api.request(DeleteManagedPlayerDocument, { orgId, externalId });
    return data.deleteManagedPlayer;
  }

  /**
   * Whether an operator has turned managed players on for the organization, and its limits:
   * the player cap, sign-ins per minute and the session lengths. Also where the organization
   * stands on the Org-Managed Players Addendum: the current `termsVersion` and `termsUrl`,
   * `termsAccepted`, the latest acceptance, and `viewerMayAcceptTerms` (whether the signed-in
   * user is an admin of the organization who may accept it, in Studio). Read-only here.
   */
  async settings(
    orgId: string,
  ): Promise<OrgManagedPlayerSettingsQuery['orgManagedPlayerSettings']> {
    const data = await this.api.request(OrgManagedPlayerSettingsDocument, { orgId });
    return data.orgManagedPlayerSettings;
  }

  /** The organization's assertion signing keys, revoked ones included. */
  async signingKeys(orgId: string): Promise<OrgSigningKeysQuery['orgSigningKeys']> {
    const data = await this.api.request(OrgSigningKeysDocument, { orgId });
    return data.orgSigningKeys;
  }

  /**
   * Register a PUBLIC key the organization's sign-in service signs player assertions with:
   * `EdDSA` (Ed25519), `ES256` (P-256) or `RS256` (RSA, 2048 bits or more). `publicJwk` may be
   * the JWK object (for example `publicKey.export({ format: 'jwk' })` in Node) or its JSON.
   * A JWK with private members is refused. `appIds` limits the key to some of the
   * organization's apps; `audience` replaces the default `ck:app:<appId>` when the
   * organization's identity provider sets its own.
   */
  async registerSigningKey(
    input: OrgSigningKeyRegistration,
  ): Promise<RegisterOrgSigningKeyMutation['registerOrgSigningKey']> {
    const publicJwk =
      typeof input.publicJwk === 'string' ? input.publicJwk : JSON.stringify(input.publicJwk);
    // The API refuses a private JWK too; refusing here keeps the private key from ever
    // leaving the machine that holds it.
    const privateMember = privateJwkMember(publicJwk);
    if (privateMember) {
      throw new TypeError(
        `registerSigningKey: the JWK carries the private member '${privateMember}'. Register the PUBLIC key only.`,
      );
    }
    const data = await this.api.request(RegisterOrgSigningKeyDocument, {
      input: { ...input, publicJwk },
    });
    return data.registerOrgSigningKey;
  }

  /** Revoke a signing key: assertions it signed are refused from now on. */
  async revokeSigningKey(orgId: string, keyId: string): Promise<boolean> {
    const data = await this.api.request(RevokeOrgSigningKeyDocument, { orgId, keyId });
    return data.revokeOrgSigningKey;
  }

  /**
   * Whether the organization pays for its managed players' mods in this app. A managed
   * player has no wallet, so with this off its mods, its Crowdy Studio writes and its use
   * of the Studio agent are refused with `MANAGED_PLAYER_NOT_ALLOWED`. False for an app the
   * caller cannot see.
   */
  async appModsEnabled(appId: string): Promise<boolean> {
    const data = await this.api.request(AppManagedPlayerModsDocument, { appId });
    return data.app?.managedPlayerModsEnabled ?? false;
  }

  /**
   * Switch the organization paying for its managed players' mods in this app on or off
   * (`manage_billing` on the app). On, their mods' compute, storage and agent use are billed
   * to the organization; off, those mods are switched off at once.
   */
  async setAppMods(appId: string, enabled: boolean): Promise<boolean> {
    const data = await this.api.request(SetAppManagedPlayerModsDocument, { appId, enabled });
    return data.setAppManagedPlayerMods;
  }
}
