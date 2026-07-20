/**
 * Sprint 12 · Cache layer.
 *
 * TTL + LRU cache with a pluggable `CacheStore` interface so a Redis /
 * KV / D1 backend can be swapped in without touching call sites. The
 * default in-memory store is safe on Cloudflare Workers, where each
 * isolate keeps its own map (per-region warm cache). Entity lookups and
 * evidence queries wrap through `cached()` to hit the <500 ms budget.
 */

export interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  createdAt: number;
}

export interface CacheStore<V = unknown> {
  get(key: string): CacheEntry<V> | undefined;
  set(key: string, entry: CacheEntry<V>): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
  keys(): readonly string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
}

/** In-memory LRU + TTL. Bounded so runaway keys can't OOM the isolate. */
export function createMemoryStore<V>(maxEntries = 5_000): CacheStore<V> {
  const map = new Map<string, CacheEntry<V>>();
  return {
    get(key) {
      const e = map.get(key);
      if (!e) return undefined;
      // refresh LRU ordering
      map.delete(key);
      map.set(key, e);
      return e;
    },
    set(key, entry) {
      if (map.has(key)) map.delete(key);
      map.set(key, entry);
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    delete(key) { map.delete(key); },
    clear() { map.clear(); },
    size() { return map.size; },
    keys() { return [...map.keys()]; },
  };
}

export interface CacheOptions {
  ttlMs: number;
  namespace?: string;
  now?: () => number;
}

export interface Cache {
  get<V>(key: string): V | undefined;
  set<V>(key: string, value: V, ttlMs?: number): void;
  delete(key: string): void;
  invalidatePrefix(prefix: string): number;
  clear(): void;
  stats(): CacheStats;
  wrap<V>(key: string, loader: () => Promise<V>, ttlMs?: number): Promise<V>;
}

export function createCache(
  store: CacheStore = createMemoryStore(),
  opts: CacheOptions = { ttlMs: 60_000 },
): Cache {
  const now = opts.now ?? Date.now;
  const ns = opts.namespace ? `${opts.namespace}:` : "";
  let hits = 0, misses = 0, evictions = 0, expirations = 0;
  const k = (key: string) => ns + key;

  return {
    get<V>(key: string): V | undefined {
      const entry = store.get(k(key));
      if (!entry) { misses++; return undefined; }
      if (entry.expiresAt <= now()) {
        store.delete(k(key));
        expirations++;
        misses++;
        return undefined;
      }
      hits++;
      return entry.value as V;
    },
    set<V>(key: string, value: V, ttlMs: number = opts.ttlMs) {
      store.set(k(key), { value, createdAt: now(), expiresAt: now() + ttlMs });
    },
    delete(key: string) {
      if (store.get(k(key))) evictions++;
      store.delete(k(key));
    },
    invalidatePrefix(prefix: string) {
      const full = k(prefix);
      let n = 0;
      for (const key of store.keys()) {
        if (key.startsWith(full)) { store.delete(key); n++; evictions++; }
      }
      return n;
    },
    clear() { store.clear(); },
    stats() {
      return { hits, misses, evictions, expirations, size: store.size() };
    },
    async wrap<V>(key: string, loader: () => Promise<V>, ttlMs?: number): Promise<V> {
      const cached = this.get<V>(key);
      if (cached !== undefined) return cached;
      const value = await loader();
      this.set(key, value, ttlMs);
      return value;
    },
  };
}
