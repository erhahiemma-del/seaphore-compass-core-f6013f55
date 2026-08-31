/**
 * Coverage honesty.
 *
 * The bug these tests exist for: the world view rendered "0 vessels"
 * while the only connected provider answers Nigerian circles. That is not
 * an empty ocean, it is a provider that was never asked — and the two must
 * never resolve to the same reading again.
 */
import { describe, expect, it } from "vitest";

import {
  GLOBAL_COVERAGE_UNAVAILABLE,
  declaresGeographicCoverage,
  resolveVesselCoverage,
  scopeSupport,
  type VesselCoverageInput,
} from "@/services/geospatial/vessel-coverage";
import { DatalasticVesselSource } from "@/services/geospatial/sources/datalastic-vessel-source";
import { SimulatedVesselSource } from "@/services/geospatial/sources/simulated-vessel-source";
import { EmptyVesselSource } from "@/services/geospatial/vessel-source";

function input(overrides: Partial<VesselCoverageInput> = {}): VesselCoverageInput {
  return {
    loading: false,
    error: null,
    sourceId: "datalastic",
    lastAppliedAt: "2026-01-01T00:00:00.000Z",
    recordCount: 0,
    scope: "regional",
    support: "SUPPORTED",
    ...overrides,
  };
}

describe("global unavailable is not zero", () => {
  it("calls an unsupported global scope UNAVAILABLE, not EMPTY", () => {
    const result = resolveVesselCoverage(input({ scope: "global", support: "UNSUPPORTED" }));
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.state).not.toBe("EMPTY");
  });

  it("uses the mandated wording for a global gap", () => {
    const result = resolveVesselCoverage(input({ scope: "global", support: "UNSUPPORTED" }));
    expect(result.reason).toContain(GLOBAL_COVERAGE_UNAVAILABLE);
  });

  it("refuses to let a zero count be presented as meaningful", () => {
    const result = resolveVesselCoverage(input({ scope: "global", support: "UNSUPPORTED" }));
    expect(result.countIsMeaningful).toBe(false);
    expect(result.scopeUnsupported).toBe(true);
  });

  it("never describes an unqueried scope as an absence of vessels", () => {
    const result = resolveVesselCoverage(input({ scope: "global", support: "UNSUPPORTED" }));
    expect(result.reason.toLowerCase()).toContain("not a statement that no vessels");
  });

  it("treats an undeclared extent conservatively rather than as an empty sea", () => {
    const result = resolveVesselCoverage(input({ support: "UNDECLARED" }));
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.countIsMeaningful).toBe(false);
  });
});

describe("a covered, genuinely empty view stays honest in the other direction", () => {
  it("reports EMPTY as an observation when the scope is supported", () => {
    const result = resolveVesselCoverage(input());
    expect(result.state).toBe("EMPTY");
    expect(result.countIsMeaningful).toBe(true);
    expect(result.reason).toContain("observation, not a collection gap");
  });
});

describe("source, loading and error states are distinguished", () => {
  it("separates a missing source from an empty result", () => {
    expect(resolveVesselCoverage(input({ sourceId: null })).state).toBe("UNAVAILABLE");
  });

  it("reports LOADING only before the first response", () => {
    expect(resolveVesselCoverage(input({ loading: true, lastAppliedAt: null })).state).toBe(
      "LOADING",
    );
    expect(resolveVesselCoverage(input({ loading: true })).state).not.toBe("LOADING");
  });

  it("reports ERROR as a collection gap", () => {
    const result = resolveVesselCoverage(input({ error: "Feed rejected the request." }));
    expect(result.state).toBe("ERROR");
    expect(result.countIsMeaningful).toBe(false);
  });
});

describe("live vs historical vs partial are visibly different", () => {
  it("marks a live populated supported view AVAILABLE/LIVE", () => {
    const result = resolveVesselCoverage(input({ recordCount: 12 }));
    expect(result.state).toBe("AVAILABLE");
    expect(result.mode).toBe("LIVE");
    expect(result.countIsMeaningful).toBe(true);
  });

  it("marks replayed observations HISTORICAL and not a current total", () => {
    const result = resolveVesselCoverage(input({ recordCount: 12, historical: true }));
    expect(result.mode).toBe("HISTORICAL");
    expect(result.label).toBe("HISTORICAL");
    expect(result.countIsMeaningful).toBe(false);
  });

  it("refuses to present a partial-extent count as a total for the view", () => {
    const result = resolveVesselCoverage(
      input({
        recordCount: 40,
        scope: "global",
        support: "UNSUPPORTED",
        extentLabel: "Nigerian zones",
      }),
    );
    expect(result.state).toBe("AVAILABLE");
    expect(result.countIsMeaningful).toBe(false);
    expect(result.reason).toContain("not a total");
  });
});

describe("the provider abstraction carries the coverage claim", () => {
  it("lets Datalastic declare regional-only coverage", () => {
    const source = new DatalasticVesselSource();
    expect(declaresGeographicCoverage(source)).toBe(true);
    expect(scopeSupport(source, "regional")).toBe("SUPPORTED");
    expect(scopeSupport(source, "global")).toBe("UNSUPPORTED");
  });

  it("does not let simulated traffic claim the world", () => {
    expect(scopeSupport(new SimulatedVesselSource(), "global")).toBe("UNSUPPORTED");
  });

  it("treats a source that declares nothing as undeclared, not global", () => {
    const source = new EmptyVesselSource();
    expect(declaresGeographicCoverage(source)).toBe(false);
    expect(scopeSupport(source, "global")).toBe("UNDECLARED");
    expect(scopeSupport(null, "global")).toBe("UNDECLARED");
  });

  it("keeps the seam open for a future global source", () => {
    const future = {
      ...new EmptyVesselSource(),
      geographicCoverage: () => ({
        sourceId: "future-global-ais",
        scopes: ["regional", "global"] as const,
        extentLabel: "worldwide",
        note: "satellite AIS",
      }),
    } as unknown as Parameters<typeof scopeSupport>[0];
    expect(scopeSupport(future, "global")).toBe("SUPPORTED");
    expect(
      resolveVesselCoverage(
        input({ sourceId: "future-global-ais", scope: "global", support: "SUPPORTED" }),
      ).state,
    ).toBe("EMPTY");
  });
});
