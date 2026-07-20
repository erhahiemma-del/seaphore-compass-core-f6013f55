/**
 * Typed errors for OSINT connectors.
 *
 * Every connector's fetch() should throw one of these instead of a bare
 * Error so the scheduler can route each failure correctly (rate-limit
 * cool-down vs. dead-letter vs. auth alert).
 */

export class NetworkError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

export class RateLimitError extends Error {
  constructor(message: string, public retryAfterSeconds?: number) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "ParseError";
  }
}
