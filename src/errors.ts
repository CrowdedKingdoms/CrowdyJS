export interface CrowdyGraphQLErrorPayload {
  message: string;
  locations?: readonly unknown[];
  path?: readonly (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface CrowdyErrorOptions {
  message: string;
  cause?: unknown;
}

export class CrowdyError extends Error {
  readonly cause?: unknown;

  constructor(options: CrowdyErrorOptions) {
    super(options.message);
    this.name = new.target.name;
    this.cause = options.cause;
  }
}

export class CrowdyHttpError extends CrowdyError {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super({ message: `HTTP ${status}: ${body}` });
    this.status = status;
    this.body = body;
  }
}

export class CrowdyGraphQLError extends CrowdyError {
  readonly graphqlErrors: CrowdyGraphQLErrorPayload[];

  constructor(errors: CrowdyGraphQLErrorPayload[]) {
    super({ message: errors.map((error) => error.message).join('; ') });
    this.graphqlErrors = errors;
  }

  get code(): unknown {
    return this.graphqlErrors[0]?.extensions?.code;
  }
}

export class CrowdyNetworkError extends CrowdyError {
  constructor(cause: unknown) {
    super({ message: `Network error: ${String(cause)}`, cause });
  }
}

export class CrowdyTimeoutError extends CrowdyError {
  constructor(timeoutMs: number) {
    super({ message: `Request timed out after ${timeoutMs}ms` });
  }
}

export class CrowdyRealtimeError extends CrowdyError {
  readonly code?: string;
  readonly retryable?: boolean;

  constructor(message: string, options: { code?: string; retryable?: boolean; cause?: unknown } = {}) {
    super({ message, cause: options.cause });
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

export class CrowdyProtocolError extends CrowdyError {}
