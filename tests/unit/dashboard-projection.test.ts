/**
 * SPRINT MIG-01 — dashboard projection tests.
 *
 * Confirms the Mission Control panels are pure projections of the
 * Canonical UIP and never invent a number.
 */
import { describe, expect, it } from "vitest";
import {
  projectManifestIntelligence,
  projectRevenueIntelligence,
} from "@/lib/intelligence/dashboard-projection";
import type { KpiCoverage } from "@/lib/intelligence/coverage-model";
import type { NormalizedEvidence } from "@/services/ial/types";
import type { LeakageFinding } from "@/services/revenue-leakage";

const coverage = (over: Partial<KpiCoverage> = {}): KpiCoverage =>
  ({
    key: "revenue",
    title: "Revenue Intelligence",
    descriptor: "Revenue Leakage Identified",
    display: "—",
    value: null,
    state: "ACTIVE",
    stateLabel: "Active",
    stateDetail: "Reporting live evidence",
    rootCause: "NONE",
    rootCauseDetail: "",
    evidenceCount: 3,
    coveragePct: 100,
    confidence: "observed",
    projectionContractId: "kpi.revenue-intelligence",
    projectionStatus: "MAPPED",
    dashboardField: "coverage.kpis.revenue.display",
    dashboardStatus: "READING_CORRECT_FIELD",
    checks: {
      providerRegistered: true,
      providerHealthy: true,
      credentialsConfigured: true,
      apiReachable: true,
      dataReturned: true,
      evidencePackageCreated: true,
      canonicalUipPopulated: true,
      projectionContractMapped: true,
      dashboardFieldMapped: true,
    },
    providers: [],
    providerCatalogHref: "/admin/provider-health",
    sourceOfTruth: "src/lib/server/intelligence/coverage.server.ts",
    ...over,
  }) as KpiCoverage;

const finding = (over: Partial<LeakageFinding> = {}): LeakageFinding =>
  ({
    id: "leak_1",
    category: "manifest-under-declaration",
    subjectId: "vessel:imo:9438291",
    subjectLabel: "Ocean Pearl",
    headline: "Manifest under-declaration",
    explanation: "",
    magnitudeCurrency: "USD",
    magnitude: 250_000,
    confidence: "OBSERVED",
    priority: "high",
    factors: [],
    citations: [],
    detectedAt: new Date().toISOString(),
    humanApproved: false,
    ...over,
  }) as LeakageFinding;

const evidence = (over: Partial<NormalizedEvidence> = {}): NormalizedEvidence =>
  ({
    id: "ev1",
    source: "opensanctions",
    sourceName: "OpenSanctions",
    grade: "OBSERVED",
    entity: { kind: "vessel", id: "vessel:imo:9438291", label: "Ocean Pearl" },
    kind: "cargo",
    fields: { declaredTonnage: 100, actualTonnage: 140 },
    observedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    freshnessSeconds: 10,
    hash: "h",
    ...over,
  }) as NormalizedEvidence;

describe("MIG-01 revenue projection", () => {
  it("reports NO_EVIDENCE, not a zero, without a Canonical UIP", () => {
    const p = projectRevenueIntelligence({ uipId: null, findings: [], coverage: coverage() });
    expect(p.state).toBe("NO_EVIDENCE");
    expect(p.data).toBeNull();
  });

  it("inherits the provider state when coverage is degraded", () => {
    const p = projectRevenueIntelligence({
      uipId: null,
      findings: [],
      coverage: coverage({ state: "AWAITING_CREDENTIALS", stateDetail: "Missing token" }),
    });
    expect(p.state).toBe("AWAITING_CREDENTIALS");
  });

  it("reports PROJECTION_MISSING when no coverage declaration reaches the panel", () => {
    const p = projectRevenueIntelligence({ uipId: "uip_1", findings: [], coverage: undefined });
    expect(p.state).toBe("PROJECTION_MISSING");
  });

  it("reports DASHBOARD_MAPPING_ERROR when the field mapping is broken", () => {
    const p = projectRevenueIntelligence({
      uipId: "uip_1",
      findings: [finding()],
      coverage: coverage({ dashboardStatus: "MAPPING_ERROR" }),
    });
    expect(p.state).toBe("DASHBOARD_MAPPING_ERROR");
  });

  it("projects capability findings when the UIP carries evidence", () => {
    const p = projectRevenueIntelligence({
      uipId: "uip_1",
      findings: [finding(), finding({ id: "leak_2", magnitude: 10_000, priority: "watch" })],
      coverage: coverage(),
    });
    expect(p.state).toBe("ACTIVE");
    expect(p.capabilityId).toBe("capability.revenue-leakage-detection");
    expect(p.data?.estimatedLeakage).toBe(260_000);
    expect(p.data?.criticalOrHigh).toBe(1);
    expect(p.data?.drivers[0].amount).toBe(250_000);
  });
});

describe("MIG-01 manifest projection", () => {
  it("reports NO_EVIDENCE when the UIP has no cargo/voyage records", () => {
    const p = projectManifestIntelligence({
      uipId: "uip_1",
      evidence: [evidence({ kind: "sanctions", fields: {} })],
      coverage: coverage({ key: "manifest" }),
    });
    expect(p.state).toBe("NO_EVIDENCE");
  });

  it("counts declared-vs-actual mismatches from the Canonical UIP", () => {
    const p = projectManifestIntelligence({
      uipId: "uip_1",
      evidence: [evidence(), evidence({ id: "ev2", kind: "voyage", fields: {} })],
      coverage: coverage({ key: "manifest" }),
    });
    expect(p.state).toBe("ACTIVE");
    const byKey = Object.fromEntries((p.data?.metrics ?? []).map((m) => [m.key, m.value]));
    expect(byKey.cargo).toBe(1);
    expect(byKey.voyages).toBe(1);
    expect(byKey.mismatch).toBe(1);
  });
});
