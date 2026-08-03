/**
 * SPRINT GOV-01 — Intelligence Capability Catalog tests.
 *
 * Verifies catalog integrity: all required fields present, no orphan
 * dependencies, status/maturity consistency, provider IDs in catalog.ts.
 */
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_CATALOG,
  DEPENDENCY_MATRIX,
  catalogSummary,
  getCapability,
  capabilitiesByStatus,
  capabilitiesByDomain,
} from "@/lib/intelligence/capability-catalog";
import { buildEvidenceProviderCatalog } from "@/connectors/catalog";

describe("GOV-01 · Capability Catalog — integrity", () => {
  it("contains exactly 8 capabilities", () => {
    expect(CAPABILITY_CATALOG).toHaveLength(8);
  });

  it("every capability has a unique id", () => {
    const ids = CAPABILITY_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every capability id follows the cap.* convention", () => {
    for (const cap of CAPABILITY_CATALOG) {
      expect(cap.id).toMatch(/^cap\.[a-z-]+$/);
    }
  });

  it("every capability has required string fields", () => {
    for (const cap of CAPABILITY_CATALOG) {
      expect(cap.name.length).toBeGreaterThan(0);
      expect(cap.purpose.length).toBeGreaterThan(10);
      expect(cap.owner.length).toBeGreaterThan(0);
      expect(cap.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every capability has a valid status", () => {
    const valid = new Set(["OPERATIONAL", "DESIGNING", "PLANNED"]);
    for (const cap of CAPABILITY_CATALOG) {
      expect(valid.has(cap.status)).toBe(true);
    }
  });

  it("every capability has maturity 1–5", () => {
    for (const cap of CAPABILITY_CATALOG) {
      expect(cap.maturity).toBeGreaterThanOrEqual(1);
      expect(cap.maturity).toBeLessThanOrEqual(5);
    }
  });

  it("OPERATIONAL capabilities have maturity >= 3", () => {
    for (const cap of CAPABILITY_CATALOG) {
      if (cap.status === "OPERATIONAL") {
        expect(cap.maturity).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("every capability has at least one KPI", () => {
    for (const cap of CAPABILITY_CATALOG) {
      expect(cap.kpis.length).toBeGreaterThan(0);
    }
  });

  it("every capability has at least one dashboard surface", () => {
    for (const cap of CAPABILITY_CATALOG) {
      expect(cap.dashboardSurfaces.length).toBeGreaterThan(0);
    }
  });

  it("every capability has at least one UIP projection", () => {
    for (const cap of CAPABILITY_CATALOG) {
      expect(cap.uipProjections.length).toBeGreaterThan(0);
    }
  });

  it("covers all 8 mandated domains", () => {
    const domains = new Set(CAPABILITY_CATALOG.map((c) => c.domain));
    for (const d of [
      "vessel",
      "cargo",
      "revenue",
      "risk",
      "compliance",
      "port",
      "environmental",
      "operational",
    ]) {
      expect(domains.has(d as any)).toBe(true);
    }
  });
});

describe("GOV-01 · Dependency matrix — consistency", () => {
  it("dependency matrix has no self-references", () => {
    for (const edge of DEPENDENCY_MATRIX) {
      expect(edge.from).not.toBe(edge.to);
    }
  });

  it("all dependency targets exist in the catalog", () => {
    const ids = new Set(CAPABILITY_CATALOG.map((c) => c.id));
    for (const edge of DEPENDENCY_MATRIX) {
      expect(ids.has(edge.from), `${edge.from} not in catalog`).toBe(true);
      expect(ids.has(edge.to), `${edge.to} not in catalog`).toBe(true);
    }
  });

  it("operational-intelligence depends on the most capabilities", () => {
    const opInt = CAPABILITY_CATALOG.find((c) => c.id === "cap.operational-intelligence")!;
    const maxDeps = Math.max(...CAPABILITY_CATALOG.map((c) => c.dependencies.length));
    expect(opInt.dependencies.length).toBe(maxDeps);
  });

  it("environmental and vessel intelligence have no dependencies (foundational)", () => {
    const env = CAPABILITY_CATALOG.find((c) => c.id === "cap.environmental-intelligence")!;
    const vessel = CAPABILITY_CATALOG.find((c) => c.id === "cap.vessel-intelligence")!;
    expect(env.dependencies).toHaveLength(0);
    expect(vessel.dependencies).toHaveLength(0);
  });
});

describe("GOV-01 · Provider references — grounded in catalog.ts", () => {
  it("every evidence provider id referenced in the capability catalog exists in the evidence provider catalog", () => {
    const providerCatalog = buildEvidenceProviderCatalog();
    const catalogIds = new Set(providerCatalog.map((r) => r.providerId));

    const referencedIds = new Set(
      CAPABILITY_CATALOG.flatMap((c) => c.evidenceProviders.map((p) => p.id)),
    );

    for (const id of referencedIds) {
      expect(
        catalogIds.has(id),
        `Provider '${id}' referenced in capability catalog but not in evidence provider catalog`,
      ).toBe(true);
    }
  });
});

describe("GOV-01 · Accessor functions", () => {
  it("getCapability() returns the correct entry by id", () => {
    const cap = getCapability("cap.vessel-intelligence");
    expect(cap?.name).toBe("Vessel Intelligence");
  });

  it("getCapability() returns undefined for unknown id", () => {
    expect(getCapability("cap.unknown")).toBeUndefined();
  });

  it("capabilitiesByStatus() returns only matching entries", () => {
    const operational = capabilitiesByStatus("OPERATIONAL");
    for (const c of operational) {
      expect(c.status).toBe("OPERATIONAL");
    }
  });

  it("capabilitiesByDomain() returns only matching entries", () => {
    const cargo = capabilitiesByDomain("cargo");
    for (const c of cargo) {
      expect(c.domain).toBe("cargo");
    }
  });

  it("catalogSummary() totals match actual data", () => {
    const summary = catalogSummary();
    expect(summary.total).toBe(CAPABILITY_CATALOG.length);
    expect(summary.operational).toBe(
      CAPABILITY_CATALOG.filter((c) => c.status === "OPERATIONAL").length,
    );
    expect(summary.designing).toBe(
      CAPABILITY_CATALOG.filter((c) => c.status === "DESIGNING").length,
    );
    expect(summary.planned).toBe(CAPABILITY_CATALOG.filter((c) => c.status === "PLANNED").length);
    expect(summary.avgMaturity).toBeGreaterThan(0);
    expect(summary.avgMaturity).toBeLessThanOrEqual(5);
  });
});
