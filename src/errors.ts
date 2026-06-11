/**
 * Candescent SDK error hierarchy.
 *
 * Modeled after Stainless — each HTTP status gets its own class.
 * Every ApiError exposes: statusCode, message, headers, body, rawResponse.
 */

export class CandescentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandescentError";
  }
}

export class ApiError extends CandescentError {
  readonly statusCode: number;
  readonly headers: Headers;
  readonly body: string;
  readonly rawResponse: Response;

  constructor(
    statusCode: number,
    message: string,
    headers: Headers,
    body: string,
    rawResponse: Response,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
    this.rawResponse = rawResponse;
  }

  override toString(): string {
    let s = `${this.name} (HTTP ${this.statusCode})`;
    if (this.body) {
      try {
        const parsed = JSON.parse(this.body);
        s += `: ${JSON.stringify(parsed, null, 2)}`;
      } catch {
        s += `: ${this.body}`;
      }
    }
    return s;
  }
}

export class BadRequestError extends ApiError {
  constructor(h: Headers, b: string, r: Response) {
    super(400, b, h, b, r);
    this.name = "BadRequestError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(h: Headers, b: string, r: Response) {
    super(401, b, h, b, r);
    this.name = "AuthenticationError";
  }
}

export class PermissionDeniedError extends ApiError {
  constructor(h: Headers, b: string, r: Response) {
    super(403, b, h, b, r);
    this.name = "PermissionDeniedError";
  }
}

export class NotFoundError extends ApiError {
  constructor(h: Headers, b: string, r: Response) {
    super(404, b, h, b, r);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(h: Headers, b: string, r: Response) {
    super(409, b, h, b, r);
    this.name = "ConflictError";
  }
}

export class UnprocessableEntityError extends ApiError {
  constructor(h: Headers, b: string, r: Response) {
    super(422, b, h, b, r);
    this.name = "UnprocessableEntityError";
  }
}

export class RateLimitError extends ApiError {
  readonly retryAfter: number | null;

  constructor(h: Headers, b: string, r: Response) {
    super(429, b, h, b, r);
    this.name = "RateLimitError";
    const ra = h.get("Retry-After");
    this.retryAfter = ra ? parseFloat(ra) || null : null;
  }
}

export class InternalServerError extends ApiError {
  constructor(status: number, h: Headers, b: string, r: Response) {
    super(status, b, h, b, r);
    this.name = "InternalServerError";
  }
}

export class ConnectionError extends CandescentError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class RequestTimeoutError extends CandescentError {
  constructor(message: string) {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

const STATUS_MAP: Record<number, new (h: Headers, b: string, r: Response) => ApiError> = {
  400: BadRequestError,
  401: AuthenticationError,
  403: PermissionDeniedError,
  404: NotFoundError,
  409: ConflictError,
  422: UnprocessableEntityError,
  429: RateLimitError,
};

export function errorForStatus(
  statusCode: number,
  headers: Headers,
  body: string,
  rawResponse: Response,
): ApiError {
  const Cls = STATUS_MAP[statusCode];
  if (Cls) return new Cls(headers, body, rawResponse);
  if (statusCode >= 500) return new InternalServerError(statusCode, headers, body, rawResponse);
  return new ApiError(statusCode, body, headers, body, rawResponse);
}
