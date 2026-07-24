import { CrowdyAgentError } from './errors.js';
import {
  assertBoundedJsonSchema,
  canonicalJson,
  deepFreeze,
  digestCanonicalJson,
  validateJsonSchemaValue,
} from './schema.js';
import type {
  CrowdyAgentMode,
  CrowdyAgentRegisteredToolV1,
  CrowdyAgentToolDescriptorV1,
  CrowdyAgentToolExecutor,
} from './types.js';

const WIRE_NAME = /^[A-Za-z0-9_-]{1,64}$/u;
const LOGICAL_NAME =
  /^(?:studio|project|workspace|library|template|diagnostics|runtime|game)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*$/u;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REDACTION_PATH =
  /^\$(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\*\])*$/u;

/** Names whose presence would create ambient or arbitrary authority. */
export const FORBIDDEN_AGENT_TOOL_SURFACES = Object.freeze([
  'graphql',
  'fetch',
  'http',
  'url',
  'socket',
  'shell',
  'process',
  'filesystem',
  'dom',
  'keyboard',
  'mouse',
  'pointer',
  'host_call',
  'playercodebroker',
  'udp',
  'token',
  'cookie',
  'storage',
  'devtools',
  'database',
  'buddy',
] as const);

export interface CrowdyAgentRegistryFilter {
  readonly mode?: CrowdyAgentMode;
  readonly executor?: CrowdyAgentToolExecutor;
  /** Effective scopes filter descriptors; it never grants a scope. */
  readonly availableScopes?: ReadonlySet<string>;
}

/** Immutable, exact-lookup registry pinned by a canonical digest. */
export class CrowdyAgentToolRegistry {
  readonly contractVersion = 'crowdy.agent-tools/1' as const;
  readonly registryDigest: `sha256:${string}`;
  private readonly entries: readonly CrowdyAgentRegisteredToolV1[];
  private readonly byLogical = new Map<string, CrowdyAgentRegisteredToolV1>();
  private readonly byWire = new Map<string, CrowdyAgentRegisteredToolV1>();

  constructor(descriptors: readonly CrowdyAgentToolDescriptorV1[]) {
    if (descriptors.length === 0 || descriptors.length > 256) {
      throw descriptorError('Registry must contain 1 to 256 tools');
    }
    const entries = descriptors
      .map((descriptor) => registerDescriptor(descriptor))
      .sort((left, right) =>
        descriptorKey(left.descriptor).localeCompare(descriptorKey(right.descriptor)),
      );
    for (const entry of entries) {
      const key = descriptorKey(entry.descriptor);
      if (this.byLogical.has(key)) {
        throw descriptorError(`Duplicate tool descriptor ${key}`);
      }
      if (this.byWire.has(entry.descriptor.wireName)) {
        throw descriptorError(`Duplicate tool wire name ${entry.descriptor.wireName}`);
      }
      this.byLogical.set(key, entry);
      this.byWire.set(entry.descriptor.wireName, entry);
    }
    this.entries = deepFreeze(entries);
    this.registryDigest = digestCanonicalJson({
      contract: this.contractVersion,
      descriptors: entries.map(({ descriptor, descriptorDigest }) => ({
        descriptor,
        descriptorDigest,
      })),
    });
  }

  list(filter: CrowdyAgentRegistryFilter = {}): readonly CrowdyAgentRegisteredToolV1[] {
    return this.entries.filter(({ descriptor }) => {
      if (filter.mode && !descriptor.modes.includes(filter.mode)) return false;
      if (filter.executor && descriptor.executor !== filter.executor) return false;
      if (filter.availableScopes) {
        return descriptor.scopes
          .filter((requirement) => !requirement.when)
          .every((requirement) =>
            filter.availableScopes?.has(requirement.scope),
        );
      }
      return true;
    });
  }

  get(name: string, version: string): CrowdyAgentRegisteredToolV1 | undefined {
    return this.byLogical.get(`${name}@${version}`);
  }

  require(name: string, version: string): CrowdyAgentRegisteredToolV1 {
    const entry = this.get(name, version);
    if (!entry) {
      const knownName = this.entries.some(({ descriptor }) => descriptor.name === name);
      throw new CrowdyAgentError(
        knownName ? 'AGENT_TOOL_VERSION_UNSUPPORTED' : 'AGENT_TOOL_UNKNOWN',
        knownName
          ? `Unsupported ${name} tool version ${version}`
          : `Unknown agent tool ${name}`,
      );
    }
    return entry;
  }

  /** Exact, case-sensitive provider wire-name reverse lookup. */
  fromWireName(wireName: string): CrowdyAgentRegisteredToolV1 {
    const entry = this.byWire.get(wireName);
    if (!entry) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_UNKNOWN',
        `Unknown agent tool wire name ${wireName}`,
      );
    }
    return entry;
  }

  validateInput(name: string, version: string, value: unknown): void {
    validateJsonSchemaValue(this.require(name, version).descriptor.inputSchema, value, {
      direction: 'INPUT',
    });
  }

  validateOutput(name: string, version: string, value: unknown): void {
    validateJsonSchemaValue(this.require(name, version).descriptor.outputSchema, value, {
      direction: 'OUTPUT',
    });
  }

  /** Resolve conditional requirements from already validated arguments. */
  requiredScopes(
    name: string,
    version: string,
    argumentsValue: unknown,
  ): readonly string[] {
    const entry = this.require(name, version);
    this.validateInput(name, version, argumentsValue);
    return entry.descriptor.scopes
      .filter((requirement) => {
        if (!requirement.when) return true;
        const values = resolveArgumentPath(
          argumentsValue,
          requirement.when.argumentPath,
        );
        return requirement.when.operator === 'EQUALS'
          ? values.some((value) => Object.is(value, requirement.when?.value))
          : values.some(
              (value) =>
                Array.isArray(value) &&
                value.some((entry) =>
                  Object.is(entry, requirement.when?.value),
                ),
            ) ||
              values.some((value) =>
                Object.is(value, requirement.when?.value),
              );
      })
      .map((requirement) => requirement.scope);
  }
}

function registerDescriptor(
  source: CrowdyAgentToolDescriptorV1,
): CrowdyAgentRegisteredToolV1 {
  validateDescriptor(source);
  const descriptor = deepFreeze(
    JSON.parse(canonicalJson(source)) as CrowdyAgentToolDescriptorV1,
  ) as CrowdyAgentToolDescriptorV1;
  const descriptorDigest = digestCanonicalJson(descriptor);
  return deepFreeze({ descriptor, descriptorDigest });
}

function validateDescriptor(descriptor: CrowdyAgentToolDescriptorV1): void {
  if (descriptor.schemaVersion !== 'crowdy.agent-tool/1') {
    throw descriptorError('Unsupported descriptor schemaVersion');
  }
  if (!LOGICAL_NAME.test(descriptor.name)) {
    throw descriptorError(`Invalid logical tool name ${descriptor.name}`);
  }
  if (!WIRE_NAME.test(descriptor.wireName)) {
    throw descriptorError(`Invalid tool wire name ${descriptor.wireName}`);
  }
  if (!SEMVER.test(descriptor.version)) {
    throw descriptorError(`Invalid tool semantic version ${descriptor.version}`);
  }
  const major = descriptor.version.split('.')[0];
  if (!descriptor.wireName.endsWith(`_v${major}`)) {
    throw descriptorError(
      `Tool wire name ${descriptor.wireName} must include major suffix _v${major}`,
    );
  }
  const authoritySurface = `${descriptor.name}.${descriptor.wireName}`.toLowerCase();
  const forbidden = FORBIDDEN_AGENT_TOOL_SURFACES.find((part) =>
    authoritySurface.includes(part),
  );
  if (forbidden) {
    throw descriptorError(
      `Tool ${descriptor.name} exposes forbidden surface ${forbidden}`,
    );
  }
  if (descriptor.summary.length < 8 || descriptor.summary.length > 240) {
    throw descriptorError(`${descriptor.name} summary must be 8 to 240 characters`);
  }
  if (
    descriptor.modes.length === 0 ||
    new Set(descriptor.modes).size !== descriptor.modes.length
  ) {
    throw descriptorError(`${descriptor.name} modes must be non-empty and unique`);
  }
  assertBoundedJsonSchema(descriptor.inputSchema, {
    rejectAuthorityFields: true,
  });
  assertBoundedJsonSchema(descriptor.outputSchema, {
    rejectAuthorityFields: false,
  });
  if (
    !Number.isSafeInteger(descriptor.timeoutMs) ||
    descriptor.timeoutMs < 50 ||
    descriptor.timeoutMs > 120_000
  ) {
    throw descriptorError(`${descriptor.name} timeout must be 50..120000ms`);
  }
  if (
    !Number.isSafeInteger(descriptor.approval.maxTtlSeconds) ||
    descriptor.approval.maxTtlSeconds < 0 ||
    descriptor.approval.maxTtlSeconds > 300
  ) {
    throw descriptorError(`${descriptor.name} approval TTL must be 0..300 seconds`);
  }
  const approvalRequired = ['DESTRUCTIVE', 'TRUST_CONSENT', 'ECONOMIC', 'IRREVERSIBLE'].includes(
    descriptor.risk.class,
  );
  if (approvalRequired && descriptor.approval.policy !== 'REQUIRED') {
    throw descriptorError(`${descriptor.name} risk requires exact human approval`);
  }
  if (
    descriptor.approval.policy === 'NONE' &&
    (descriptor.approval.reasons.length !== 0 ||
      descriptor.approval.maxTtlSeconds !== 0)
  ) {
    throw descriptorError(`${descriptor.name} no-approval metadata is inconsistent`);
  }
  if (
    descriptor.approval.policy !== 'NONE' &&
    (descriptor.approval.reasons.length === 0 ||
      descriptor.approval.maxTtlSeconds === 0)
  ) {
    throw descriptorError(`${descriptor.name} approval reasons and TTL are required`);
  }
  if (
    descriptor.executor === 'BROWSER' &&
    !['PURE', 'TOOL_CALL_ONCE', 'NON_RETRYABLE'].includes(
      descriptor.idempotency.class,
    )
  ) {
    throw descriptorError(`${descriptor.name} browser idempotency class is unsafe`);
  }
  validateKeyScope(descriptor);
  validateRedaction(descriptor);
  if (descriptor.scopes.length > 16) {
    throw descriptorError(`${descriptor.name} has too many scope requirements`);
  }
  for (const requirement of descriptor.scopes) {
    if (!/^[a-z][a-z0-9_.]{1,79}$/u.test(requirement.scope)) {
      throw descriptorError(`${descriptor.name} has invalid scope ${requirement.scope}`);
    }
    if (
      requirement.when &&
      (!REDACTION_PATH.test(requirement.when.argumentPath) ||
        requirement.when.argumentPath.includes('[*]') === false &&
          requirement.when.operator === 'CONTAINS')
    ) {
      throw descriptorError(`${descriptor.name} has invalid conditional scope`);
    }
  }
}

function validateKeyScope(descriptor: CrowdyAgentToolDescriptorV1): void {
  const expected =
    descriptor.idempotency.class === 'PURE'
      ? 'NONE'
      : descriptor.idempotency.class === 'KEYED'
        ? 'USER_TOOL_ARGUMENTS'
        : 'TOOL_CALL';
  if (descriptor.idempotency.keyScope !== expected) {
    throw descriptorError(
      `${descriptor.name} idempotency key scope must be ${expected}`,
    );
  }
}

function validateRedaction(descriptor: CrowdyAgentToolDescriptorV1): void {
  if (
    !Number.isSafeInteger(descriptor.redaction.maxPersistedBytes) ||
    descriptor.redaction.maxPersistedBytes < 0 ||
    descriptor.redaction.maxPersistedBytes > 65_536
  ) {
    throw descriptorError(`${descriptor.name} persisted byte bound is invalid`);
  }
  for (const rule of [
    ...descriptor.redaction.input,
    ...descriptor.redaction.output,
  ]) {
    if (!REDACTION_PATH.test(rule.path)) {
      throw descriptorError(`${descriptor.name} has invalid redaction path ${rule.path}`);
    }
    if (
      rule.action === 'TRUNCATE' &&
      (!Number.isSafeInteger(rule.maxBytes) ||
        (rule.maxBytes ?? 0) < 1 ||
        (rule.maxBytes ?? 0) > descriptor.redaction.maxPersistedBytes)
    ) {
      throw descriptorError(`${descriptor.name} truncate rule needs bounded maxBytes`);
    }
    if (rule.action !== 'TRUNCATE' && rule.maxBytes !== undefined) {
      throw descriptorError(`${descriptor.name} maxBytes is only valid for TRUNCATE`);
    }
  }
}

function descriptorKey(descriptor: CrowdyAgentToolDescriptorV1): string {
  return `${descriptor.name}@${descriptor.version}`;
}

function descriptorError(message: string): CrowdyAgentError {
  return new CrowdyAgentError('AGENT_TOOL_DESCRIPTOR_INVALID', message);
}

function resolveArgumentPath(value: unknown, path: string): readonly unknown[] {
  const segments = path
    .slice(2)
    .split('.')
    .filter(Boolean);
  let values: readonly unknown[] = [value];
  for (const segment of segments) {
    const wildcard = segment.endsWith('[*]');
    const key = wildcard ? segment.slice(0, -3) : segment;
    const next: unknown[] = [];
    for (const candidate of values) {
      if (
        candidate === null ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      ) {
        continue;
      }
      const child = (candidate as Record<string, unknown>)[key];
      if (wildcard && Array.isArray(child)) next.push(...child);
      else if (!wildcard) next.push(child);
    }
    values = next;
  }
  return values;
}

export function isDescriptorDigest(value: string): value is `sha256:${string}` {
  return DIGEST.test(value);
}
