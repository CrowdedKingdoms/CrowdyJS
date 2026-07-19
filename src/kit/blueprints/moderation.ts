import type { SeedFunctionInput, SeedPropertyDefInput } from '../../generated/graphql.js';
import { toSnakeCase, trustedAuthorityFields, type KitBlueprint } from './core.js';

/** Options for {@link moderationBlueprint}. */
export interface ModerationBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
}

/** Names derived by {@link moderationBlueprint} for a given prefix. */
export interface ModerationNames {
  reportType: string;
  muteType: string;
  fileReportFn: string;
  resolveReportFn: string;
}

/** Compute the type/function names a moderation blueprint (and its runtime helper) uses. */
export function moderationNames(typePrefix = ''): ModerationNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    reportType: `${typePrefix}ModReport`,
    muteType: `${typePrefix}ModMute`,
    fileReportFn: `${fnPrefix}file_report`,
    resolveReportFn: `${fnPrefix}resolve_report`,
  };
}

/**
 * Blueprint for **moderation** (matrix P6) — MODEL + CLIENT, no compute:
 *
 * - `ModReport` containers are the escalation queue: any player files one
 *   against a subject (`file_report` is member-instantiable through the
 *   runtime helper — the caller's own report row); app admins read the
 *   open queue and `resolve_report` with a disposition.
 * - `ModMute` containers are per-player mute lists (client-enforced: the
 *   runtime helper filters chat client-side — mutes are personal, not
 *   punitive).
 * - ENFORCEMENT stays on existing platform surfaces: admins revoke access
 *   tiers / grid permissions; nothing new to trust here.
 *
 * Runtime counterpart: `client.kit(appId).moderation`.
 */
export function moderationBlueprint(options: ModerationBlueprintOptions = {}): KitBlueprint {
  const { typePrefix = '' } = options;
  const names = moderationNames(typePrefix);

  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: names.reportType,
      key: 'reporter_user_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Who filed the report.',
    },
    {
      containerTypeName: names.reportType,
      key: 'subject_user_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Who the report is about.',
    },
    {
      containerTypeName: names.reportType,
      key: 'reason',
      valueType: 'string',
      defaultValueJson: '""',
      description: "App-defined category ('harassment', 'cheating', 'spam', ...).",
    },
    {
      containerTypeName: names.reportType,
      key: 'detail',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Free-text context from the reporter (client-truncated).',
    },
    {
      containerTypeName: names.reportType,
      key: 'status',
      valueType: 'string',
      defaultValueJson: '"open"',
      description: "Queue state: 'open' | 'actioned' | 'dismissed'.",
    },
    {
      containerTypeName: names.reportType,
      key: 'resolution',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Admin note recorded by resolve_report.',
    },
    {
      containerTypeName: names.reportType,
      key: 'filed_at_ms',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Client-reported epoch ms (informational; the event log holds server time).',
    },
    {
      containerTypeName: names.muteType,
      key: 'owner_user_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Whose mute list this row belongs to (kit owner mirror).',
    },
    {
      containerTypeName: names.muteType,
      key: 'muted_user_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'The muted player (client-side chat filtering).',
    },
  ];

  const functions: SeedFunctionInput[] = [
    {
      name: names.resolveReportFn,
      containerTypeName: names.reportType,
      returnType: 'string',
      parameters: [
        {
          name: 'status',
          valueType: 'string',
          required: true,
          description: "'actioned' or 'dismissed'.",
        },
        {
          name: 'resolution',
          valueType: 'string',
          required: true,
          description: 'Admin disposition note.',
        },
      ],
      mutations: [
        { target: 'self', property: 'status', expression: '$status' },
        { target: 'self', property: 'resolution', expression: '$resolution' },
      ],
      returnExpression: 'self.status',
      ...trustedAuthorityFields('server'),
      description:
        'Close a report with a disposition (app admins). Enforcement happens on platform surfaces (tier revocation, grid permissions).',
    },
  ];

  return {
    name: 'moderation',
    containerTypes: [
      {
        typeName: names.reportType,
        displayName: 'Moderation report',
        description: 'One player report in the escalation queue (open/actioned/dismissed).',
      },
      {
        typeName: names.muteType,
        displayName: 'Moderation mute',
        description: 'One personal mute entry (client-enforced chat filtering).',
      },
    ],
    propertyDefinitions,
    functions,
  };
}
