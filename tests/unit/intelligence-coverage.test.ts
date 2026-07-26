import { describe, it, expect } from "vitest";
import {
  buildIntelligenceCoverage,
  classifyProviderStatus,
  DASHBOARD_KPI_FIELDS,
  KPI_DECLARATIONS,
  type CoverageCatalogRow,
  type CoverageHealthRow,
  type CoverageInput,
  type DomainEvidence,
  type KpiDomainKey,
} from "@/lib/intelligence/coverage-model";
import { PROJECTION_CONTRACT } from "@/lib/projection-contract/registry";

const catalog: CoverageCatalogRow[] = [
  {
    providerId: "opensanctions",
    providerName: "OpenSanctions",
    capabilities: ["SANCTIONS", "VESSEL_SCREENING"],
    credentialEnv: [],
    certification: "CERTIFIED",
    lastValidationDate: "2026-07-26",
    projectionContractId: "ial.opensanctions-evidence-provider",
  },
  {
    providerId: "equasis",
    providerName: "Equasis",
    capabilities: ["IDENTITY", "VESSEL_SCREENING"],
    credentialEnv: ["EQUASIS_USERNAME"],
    certification: "CERTIFIED",
    lastValidationDate: "2026-07-26",
    projectionContractId: "ial.equasis-evidence-provider",
  },
  {
    providerId: "global-fishing-watch",
    providerName: "Global Fishing Watch",
    capabilities: ["POSITION", "PORT_CALL"],
    credentialEnv: ["GFW_API_TOKEN"],
    certification: "CERTIFIED",
    lastValidationDate: "2026-07-26",
    projectionContractId: "ial.global-fishing-watch-evidence-provider",
  },
];

const health: CoverageHealthRow[] = [
  {
    id: "opensanctions",
    state: "healthy",
    checkedAt: "2026-07-26T10:00:00.000Z",
    lastSuccessAt: "2026-07-26T09:59:00.000Z",
    lastError: null,
    quotaRemaining: null,
    failureRate: 0,
  },
];

const emptyEvidence: Record<KpiDomainKey, DomainEvidence> = {
  manifest: { evidenceCount: 0, value: null, uipPopulated: false },
  vessel: { evidenceCount: 0, value: null, uipPopulated: false },
  container: { evidenceCount: 0, value: null, uipPopulated: false },
  revenue: { evidenceCount: 0, value: null, uipPopulated: false },
  risk: { evidenceCount: 0, value: null, uipPopulated: false },
  historical: { evidenceCount: 0, value: null, uipPopulated: false },
};

function input(overrides: Partial<CoverageInput> = {}): CoverageInput {
  return {
    generatedAt: "2026-07-26T10:00:00.000Z",
    catalog,
    health,
    credentials: { opensanctions: true, equasis: false, "global-fishing-watch": false },
    evidence: emptyEvidence,
    mappedProjectionIds: PROJECTION_CONTRACT.map((e) => e.id),
    mappedDashboardFields: DASHBOARD_KPI_FIELDS,
    ...overrides,
  };
}

describe("DIAG-02 · Intelligence Coverage model", () => {
  it("never renders a bare 0 or — for a structural gap", () => {
    const report = buildIntelligenceCoverage(input());
    for (const kpi of report.kpis) {
      expect(kpi.display).not.toBe("—");
      expect(kpi.display).not.toBe("0");
      expect(kpi.stateDetail.length).toBeGreaterThan(0);
    }
  });

  it("classifies a KPI with no capable provider as PROVIDER_MISSING", () => {
    const manifest = buildIntelligenceCoverage(input()).kpis.find((k) => k.key === "manifest")!;
    expect(manifest.state).toBe("NO_PROVIDER");
    expect(manifest.rootCause).toBe("PROVIDER_MISSING");
    expect(manifest.providers).toHaveLength(0);
  });

  it("classifies credential-less providers as awaiting credentials", () => {
    const historical = buildIntelligenceCoverage(input()).kpis.find(
      (k) => k.key === "historical",
    )!;
    expect(historical.state).toBe("AWAITING_CREDENTIALS");
    expect(historical.rootCause).toBe("CREDENTIALS_MISSING");
    expect(historical.display).toBe("Waiting for Credentials");
  });

  it("reports NO_EVIDENCE when a healthy provider has returned nothing", () => {
    const risk = buildIntelligenceCoverage(input()).kpis.find((k) => k.key === "risk")!;
    expect(risk.state).toBe("NO_EVIDENCE");
    expect(risk.rootCause).toBe("EMPTY_EVIDENCE");
    expect(risk.checks.providerHealthy).toBe(true);
  });

  it("reports ACTIVE with a genuine value once evidence reaches the UIP", () => {
    const report = buildIntelligenceCoverage(
      input({
        evidence: {
          ...emptyEvidence,
          risk: { evidenceCount: 12, value: 62.5, uipPopulated: true, confidence: "inferred" },
        },
      }),
    );
    const risk = report.kpis.find((k) => k.key === "risk")!;
    expect(risk.state).toBe("ACTIVE");
    expect(risk.display).toBe("62.5%");
    expect(risk.rootCause).toBe("NONE");
    expect(risk.coveragePct).toBe(100);
  });

  it("detects a missing projection contract entry", () => {
    const report = buildIntelligenceCoverage(
      input({
        mappedProjectionIds: [],
        evidence: {
          ...emptyEvidence,
          risk: { evidenceCount: 3, value: 40, uipPopulated: true },
        },
      }),
    );
    const risk = report.kpis.find((k) => k.key === "risk")!;
    expect(risk.state).toBe("PROJECTION_MISSING");
    expect(risk.projectionStatus).toBe("MISSING");
  });

  it("detects a dashboard mapping error", () => {
    const report = buildIntelligenceCoverage(
      input({
        mappedDashboardFields: [],
        evidence: {
          ...emptyEvidence,
          risk: { evidenceCount: 3, value: 40, uipPopulated: true },
        },
      }),
    );
    const risk = report.kpis.find((k) => k.key === "risk")!;
    expect(risk.state).toBe("DASHBOARD_MAPPING_ERROR");
    expect(risk.dashboardStatus).toBe("MAPPING_ERROR");
  });

  it("flags rate limiting from quota exhaustion", () => {
    const status = classifyProviderStatus(
      catalog[0],
      { ...health[0], quotaRemaining: 0 },
      true,
    );
    expect(status).toBe("RATE_LIMITED");
  });

  it("flags provider offline / API failure", () => {
    const report = buildIntelligenceCoverage(
      input({
        health: [{ ...health[0], state: "offline", lastError: "connect ETIMEDOUT" }],
      }),
    );
    const risk = report.kpis.find((k) => k.key === "risk")!;
    expect(risk.state).toBe("PROVIDER_OFFLINE");
    expect(risk.rootCause).toBe("API_FAILURE");
  });

  it("computes platform readiness from provider statuses", () => {
    const { readiness } = buildIntelligenceCoverage(input());
    expect(readiness.operational).toEqual(["OpenSanctions"]);
    expect(readiness.awaitingConfiguration).toEqual(["Equasis", "Global Fishing Watch"]);
    expect(readiness.totalProviders).toBe(3);
    expect(readiness.overallPct).toBe(33);
    expect(readiness.totalKpis).toBe(KPI_DECLARATIONS.length);
  });

  it("registers every KPI surface in the Projection Contract", () => {
    const ids = new Set(PROJECTION_CONTRACT.map((e) => e.id));
    for (const decl of KPI_DECLARATIONS) {
      expect(ids.has(decl.projectionContractId), decl.projectionContractId).toBe(true);
    }
    expect(ids.has("diag.intelligence-readiness")).toBe(true);
    expect(ids.has("diag.kpi-root-cause")).toBe(true);
  });
});
