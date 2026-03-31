export interface SapErrorContext {
  endpoint?: string;
  errorCode?: string | null;
  httpStatus?: number | null;
  retryable: boolean;
  responseBody?: unknown;
}

export class SapIntegrationError extends Error {
  readonly endpoint?: string;
  readonly errorCode?: string | null;
  readonly httpStatus?: number | null;
  readonly retryable: boolean;
  readonly responseBody?: unknown;

  constructor(message: string, context: SapErrorContext) {
    super(message);
    this.name = "SapIntegrationError";
    this.endpoint = context.endpoint;
    this.errorCode = context.errorCode;
    this.httpStatus = context.httpStatus;
    this.retryable = context.retryable;
    this.responseBody = context.responseBody;
  }
}

