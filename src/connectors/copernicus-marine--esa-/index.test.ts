import { describe, expect, it, vi } from "vitest";
import { CopernicusMarineConnector } from "./index";

const VALID = {
  sourceRef: "S1A_IW_GRDH_1SDV_TEST",
  sceneId: "S1A_IW_GRDH_1SDV_TEST",
  satellite: "Sentinel-1A",
  acquisitionDate: "2026-07-20T05:45:00Z",
  coordinates: [3.375, 6.45] as [number, number],
  boundingBox: [3.3, 6.4, 3.45, 6.5] as [number, number, number, number],
  vesselDetected: true,
  vesselLength: 200,
  vesselHeading: 90,
  anchorageZone: "Apapa anchorage",
};

const MALFORMED = { sourceRef: "broken" };

describe("CopernicusMarineConnector", () => {
  const connector = new CopernicusMarineConnector();

  it("declares IMAGERY / none / daily metadata", () => {
    expect(connector.name).toBe("copernicus-marine-esa");
    expect(connector.category).toBe("IMAGERY");
    expect(connector.authMethod).toBe("none");
    expect(connector.pollingIntervalMinutes).toBe(1440);
    expect(connector.rateLimitPerMinute).toBe(60);
  });

  it("normalize() maps a scene with 0.8 CORROBORATED confidence", () => {
    const rec = connector.normalize(VALID);
    expect(rec.entityType).toBe("VESSEL");
    expect(rec.entityId).toContain(VALID.sceneId);
    expect(rec.confidence).toBe(0.8);
    expect(rec.confidenceLevel).toBe("CORROBORATED");
    expect((rec.data as { anchorageZone: string }).anchorageZone).toBe("Apapa anchorage");
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED)).not.toThrow();
    expect(connector.normalize(MALFORMED).entityId).toBe("");
  });

  it("mapToGraph() emits DETECTED_AT, DETECTED_BY, and AT_ANCHORAGE edges", () => {
    const edges = connector.mapToGraph(connector.normalize(VALID));
    const rels = edges.map((e) => e.relationship);
    expect(rels).toContain("VESSEL_DETECTED_AT");
    expect(rels).toContain("VESSEL_DETECTED_BY");
    expect(rels).toContain("VESSEL_AT_ANCHORAGE");
    const detectedBy = edges.find((e) => e.relationship === "VESSEL_DETECTED_BY");
    expect(detectedBy?.toEntityId).toBe("Copernicus SAR");
  });

  it("fetch() returns seed data when STAC search fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    try {
      const records = await connector.fetch();
      expect(records.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("healthCheck() reports healthy on 200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
    try {
      const health = await connector.healthCheck();
      expect(health.status).toBe("healthy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
