import { describe, expect, it, vi } from "vitest";
import { ImoGisisConnector } from "./index";

const VALID_FIXTURE = {
  sourceRef: "gisis-9074729",
  imoNumber: "9074729",
  vesselName: "MV Ore Nigeria",
  vesselType: "Bulk Carrier",
  grossTonnage: 92752,
  flagState: "Nigeria",
  registrationDate: "1994-03-12",
  classificationSociety: "Lloyd's Register",
  callSign: "5NBQ",
  officialNumber: "NG-0074729",
};

const MALFORMED_FIXTURE = {
  sourceRef: "gisis-broken",
  garbled: true,
};

describe("ImoGisisConnector", () => {
  const connector = new ImoGisisConnector();

  it("declares REGISTRY / government / VERIFIED metadata", () => {
    expect(connector.name).toBe("imo-gisis");
    expect(connector.category).toBe("REGISTRY");
    expect(connector.authMethod).toBe("none");
    expect(connector.provenance).toBe("government");
    expect(connector.pollingIntervalMinutes).toBe(1440);
    expect(connector.rateLimitPerMinute).toBe(10);
  });

  it("normalize() maps a valid record with 0.95 VERIFIED confidence", () => {
    const record = connector.normalize(VALID_FIXTURE);
    expect(record.entityType).toBe("VESSEL");
    expect(record.entityId).toBe("9074729");
    expect(record.confidence).toBe(0.95);
    expect(record.confidenceLevel).toBe("VERIFIED");
    const data = record.data as { imoNumber: string; classificationSociety: string };
    expect(data.imoNumber).toBe("9074729");
    expect(data.classificationSociety).toBe("Lloyd's Register");
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED_FIXTURE)).not.toThrow();
    expect(connector.normalize(MALFORMED_FIXTURE).entityId).toBe("");
  });

  it("mapToGraph() emits FLAGGED_IN and CLASSIFIED_BY edges", () => {
    const record = connector.normalize(VALID_FIXTURE);
    const edges = connector.mapToGraph(record);
    const flag = edges.find((e) => e.relationship === "VESSEL_FLAGGED_IN");
    const cls = edges.find((e) => e.relationship === "VESSEL_CLASSIFIED_BY");
    expect(flag?.toEntityId).toBe("Nigeria");
    expect(cls?.toEntityId).toBe("Lloyd's Register");
  });

  it("healthCheck() reports healthy when the GISIS page returns 200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response("ok", { status: 200 }),
    ) as unknown as typeof fetch;
    try {
      const health = await connector.healthCheck();
      expect(health.status).toBe("healthy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
