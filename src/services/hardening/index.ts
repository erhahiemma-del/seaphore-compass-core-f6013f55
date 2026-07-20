/**
 * Sprint 12 · Production hardening barrel.
 *
 * Assembles the app-wide singletons: cache, breaker registry, mode
 * manager, per-officer rate limiter. Consumers should import from here
 * so ops can swap implementations (Redis, KV, external circuit-breaker
 * dashboard) in one place.
 */
export * from "./cache";
export * from "./retry";
export * from "./circuit-breaker";
export * from "./rate-limit";
export * from "./offline";
export * from "./security";

import { createCache } from "./cache";
import { createBreakerRegistry } from "./circuit-breaker";
import { createModeManager } from "./offline";
import { createRateLimiter, RATE_PRESETS } from "./rate-limit";

/** Long TTLs are dangerous for intelligence — keep them tight. */
export const CACHE_TTLS = {
  entity: 60_000,           // 60s: entity lookups
  evidence: 30_000,         // 30s: evidence queries (stale-safe)
  reference: 5 * 60_000,    // 5m: ports, regulations, sanctions lists
} as const;

export const hardening = {
  cache: createCache(undefined, { ttlMs: CACHE_TTLS.entity, namespace: "hp" }),
  breakers: createBreakerRegistry(),
  mode: createModeManager(),
  officerLimiter: createRateLimiter(RATE_PRESETS.officerDefault),
  copilotLimiter: createRateLimiter(RATE_PRESETS.copilotQuery),
};
