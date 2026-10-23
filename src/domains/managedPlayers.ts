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
 *     ({@link registerSigningKey}), its sign-in service signs a short JWS for the player, and
 *     the device trades it with `client.portal.exchangeManagedPlayerAssertion`.
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
   * `LEGAL_HOLD`; the player stays as it was.
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
