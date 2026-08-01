import { describe, expect, it, vi } from "vitest";
import { OfacSanctionsConnector } from "./index";

const VALID_FIXTURE = {
  sourceRef: "ofac-31820",
  uid: "31820",
  name: "GRACE 1",
  sdnType: "Vessel",
  programs: ["IRAN"],
  aliases: ["ADRIAN DARYA 1"],
  addresses: [],
  imoNumbers: ["9116412"],
  vesselFlags: ["Panama"],
  callSigns: ["3FEC8"],
  listDate: "2019-08-30",
  remarks: "VLCC linked to IRGC-QF.",
};

const MALFORMED_FIXTURE = { sourceRef: "ofac-broken", garbled: true };

describe("OfacSanctionsConnector", () => {
  const connector = new OfacSanctionsConnector();

  it("declares SANCTIONS / none / AUDITED metadata", () => {
    expect(connector.name).toBe("ofac-sanctions");
    expect(connector.category).toBe("SANCTIONS");
    expect(connector.authMethod).toBe("none");
    expect(connector.pollingIntervalMinutes).toBe(1440);
    expect(connector.rateLimitPerMinute).toBe(5);
  });

  it("normalize() maps a valid record with 0.99 AUDITED confidence", () => {
    const record = connector.normalize(VALID_FIXTURE);
    expect(record.entityType).toBe("SANCTION");
    expect(record.entityId).toBe("31820");
    expect(record.confidence).toBe(0.99);
    expect(record.confidenceLevel).toBe("AUDITED");
    const data = record.data as { imoNumbers: string[]; programs: string[] };
    expect(data.imoNumbers).toContain("9116412");
    expect(data.programs).toContain("IRAN");
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED_FIXTURE)).not.toThrow();
    expect(connector.normalize(MALFORMED_FIXTURE).entityId).toBe("");
  });

  it("mapToGraph() emits APPLIES_TO (vessel + entity) and ISSUED_BY edges", () => {
    const record = connector.normalize(VALID_FIXTURE);
    const edges = connector.mapToGraph(record);
    const vesselEdge = edges.find(
      (e) => e.relationship === "SANCTION_APPLIES_TO" && e.toEntityType === "VESSEL",
    );
    const entityEdge = edges.find(
      (e) => e.relationship === "SANCTION_APPLIES_TO" && e.toEntityType === "OWNER",
    );
    const issuer = edges.find((e) => e.relationship === "SANCTION_ISSUED_BY");
    expect(vesselEdge?.toEntityId).toBe("9116412");
    expect(entityEdge?.toEntityId).toBe("GRACE 1");
    expect(issuer?.toEntityId).toBe("OFAC");
  });

  it("fetch() returns seed data when the OFAC download fails", async () => {
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
      async () => new Response("", { status: 200 }),
    ) as unknown as typeof fetch;
    try {
      const health = await connector.healthCheck();
      expect(health.status).toBe("healthy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
