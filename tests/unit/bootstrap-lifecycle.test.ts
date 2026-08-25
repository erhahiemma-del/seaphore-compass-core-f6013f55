/**
 * Application bootstrap — determinism contract.
 *
 * Two failures took the preview down intermittently, and both were
 * ordering problems rather than logic errors:
 *
 *   `RiskModuleRegistryError: Module 'ais-integrity' is already
 *   registered` — a module graph evaluated twice (hot update, or a client
 *   and SSR graph in one process) hitting a registry that treated any
 *   repeat id as a conflict.
 *
 *   `Unauthorized: No authorization header provided` — a protected
 *   request issued before session restoration finished. Fourteen
 *   components each ran their own restoration, so every protected query
 *   was gated on a different clock and fixing one moved the failure to
 *   the next.
 *
 * These guard the rules that make startup deterministic regardless of how
 * many times a module is evaluated or which component mounts first.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  RiskModuleRegistry,
  RiskModuleRegistryError,
  type RiskModule,
} from "@/services/intelligence";
import {
  __emitAuthForTests,
  __resetAuthForTests,
  getAuthSnapshot,
  getServerAuthSnapshot,
  subscribeToAuth,
  whenAuthResolved,
} from "@/lib/auth/auth-controller";

const mod = (over: Partial<RiskModule> & { id: RiskModule["id"] }): RiskModule => ({
  label: over.id,
  description: "Test module.",
  status: "ready",
  requires: [],
  evaluate: async () => [],
  ...over,
});

/* ═══════ 1. Repeated module evaluation ═══════ */

describe("module registration survives repeated evaluation", () => {
  it("accepts the same declaration twice as a no-op", () => {
    const registry = new RiskModuleRegistry().register(mod({ id: "ais-integrity" }));
    expect(() => registry.register(mod({ id: "ais-integrity" }))).not.toThrow();
    expect(registry.list()).toHaveLength(1);
  });

  it("survives many evaluations without growing", () => {
    // A long dev session hot-updates the same file repeatedly.
    const registry = new RiskModuleRegistry();
    for (let i = 0; i < 25; i++) registry.register(mod({ id: "ais-integrity" }));
    expect(registry.list()).toHaveLength(1);
  });

  it("ignores evaluate identity, which changes on every evaluation", () => {
    // The whole reason structural comparison excludes it: a re-evaluated
    // module always has a new function, so comparing it would make every
    // hot update a conflict.
    const registry = new RiskModuleRegistry().register(
      mod({ id: "ais-integrity", evaluate: async () => [] }),
    );
    expect(() =>
      registry.register(mod({ id: "ais-integrity", evaluate: async () => [] })),
    ).not.toThrow();
  });

  it("still rejects a genuinely different module and says what differs", () => {
    const registry = new RiskModuleRegistry().register(mod({ id: "ais-integrity" }));
    expect(() =>
      registry.register(mod({ id: "ais-integrity", status: "pending-source", pendingReason: "x" })),
    ).toThrow(RiskModuleRegistryError);
    expect(() =>
      registry.register(mod({ id: "ais-integrity", description: "Different." })),
    ).toThrow(/description/);
  });

  it("keeps the original when a conflicting registration is refused", () => {
    const registry = new RiskModuleRegistry().register(
      mod({ id: "ais-integrity", label: "Original" }),
    );
    expect(() => registry.register(mod({ id: "ais-integrity", label: "Other" }))).toThrow();
    expect(registry.get("ais-integrity")?.label).toBe("Original");
  });

  it("registers ais-integrity exactly once at the composition point", () => {
    // Source-level: the one registration path must not be duplicated, and
    // must not be wrapped in a swallowing try/catch.
    const source = readFileSync(
      resolve(process.cwd(), "src/services/intelligence/index.ts"),
      "utf8",
    );
    const calls = source.match(/riskModuleRegistry\.register\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(source).not.toMatch(/catch\s*\{\s*\}/);
  });
});

/* ═══════ 2. One shared auth restoration ═══════ */

describe("auth restoration is shared and ordered", () => {
  beforeEach(() => __resetAuthForTests());

  it("starts unresolved so protected work cannot begin", () => {
    expect(getAuthSnapshot().phase).toBe("initializing");
  });

  it("reports initializing on the server rather than signed-out", () => {
    // Claiming unauthenticated during SSR would render the signed-out UI
    // into the HTML for an officer who is signed in.
    expect(getServerAuthSnapshot().phase).toBe("initializing");
  });

  it("gives every subscriber the same snapshot", () => {
    // The bug this replaces: fourteen useAuth() callers each held their
    // own state and resolved at their own moment.
    const seen: string[] = [];
    subscribeToAuth(() => seen.push(getAuthSnapshot().phase));
    subscribeToAuth(() => seen.push(getAuthSnapshot().phase));
    __emitAuthForTests({ phase: "unauthenticated", session: null, error: null });
    expect(seen).toEqual(["unauthenticated", "unauthenticated"]);
  });

  it("distinguishes an error from being signed out", () => {
    __emitAuthForTests({ phase: "error", session: null, error: "storage unreadable" });
    const snapshot = getAuthSnapshot();
    expect(snapshot.phase).toBe("error");
    expect(snapshot.session).toBeNull();
    // Both have a null session; only the phase tells them apart.
    expect(snapshot.phase).not.toBe("unauthenticated");
    expect(snapshot.error).toBe("storage unreadable");
  });

  it("resolves waiters once, and immediately thereafter", async () => {
    const pending = whenAuthResolved();
    __emitAuthForTests({ phase: "unauthenticated", session: null, error: null });
    expect((await pending).phase).toBe("unauthenticated");
    // Already resolved: a later caller must not hang waiting for a second
    // transition that will never come.
    expect((await whenAuthResolved()).phase).toBe("unauthenticated");
  });

  it("always reaches a terminal phase rather than hanging", async () => {
    // No browser bindings in this environment, so restoration cannot run.
    // It must settle as `error` — a startup that never resolves is the
    // permanent "Verifying session…" spinner this work exists to remove.
    const snapshot = await whenAuthResolved();
    // Which terminal phase depends on the environment; that it reaches one
    // is the contract. A restoration that never settles is the permanent
    // "Verifying session…" spinner this work exists to remove.
    expect(snapshot.phase).not.toBe("initializing");
  });

  it("stops notifying after unsubscribe", () => {
    let count = 0;
    const off = subscribeToAuth(() => count++);
    __emitAuthForTests({ phase: "unauthenticated", session: null, error: null });
    off();
    __emitAuthForTests({ phase: "authenticated", session: {} as never, error: null });
    expect(count).toBe(1);
  });
});

/* ═══════ 3. Protected query gating ═══════ */

describe("protected reads wait for a resolved session", () => {
  const sourceOf = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("gates the voyage register on a resolved session", () => {
    // The read named in the failure history. Must require both that auth
    // finished and that a session exists.
    const source = sourceOf("src/features/maritime/useVoyages.ts");
    expect(source).toMatch(/!authLoading/);
    expect(source).toMatch(/Boolean\(session\)/);
  });

  it("keeps one auth hook rather than a second implementation", () => {
    // useAuth must read the shared controller, not hold session state.
    const source = sourceOf("src/hooks/use-auth.ts");
    expect(source).toContain("useSyncExternalStore");
    expect(source).not.toMatch(/useState<Session/);
    // The call, not the word — the docstring names it deliberately.
    expect(source).not.toMatch(/\.onAuthStateChange\s*\(/);
  });

  it("keeps exactly one onAuthStateChange restoration path", () => {
    // Two subscriptions is how the clocks diverged in the first place.
    const controller = sourceOf("src/lib/auth/auth-controller.ts");
    expect(controller.match(/\.onAuthStateChange\s*\(/g) ?? []).toHaveLength(1);
    expect(controller.match(/\.getSession\s*\(\)/g) ?? []).toHaveLength(1);
  });

  it("does not redirect an errored session to sign-in", () => {
    const source = sourceOf("src/components/auth/RequireAuth.tsx");
    expect(source).toMatch(/phase === "error"/);
  });
});
