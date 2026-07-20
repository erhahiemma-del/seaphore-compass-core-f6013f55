/**
 * Sprint 12 · Rate limiting.
 *
 * Token bucket per key (officer id, API route, IP). Enforces upstream
 * quotas AND per-officer throttling. Complements the Sprint 10 Policy
 * Engine rate limiter, which is workflow-scoped; this one is per-request.
 */

export interface BucketConfig {
  capacity: number;             // max tokens
  refillPerSec: number;         // tokens added per second
}

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  key: string;
}

interface Bucket { tokens: number; updatedAt: number }

export interface RateLimiter {
  take(key: string, cost?: number): RateDecision;
  reset(key?: string): void;
  snapshot(): Record<string, number>;
}

export function createRateLimiter(cfg: BucketConfig, now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>();

  const refill = (b: Bucket, t: number) => {
    const elapsed = (t - b.updatedAt) / 1000;
    b.tokens = Math.min(cfg.capacity, b.tokens + elapsed * cfg.refillPerSec);
    b.updatedAt = t;
  };

  return {
    take(key, cost = 1) {
      const t = now();
      let b = buckets.get(key);
      if (!b) { b = { tokens: cfg.capacity, updatedAt: t }; buckets.set(key, b); }
      refill(b, t);
      if (b.tokens >= cost) {
        b.tokens -= cost;
        return { allowed: true, remaining: Math.floor(b.tokens), retryAfterMs: 0, key };
      }
      const missing = cost - b.tokens;
      const retryAfterMs = Math.ceil((missing / cfg.refillPerSec) * 1000);
      return { allowed: false, remaining: Math.floor(b.tokens), retryAfterMs, key };
    },
    reset(key) { if (key) buckets.delete(key); else buckets.clear(); },
    snapshot() {
      const t = now();
      const out: Record<string, number> = {};
      for (const [k, b] of buckets) { refill(b, t); out[k] = Math.floor(b.tokens); }
      return out;
    },
  };
}

/** Common presets. Tune from ops without redeploy by swapping the config. */
export const RATE_PRESETS = {
  officerDefault: { capacity: 120, refillPerSec: 2 } satisfies BucketConfig,   // 120 req burst, 2 rps sustained
  copilotQuery: { capacity: 30, refillPerSec: 0.5 } satisfies BucketConfig,    // 30 burst, 30/min sustained
  externalApi: { capacity: 60, refillPerSec: 1 } satisfies BucketConfig,       // upstream quota guard
} as const;
