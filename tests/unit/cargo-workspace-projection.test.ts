/**
 * SPRINT CAP-02 — Cargo Intelligence Workspace projection tests.
 *
 * Confirms the six centres are pure projections of the Canonical UIP and
 * never invent a number.
 */
import { describe, expect, it } from "vitest";
import {
  CARGO_CENTRES,
  CARGO_STATE_LABEL,
  cargoCentreBySlug,
  projectCargoCentre,
  projectCargoWorkspace,
} from "@/lib/intelligence/cargo-workspace-projection";
import type { KpiCoverage } from "@/lib/intelligence/coverage-model";
import type { NormalizedEvidence } from "@/services/ial/types";

const coverage = (over: Partial<KpiCoverage> = {}): KpiCoverage =>
  ({
    key: "manifest",
    title: "Manifest Intelligence",
    descriptor: "Manifest Records Indexed",
    display: "—",
    value: null,
    state: "ACTIVE",
    stateLabel: "Active",
    stateDetail: "Reporting live evidence",
    rootCause: "NONE",
    rootCauseDetail: "",
    evidenceCount: 1,
    coveragePct: 100,
    confidence: "observed",
    projectionContractId: "kpi.manifest-intelligence",
    projectionStatus: "MAPPED",
    dashboardField: "coverage.kpis.manifest.display",
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

const ev = (over: Partial<NormalizedEvidence> = {}): NormalizedEvidence =>
  ({
    id: "e1",
    source: "opensanctions",
    sourceName: "OpenSanctions",
    grade: "OBSERVED",
    entity: { kind: "cargo", id: "cargo:bl:BL-1", label: "BL-1" },
    kind: "cargo",
    fields: { containerNumber: "MSCU7811203", hsCode: "8517.12", declaredTonnage: 10, actualTonnage: 14 },
    observedAt: "2026-07-20T10:00:00.000Z",
    retrievedAt: "2026-07-20T10:05:00.000Z",
    freshnessSeconds: 300,
    hash: "abcdef1234567890",
    ...over,
  }) as NormalizedEvidence;

const manifestCentre = cargoCentreBySlug("manifest")!;

describe("cargo workspace projection", () => {
  it("declares six centres with unique slugs and contract bindings", () => {
    expect(CARGO_CENTRES).toHaveLength(6);
    expect(new Set(CARGO_CENTRES.map((c) => c.slug)).size).toBe(6);
    for (const c of CARGO_CENTRES) {
      expect(c.projectionContractId.startsWith("cargo.workspace.")).toBe(true);
    }
  });

  it("uses the officer state vocabulary", () => {
    expect(CARGO_STATE_LABEL.NO_PROVIDER).toBe("Awaiting Provider");
    expect(CARGO_STATE_LABEL.AWAITING_CREDENTIALS).toBe("Awaiting Credentials");
    expect(CARGO_STATE_LABEL.NO_EVIDENCE).toBe("No Evidence");
    expect(CARGO_STATE_LABEL.PROVIDER_OFFLINE).toBe("Provider Offline");
    expect(CARGO_STATE_LABEL.PROJECTION_MISSING).toBe("Projection Missing");
  });

  it("reports Projection Missing when no coverage declaration reaches the centre", () => {
    const p = projectCargoCentre({
      centre: manifestCentre,
      uipId: "uip-1",
      evidence: [ev()],
      findings: [],
      coverage: undefined,
    });
    expect(p.state).toBe("PROJECTION_MISSING");
    expect(p.data).toBeNull();
  });

  it("reports No Evidence when there is no Canonical UIP", () => {
    const p = projectCargoCentre({
      centre: manifestCentre,
      uipId: null,
      evidence: [],
      findings: [],
      coverage: coverage(),
    });
    expect(p.state).toBe("NO_EVIDENCE");
    expect(p.data).toBeNull();
  });

  it("inherits provider states from the coverage report", () => {
    for (const state of ["NO_PROVIDER", "AWAITING_CREDENTIALS", "PROVIDER_OFFLINE"] as const) {
      const p = projectCargoCentre({
        centre: manifestCentre,
        uipId: "uip-1",
        evidence: [ev()],
        findings: [],
        coverage: coverage({ state, stateDetail: "d" }),
      });
      expect(p.state).toBe(state);
      expect(p.data).toBeNull();
    }
  });

  it("projects live cargo evidence with KPIs, timeline and evidence rows", () => {
    const p = projectCargoCentre({
      centre: manifestCentre,
      uipId: "uip-1",
      evidence: [ev(), ev({ id: "e2", kind: "voyage", hash: "ffff0000ffff0000" })],
      findings: [],
      coverage: coverage(),
    });
    expect(p.state).toBe("ACTIVE");
    expect(p.data).not.toBeNull();
    expect(p.data!.kpis.find((k) => k.key === "mismatch")!.value).toBe("2");
    expect(p.data!.timeline).toHaveLength(2);
    expect(p.data!.evidence).toHaveLength(2);
    expect(p.data!.summary.some((s) => s.includes("officer decides"))).toBe(true);
    expect(p.data!.evidenceCount).toBe(2);
  });

  it("revenue centre reports only findings produced by the leakage capability", () => {
    const revenue = cargoCentreBySlug("revenue")!;
    const p = projectCargoCentre({
      centre: revenue,
      uipId: "uip-1",
      evidence: [ev()],
      findings: [],
      coverage: coverage({ key: "revenue" }),
    });
    expect(p.state).toBe("NO_EVIDENCE");
  });

  it("projects all six centres at once", () => {
    const all = projectCargoWorkspace({
      uipId: "uip-1",
      evidence: [ev()],
      findings: [],
      coverageByKey: () => coverage(),
    });
    expect(all).toHaveLength(6);
    expect(all.every((p) => typeof p.stateLabel === "string")).toBe(true);
  });
});
