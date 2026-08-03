/**
 * Sprint 12 · Production hardening tests.
 * Covers TTL/LRU cache, retry+jitter, circuit breaker state machine,
 * token-bucket rate limiter, offline mode transitions, security helpers.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createCache,
  createMemoryStore,
  retry,
  NonRetryableError,
  createBreaker,
  CircuitOpenError,
  createBreakerRegistry,
  createRateLimiter,
  createModeManager,
  escapeHtml,
  looksLikeSqlInjection,
  assertSafeIdent,
  timingSafeEqual,
  assertAllowedUrl,
  withSecurityHeaders,
} from "@/services/hardening";

describe("Sprint 12 · cache", () => {
  it("returns cached value within TTL and misses after expiry", () => {
    let t = 1_000;
    const c = createCache(createMemoryStore(), { ttlMs: 100, now: () => t });
    c.set("k", 42);
    expect(c.get<number>("k")).toBe(42);
    t += 200;
    expect(c.get<number>("k")).toBeUndefined();
    expect(c.stats().expirations).toBe(1);
  });

  it("evicts LRU beyond capacity", () => {
    const s = createMemoryStore<number>(2);
    const c = createCache(s, { ttlMs: 60_000 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  it("wrap() only invokes loader on miss", async () => {
    const c = createCache(createMemoryStore(), { ttlMs: 1000 });
    const loader = vi.fn().mockResolvedValue("v");
    expect(await c.wrap("k", loader)).toBe("v");
    expect(await c.wrap("k", loader)).toBe("v");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("invalidates by prefix", () => {
    const c = createCache(createMemoryStore(), { ttlMs: 1000, namespace: "ns" });
    c.set("vessel:1", 1);
    c.set("vessel:2", 2);
    c.set("port:1", 3);
    expect(c.invalidatePrefix("vessel:")).toBe(2);
    expect(c.get("port:1")).toBe(3);
  });
});

describe("Sprint 12 · retry", () => {
  it("retries up to 3 times then succeeds", async () => {
    let n = 0;
    const result = await retry(
      async () => {
        if (++n < 3) throw new Error("boom");
        return "ok";
      },
      { sleep: async () => {}, jitter: false },
    );
    expect(result).toBe("ok");
    expect(n).toBe(3);
  });

  it("does not retry NonRetryableError", async () => {
    let n = 0;
    await expect(
      retry(
        async () => {
          n++;
          throw new NonRetryableError("nope");
        },
        { sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(NonRetryableError);
    expect(n).toBe(1);
  });

  it("stops after retries budget", async () => {
    let n = 0;
    await expect(
      retry(
        async () => {
          n++;
          throw new Error("x");
        },
        { retries: 3, sleep: async () => {}, jitter: false },
      ),
    ).rejects.toThrow("x");
    expect(n).toBe(4); // initial + 3 retries
  });
});

describe("Sprint 12 · circuit breaker", () => {
  it("opens after 5 consecutive failures", async () => {
    let t = 0;
    const b = createBreaker({ name: "svc", failureThreshold: 5, resetMs: 1000, now: () => t });
    for (let i = 0; i < 5; i++) {
      await expect(
        b.fire(async () => {
          throw new Error("f");
        }),
      ).rejects.toThrow("f");
    }
    expect(b.state()).toBe("open");
    await expect(b.fire(async () => "x")).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("half-opens after resetMs and closes on success", async () => {
    let t = 0;
    const b = createBreaker({ name: "svc", failureThreshold: 2, resetMs: 500, now: () => t });
    for (let i = 0; i < 2; i++)
      await expect(
        b.fire(async () => {
          throw new Error("f");
        }),
      ).rejects.toBeDefined();
    t += 600;
    const out = await b.fire(async () => "recovered");
    expect(out).toBe("recovered");
    expect(b.state()).toBe("closed");
  });

  it("re-opens with doubled backoff on probe failure", async () => {
    let t = 0;
    const b = createBreaker({
      name: "svc",
      failureThreshold: 1,
      resetMs: 100,
      maxResetMs: 10_000,
      now: () => t,
    });
    await expect(
      b.fire(async () => {
        throw new Error("f");
      }),
    ).rejects.toBeDefined();
    t += 100;
    await expect(
      b.fire(async () => {
        throw new Error("f2");
      }),
    ).rejects.toBeDefined();
    // next probe pushed out to at least 200ms
    expect((b.stats().nextProbeAt ?? 0) - t).toBeGreaterThanOrEqual(200);
  });

  it("registry lists breakers", () => {
    const reg = createBreakerRegistry();
    reg.register(createBreaker({ name: "a" }));
    reg.register(createBreaker({ name: "b" }));
    expect(
      reg
        .list()
        .map((s) => s.name)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});

describe("Sprint 12 · rate limiter", () => {
  it("allows within capacity, blocks past it, reports retryAfter", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 3, refillPerSec: 1 }, () => t);
    for (let i = 0; i < 3; i++) expect(rl.take("officer:1").allowed).toBe(true);
    const denied = rl.take("officer:1");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 2, refillPerSec: 10 }, () => t);
    rl.take("k");
    rl.take("k");
    expect(rl.take("k").allowed).toBe(false);
    t += 200; // 200ms → +2 tokens
    expect(rl.take("k").allowed).toBe(true);
  });

  it("isolates buckets per key", () => {
    const rl = createRateLimiter({ capacity: 1, refillPerSec: 0 });
    expect(rl.take("a").allowed).toBe(true);
    expect(rl.take("b").allowed).toBe(true);
    expect(rl.take("a").allowed).toBe(false);
  });
});

describe("Sprint 12 · offline mode", () => {
  it("stays online with all healthy sources", () => {
    const m = createModeManager();
    m.report({ id: "opensanctions", ok: true, critical: true, checkedAt: 1 });
    expect(m.snapshot().mode).toBe("online");
  });

  it("degrades on any failure, goes offline when all critical sources fail", () => {
    const m = createModeManager();
    m.report({ id: "opensanctions", ok: true, critical: true, checkedAt: 1 });
    m.report({ id: "marinetraffic", ok: false, critical: true, checkedAt: 1 });
    expect(m.snapshot().mode).toBe("degraded");
    m.report({ id: "opensanctions", ok: false, critical: true, checkedAt: 2 });
    expect(m.snapshot().mode).toBe("offline");
  });

  it("notifies subscribers on transitions only", () => {
    const m = createModeManager();
    const fn = vi.fn();
    m.subscribe(fn);
    m.report({ id: "x", ok: true, critical: true, checkedAt: 1 });
    m.report({ id: "x", ok: true, critical: true, checkedAt: 2 });
    m.report({ id: "x", ok: false, critical: true, checkedAt: 3 });
    expect(fn).toHaveBeenCalledTimes(2); // registration + transition
  });
});

describe("Sprint 12 · security helpers", () => {
  it("escapes html", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;&#x2F;script&gt;",
    );
  });
  it("detects common SQLi shapes", () => {
    expect(looksLikeSqlInjection("' OR 1=1 --")).toBe(true);
    expect(looksLikeSqlInjection("UNION SELECT password FROM users")).toBe(true);
    expect(looksLikeSqlInjection("MV Crimson Endeavour")).toBe(false);
  });
  it("whitelists identifiers", () => {
    expect(assertSafeIdent("created_at", ["created_at", "id"])).toBe("created_at");
    expect(() => assertSafeIdent("password", ["id"])).toThrow();
  });
  it("timing-safe compare", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
  it("blocks non-allowed / non-https URLs", () => {
    expect(() => assertAllowedUrl("http://example.com", ["example.com"])).toThrow("https");
    expect(() => assertAllowedUrl("https://evil.com", ["example.com"])).toThrow("not allowed");
    expect(assertAllowedUrl("https://example.com/x", ["example.com"]).hostname).toBe("example.com");
  });
  it("adds standard headers without overriding caller values", () => {
    const init = withSecurityHeaders({ headers: { "X-Frame-Options": "SAMEORIGIN" } });
    const h = new Headers(init.headers);
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
