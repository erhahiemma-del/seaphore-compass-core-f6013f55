import { describe, expect, it, vi } from "vitest";
import { UscgPsixConnector } from "./index";

const VALID = {
  sourceRef: "PSIX-9074729-20260112",
  imoNumber: "9074729",
  vesselName: "Bulk Trader",
  inspectionDate: "2026-01-12",
  port: "Houston, TX",
  inspectionType: "PSC Inspection",
  deficiencies: 4,
  detentionFlag: true,
  releaseDate: "2026-01-15",
  inspector: "USCG Sector Houston-Galveston",
};

const MALFORMED = { sourceRef: "broken", imoNumber: "abc" };

describe("UscgPsixConnector", () => {
  const connector = new UscgPsixConnector();

  it("declares COMPLIANCE / none / weekly metadata", () => {
    expect(connector.name).toBe("uscg-psix");
    expect(connector.category).toBe("COMPLIANCE");
    expect(connector.authMethod).toBe("none");
    expect(connector.pollingIntervalMinutes).toBe(10080);
    expect(connector.rateLimitPerMinute).toBe(5);
  });

  it("normalize() maps a PSC inspection with 0.9 VERIFIED confidence", () => {
    const rec = connector.normalize(VALID);
    expect(rec.entityType).toBe("VESSEL");
    expect(rec.entityId).toBe("9074729");
    expect(rec.confidence).toBe(0.9);
    expect(rec.confidenceLevel).toBe("VERIFIED");
    expect((rec.data as { detentionFlag: boolean }).detentionFlag).toBe(true);
  });

  it("normalize() rejects malformed IMO", () => {
    expect(() => connector.normalize(MALFORMED)).not.toThrow();
    expect(connector.normalize(MALFORMED).entityId).toBe("");
  });

  it("mapToGraph() emits INSPECTED_AT, HAS_DEFICIENCY, DETAINED_BY edges", () => {
    const edges = connector.mapToGraph(connector.normalize(VALID));
    const rels = edges.map((e) => e.relationship);
    expect(rels).toContain("VESSEL_INSPECTED_AT");
    expect(rels).toContain("VESSEL_HAS_DEFICIENCY");
    expect(rels).toContain("VESSEL_DETAINED_BY");
    expect(edges.find((e) => e.relationship === "VESSEL_DETAINED_BY")?.toEntityId).toBe("USCG");
  });

  it("mapToGraph() omits detention/deficiency edges when clean", () => {
    const clean = connector.normalize({ ...VALID, deficiencies: 0, detentionFlag: false });
    const rels = connector.mapToGraph(clean).map((e) => e.relationship);
    expect(rels).toContain("VESSEL_INSPECTED_AT");
    expect(rels).not.toContain("VESSEL_HAS_DEFICIENCY");
    expect(rels).not.toContain("VESSEL_DETAINED_BY");
  });

  it("fetch() returns seed data when network fails", async () => {
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
  }, 60000);

  it("healthCheck() reports healthy on 200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    try {
      const health = await connector.healthCheck();
      expect(health.status).toBe("healthy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
