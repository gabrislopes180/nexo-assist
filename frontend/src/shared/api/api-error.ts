export type ApiErrorKind = "http" | "unavailable" | "invalid-response";

interface ApiErrorDetails {
  status?: number;
  code?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(
    kind: ApiErrorKind,
    message: string,
    { status, code, cause }: ApiErrorDetails = {},
  ) {
    super(message, { cause });
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}
