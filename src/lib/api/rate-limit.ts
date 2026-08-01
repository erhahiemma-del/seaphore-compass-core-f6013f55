/**
 * Rate-limit scaffolding.
 * In-memory fixed-window counter, keyed by user id (or IP fallback).
 * Replace with Redis / Upstash for multi-instance deploys.
 */
import { Errors } from "./errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function enforceRateLimit(key: string, { windowMs, max }: RateLimitOptions): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw Errors.rateLimited(Math.ceil((bucket.resetAt - now) / 1000));
  }
}

/** Default per-user policy: 60 requests / minute. */
export const DEFAULT_POLICY: RateLimitOptions = { windowMs: 60_000, max: 60 };
