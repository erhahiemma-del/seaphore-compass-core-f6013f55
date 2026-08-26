import { describe, expect, it } from "vitest";

import {
  PENDING_RISK_MODULES,
  RiskModuleRegistry,
  RiskModuleRegistryError,
  aggregateFindings,
  byPriority,
  collectEvidence,
  isValidFinding,
  pendingSourceFinding,
  validateFinding,
  type IntelligenceFinding,
  type RiskModule,
} from "@/services/intelligence";

const NOW = Date.parse("2026-08-06T12:00:00.000Z");

function finding(over: Partial<IntelligenceFinding> = {}): IntelligenceFinding {
  return {
    id: "f1",
    subject: { kind: "vessel", id: "9411765", displayName: "MV Test" },
    module: "ais-integrity",
    kind: "ais-gap",
    statement: "No AIS transmission for 7 hours.",
    producedAt: new Date(NOW).toISOString(),
    observedAt: new Date(NOW - 7 * 3_600_000).toISOString(),
    evidence: [
      {
        id: "e1",
        type: "AIS_DARK",
        grade: "CORROBORATED",
        observationConfidence: 0.82,
        summary: "Gap of 7.0 h; weather clear; 42 nm from coast.",
        observedAt: new Date(NOW - 7 * 3_600_000).toISOString(),
        provenance: {
          source: "global-fishing-watch",
          provider: "Global Fishing Watch",
          retrievedAt: new Date(NOW).toISOString(),
          observedAt: new Date(NOW - 7 * 3_600_000).toISOString(),
        },
        payloadRef: "osae:report:9411765#0",
      },
    ],
    assessment: null,
    priority: null,
    priorityRationale: null,
    dataQuality: {
      validation: "accepted",
      validationReasons: [],
      freshness: "stale",
      ageMs: 7 * 3_600_000,
      gaps: [],
    },
    provenance: { sources: [], pipeline: [], corroboration: null },
    status: "supported",
    unavailableReason: null,
    ...over,
  };
}

function testModule(over: Partial<RiskModule> & { id: RiskModule["id"] }): RiskModule {
  return {
    label: over.id,
    description: "Test module.",
    status: "ready",
    requires: [],
    evaluate: async () => [],
    ...over,
  };
}

describe("IntelligenceFinding — contract enforcement", () => {
  it("accepts a well-formed supported finding", () => {
    expect(isValidFinding(finding())).toBe(true);
  });

  it("rejects a supported statement with no evidence", () => {
    // The prohibition the whole architecture exists to enforce.
    const codes = validateFinding(finding({ evidence: [] })).map((v) => v.code);
    expect(codes).toContain("unsupported-statement");
  });

  it("requires a reason whenever status is not supported", () => {
    const codes = validateFinding(
      finding({ status: "pending-source", unavailableReason: null }),
    ).map((v) => v.code);
    expect(codes).toContain("missing-unavailable-reason");
  });

  it("requires a counter-hypothesis for a high-band assessment", () => {
    const codes = validateFinding(
      finding({
        assessment: {
          statement: "Deliberate AIS disabling is likely.",
          confidence: 0.8,
          band: "high",
          propagation: {
            evidence: 0.8,
            relationship: 0.74,
            pattern: 0.68,
            assessment: 0.63,
            recommendation: 0.58,
          },
          whyChain: [],
          counterHypothesis: null,
        },
      }),
    ).map((v) => v.code);

    expect(codes).toContain("missing-counter-hypothesis");
  });

  it("requires a counter-hypothesis for a medium band too", () => {
    const codes = validateFinding(
      finding({
        assessment: {
          statement: "Possible disabling.",
          confidence: 0.6,
          band: "medium",
          propagation: {
            evidence: 0.6,
            relationship: 0.55,
            pattern: 0.51,
            assessment: 0.47,
            recommendation: 0.44,
          },
          whyChain: [],
          counterHypothesis: null,
        },
      }),
    ).map((v) => v.code);

    expect(codes).toContain("missing-counter-hypothesis");
  });

  it("does not require one for a low band", () => {
    const violations = validateFinding(
      finding({
        assessment: {
          statement: "Weak signal.",
          confidence: 0.3,
          band: "low",
          propagation: {
            evidence: 0.3,
            relationship: 0.28,
            pattern: 0.26,
            assessment: 0.24,
            recommendation: 0.22,
          },
          whyChain: [],
          counterHypothesis: null,
        },
      }),
    );

    expect(violations).toEqual([]);
  });

  it("refuses a priority with no evidence behind it", () => {
    const codes = validateFinding(finding({ evidence: [], priority: "act" })).map((v) => v.code);
    expect(codes).toContain("priority-without-evidence");
  });

  it("keeps evidence grade and assessment band as separate vocabularies", () => {
    // A CORROBORATED source can still yield a low-confidence conclusion.
    const f = finding({
      assessment: {
        statement: "Inference from one gap is weak.",
        confidence: 0.3,
        band: "low",
        propagation: {
          evidence: 0.82,
          relationship: 0.76,
          pattern: 0.7,
          assessment: 0.3,
          recommendation: 0.28,
        },
        whyChain: [],
        counterHypothesis: null,
      },
    });

    expect(f.evidence[0].grade).toBe("CORROBORATED");
    expect(f.assessment?.band).toBe("low");
    expect(isValidFinding(f)).toBe(true);
  });
});

describe("RiskModuleRegistry", () => {
  it("registers and retrieves a module", () => {
    const registry = new RiskModuleRegistry().register(testModule({ id: "ais-integrity" }));
    expect(registry.has("ais-integrity")).toBe(true);
  });

  /*
   * Registration is idempotent by definition rather than by id.
   *
   * This replaced a single "rejects a duplicate id" assertion. That rule
   * made a re-evaluated module graph — a Vite hot update, or a client and
   * SSR graph sharing one process — throw
   * `Module 'ais-integrity' is already registered` during bootstrap, which
   * is what took the application down. The three cases below are what the
   * registry must distinguish instead.
   */
  it("treats re-registering the same declaration as a no-op", () => {
    const registry = new RiskModuleRegistry().register(testModule({ id: "ownership" }));
    // A distinct object with identical content, exactly as a second
    // evaluation of the same source file produces.
    expect(() => registry.register(testModule({ id: "ownership" }))).not.toThrow();
    expect(registry.list()).toHaveLength(1);
  });

  it("still rejects a genuinely different module under a taken id", () => {
    const registry = new RiskModuleRegistry().register(testModule({ id: "ownership" }));
    expect(() =>
      registry.register(testModule({ id: "ownership", label: "Something else" })),
    ).toThrow(RiskModuleRegistryError);
  });

  it("names the field that conflicts", () => {
    // "already registered" alone sends whoever hits it hunting.
    const registry = new RiskModuleRegistry().register(testModule({ id: "ownership" }));
    expect(() =>
      registry.register(testModule({ id: "ownership", label: "Something else" })),
    ).toThrow(/label/);
  });

  it("never silently overwrites a registered module", () => {
    const registry = new RiskModuleRegistry().register(
      testModule({ id: "ownership", label: "Original" }),
    );
    try {
      registry.register(testModule({ id: "ownership", label: "Replacement" }));
    } catch {
      /* expected */
    }
    expect(registry.get("ownership")?.label).toBe("Original");
  });

  it("refuses a pending-source module with no reason", () => {
    // An unexplained absence is what the registry exists to prevent.
    const registry = new RiskModuleRegistry();
    expect(() => registry.register(testModule({ id: "cargo", status: "pending-source" }))).toThrow(
      /pendingReason/,
    );
  });

  it("lists ready modules before pending ones", () => {
    const registry = new RiskModuleRegistry().registerAll([
      testModule({ id: "cargo", status: "pending-source", pendingReason: "no manifests" }),
      testModule({ id: "ais-integrity", status: "ready" }),
    ]);

    expect(registry.list()[0].id).toBe("ais-integrity");
    expect(registry.ready()).toHaveLength(1);
    expect(registry.pending()).toHaveLength(1);
  });
});

describe("shipped pending modules", () => {
  it("registers the eight modules that have no data source", () => {
    expect(PENDING_RISK_MODULES).toHaveLength(8);
  });

  it("gives every one a stated blocker", () => {
    for (const module of PENDING_RISK_MODULES) {
      expect(module.status).toBe("pending-source");
      expect(module.pendingReason, `${module.id} needs a reason`).toBeTruthy();
      expect(module.requires.length).toBeGreaterThan(0);
    }
  });

  it("produces a finding that explains itself, never a score", () => {
    const module = PENDING_RISK_MODULES[0];
    const f = pendingSourceFinding(module, {
      subjectId: "9411765",
      displayName: "MV Test",
      now: NOW,
    });

    expect(f.status).toBe("pending-source");
    expect(f.unavailableReason).toBe(module.pendingReason);
    expect(f.evidence).toEqual([]);
    expect(f.assessment).toBeNull();
    expect(f.priority).toBeNull();
    expect(isValidFinding(f)).toBe(true);
  });

  it("names the real blocker for navigation", () => {
    const nav = PENDING_RISK_MODULES.find((m) => m.id === "navigation")!;
    expect(nav.pendingReason).toMatch(/neither course nor speed/i);
  });
});

describe("aggregateFindings", () => {
  it("reports every module, including non-contributors", async () => {
    const registry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);

    const set = await aggregateFindings("9411765", "MV Test", { registry, now: NOW });

    expect(set.contributions).toHaveLength(8);
    expect(set.counts.pendingSource).toBe(8);
    expect(set.counts.supported).toBe(0);
    for (const contribution of set.contributions) {
      expect(contribution.unavailableReason).toBeTruthy();
    }
  });

  it("produces no overall score", async () => {
    const registry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);
    const set = await aggregateFindings("9411765", "MV Test", { registry, now: NOW });

    // A single number would require inventing weights across nine modules.
    expect(set).not.toHaveProperty("overallRisk");
    expect(set).not.toHaveProperty("score");
  });

  it("isolates a module that throws", async () => {
    const registry = new RiskModuleRegistry().registerAll([
      testModule({
        id: "ais-integrity",
        evaluate: async () => {
          throw new Error("analyzer exploded");
        },
      }),
      testModule({ id: "cargo", status: "pending-source", pendingReason: "no manifests" }),
    ]);

    const set = await aggregateFindings("1", "X", { registry, now: NOW });

    expect(set.contributions.find((c) => c.module === "ais-integrity")?.error).toMatch(/exploded/);
    expect(set.contributions.find((c) => c.module === "cargo")?.error).toBeNull();
  });

  it("surfaces contract violations rather than swallowing them", async () => {
    const registry = new RiskModuleRegistry().register(
      testModule({
        id: "ais-integrity",
        evaluate: async () => [finding({ evidence: [] })],
      }),
    );

    const set = await aggregateFindings("1", "X", { registry, now: NOW });

    expect(set.violations).toHaveLength(1);
    expect(set.violations[0].message).toMatch(/unsupported-statement/);
  });

  it("restricts to selected modules", async () => {
    const registry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);

    const set = await aggregateFindings("1", "X", {
      registry,
      modules: ["ownership"],
      now: NOW,
    });

    expect(set.contributions).toHaveLength(1);
    expect(set.contributions[0].module).toBe("ownership");
  });
});

describe("helpers", () => {
  it("orders by OSAE priority without assigning any", () => {
    const ordered = byPriority([
      finding({ id: "a", priority: "monitor" }),
      finding({ id: "b", priority: "urgent" }),
      finding({ id: "c", priority: null }),
      finding({ id: "d", priority: "act" }),
    ]);

    expect(ordered.map((f) => f.id)).toEqual(["b", "d", "a"]);
  });

  it("de-duplicates evidence across findings", () => {
    const refs = collectEvidence([finding({ id: "a" }), finding({ id: "b" })]);
    expect(refs).toHaveLength(1);
    expect(refs[0].id).toBe("e1");
  });
});
