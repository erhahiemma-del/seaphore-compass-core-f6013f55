/**
 * Sprint 12 · Circuit breaker.
 *
 * Custom (no `opossum` — it depends on Node internals the Worker
 * runtime does not ship). Opens after N consecutive failures, waits
 * `resetMs`, then admits a single probe in HALF_OPEN. A probe success
 * closes the circuit; a probe failure re-opens with doubled backoff up
 * to `maxResetMs`. Thresholds are per-instance so ops can tune per
 * dependency without a redeploy.
 */

export type BreakerState = "closed" | "open" | "half_open";

export class CircuitOpenError extends Error {
  constructor(
    readonly name: string,
    readonly retryAtMs: number,
  ) {
    super(`Circuit '${name}' is open until ${new Date(retryAtMs).toISOString()}`);
    this.name = "CircuitOpenError";
  }
}

export interface BreakerOptions {
  name: string;
  failureThreshold?: number; // default 5 (Sprint 12 AC)
  resetMs?: number; // default 30_000
  maxResetMs?: number; // default 5 * 60_000
  now?: () => number;
  isFailure?: (err: unknown) => boolean;
  onStateChange?: (name: string, from: BreakerState, to: BreakerState) => void;
}

export interface BreakerStats {
  name: string;
  state: BreakerState;
  failures: number;
  successes: number;
  openedAt?: number;
  nextProbeAt?: number;
  lastError?: string;
}

export interface CircuitBreaker {
  readonly name: string;
  state(): BreakerState;
  stats(): BreakerStats;
  fire<T>(op: () => Promise<T>): Promise<T>;
  reset(): void;
  forceOpen(): void;
}

export function createBreaker(opts: BreakerOptions): CircuitBreaker {
  const now = opts.now ?? Date.now;
  const threshold = opts.failureThreshold ?? 5;
  const baseReset = opts.resetMs ?? 30_000;
  const maxReset = opts.maxResetMs ?? 5 * 60_000;
  const isFailure = opts.isFailure ?? (() => true);

  let state: BreakerState = "closed";
  let failures = 0;
  let successes = 0;
  let openedAt: number | undefined;
  let nextProbeAt: number | undefined;
  let currentReset = baseReset;
  let lastError: string | undefined;

  const transition = (to: BreakerState) => {
    if (state === to) return;
    const from = state;
    state = to;
    opts.onStateChange?.(opts.name, from, to);
  };

  const open = () => {
    openedAt = now();
    nextProbeAt = openedAt + currentReset;
    transition("open");
  };

  return {
    name: opts.name,
    state: () => state,
    stats: () => ({
      name: opts.name,
      state,
      failures,
      successes,
      openedAt,
      nextProbeAt,
      lastError,
    }),
    reset() {
      state = "closed";
      failures = 0;
      openedAt = undefined;
      nextProbeAt = undefined;
      currentReset = baseReset;
      lastError = undefined;
    },
    forceOpen() {
      currentReset = baseReset;
      open();
    },
    async fire<T>(op: () => Promise<T>): Promise<T> {
      if (state === "open") {
        if (nextProbeAt !== undefined && now() >= nextProbeAt) transition("half_open");
        else throw new CircuitOpenError(opts.name, nextProbeAt ?? now());
      }
      try {
        const result = await op();
        successes++;
        if (state === "half_open" || failures > 0) {
          failures = 0;
          currentReset = baseReset;
          transition("closed");
        }
        return result;
      } catch (err) {
        if (!isFailure(err)) throw err;
        lastError = err instanceof Error ? err.message : String(err);
        if (state === "half_open") {
          currentReset = Math.min(maxReset, currentReset * 2);
          open();
        } else {
          failures++;
          if (failures >= threshold) open();
        }
        throw err;
      }
    },
  };
}

/** Registry so ops can list / reset all breakers from a dashboard. */
export function createBreakerRegistry() {
  const map = new Map<string, CircuitBreaker>();
  return {
    register(b: CircuitBreaker) {
      map.set(b.name, b);
      return b;
    },
    get(name: string) {
      return map.get(name);
    },
    list(): BreakerStats[] {
      return [...map.values()].map((b) => b.stats());
    },
    resetAll() {
      for (const b of map.values()) b.reset();
    },
  };
}
