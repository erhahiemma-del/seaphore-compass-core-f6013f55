/**
 * Retry policy for OSINT connector operations.
 *
 * Backoff ladder: 1min, 5min, 15min, 1hr, 4hr. Max 5 attempts before
 * the payload lands in the dead-letter queue. A 429 rate-limit response
 * is NOT retried through this policy — the caller should surface it and
 * back off until the connector's rate window resets.
 */

export const BACKOFF_MINUTES = [1, 5, 15, 60, 240] as const;
export const MAX_ATTEMPTS = 5;

export class RateLimitedError extends Error {
  constructor(
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "RateLimitedError";
  }
}

export function nextBackoffMs(attempt: number): number | null {
  if (attempt >= MAX_ATTEMPTS) return null;
  const minutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length - 1)];
  return minutes * 60 * 1000;
}

export async function withRetry<T>(
  op: () => Promise<T>,
  onAttempt?: (attempt: number, err: unknown) => void,
): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < MAX_ATTEMPTS) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      onAttempt?.(attempt, err);
      if (err instanceof RateLimitedError) throw err;
      const delay = nextBackoffMs(attempt + 1);
      if (delay === null) break;
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
  throw lastErr;
}
