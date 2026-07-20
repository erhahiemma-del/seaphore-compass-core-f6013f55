/**
 * API error primitives — proper HTTP status codes, JSON-serialisable.
 * Never leak stack traces to clients.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  unauthorized: (msg = "Missing or invalid credentials") =>
    new ApiError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "Insufficient permissions") =>
    new ApiError(403, "FORBIDDEN", msg),
  notFound: (resource: string, id: string) =>
    new ApiError(404, "NOT_FOUND", `${resource} '${id}' not found`),
  validation: (details: unknown) =>
    new ApiError(400, "VALIDATION_ERROR", "Request failed validation", details),
  rateLimited: (retryAfter: number) =>
    new ApiError(429, "RATE_LIMITED", "Too many requests", { retryAfter }),
  internal: (msg = "Internal server error") =>
    new ApiError(500, "INTERNAL_ERROR", msg),
};

export function errorResponse(err: unknown, requestId: string): Response {
  if (err instanceof ApiError) {
    return Response.json(
      {
        error: { code: err.code, message: err.message, details: err.details },
        requestId,
      },
      {
        status: err.status,
        headers:
          err.status === 429 && err.details && typeof err.details === "object"
            ? { "Retry-After": String((err.details as { retryAfter: number }).retryAfter) }
            : undefined,
      },
    );
  }
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" }, requestId },
    { status: 500 },
  );
}
