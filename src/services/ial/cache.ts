/**
 * Evidence Cache — TTL cache with background refresh and forced refresh.
 *
 * The cache is deliberately in-memory: the IAL runs inside the app process
 * on the edge worker, and long-lived state should live in Supabase.
 * Playbooks receive the best available evidence — a stale cache hit is
 * always better than a hard connector failure (offline fallback).
 */
import type { ConnectorResult } from "./types";

export interface CacheEntry {
  readonly key: string;
  readonly value: ConnectorResult;
  readonly storedAt: number;
  readonly ttlMs: number;
}

export interface EvidenceCacheOptions {
  readonly defaultTtlMs?: number;
  readonly refreshMarginMs?: number;
  readonly clock?: () => number;
}

export class EvidenceCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;
  private readonly refreshMarginMs: number;
  private readonly now: () => number;
  private hits = 0;
  private misses = 0;

  constructor(opts: EvidenceCacheOptions = {}) {
    this.defaultTtlMs = opts.defaultTtlMs ?? 5 * 60 * 1000;
    this.refreshMarginMs = opts.refreshMarginMs ?? 30 * 1000;
    this.now = opts.clock ?? Date.now;
  }

  get(key: string): ConnectorResult | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (this.now() - entry.storedAt > entry.ttlMs) {
      // Keep entry as an offline-fallback candidate but mark it as a miss.
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  /** Returns any entry, even expired — used for offline fallback. */
  peekStale(key: string): ConnectorResult | null {
    return this.store.get(key)?.value ?? null;
  }

  set(key: string, value: ConnectorResult, ttlMs?: number): void {
    this.store.set(key, {
      key,
      value,
      storedAt: this.now(),
      ttlMs: ttlMs ?? this.defaultTtlMs,
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Records that need background refresh soon. */
  dueForRefresh(): string[] {
    const now = this.now();
    const due: string[] = [];
    for (const [k, e] of this.store) {
      if (now - e.storedAt > e.ttlMs - this.refreshMarginMs) due.push(k);
    }
    return due;
  }

  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.store.size };
  }

  reset(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
