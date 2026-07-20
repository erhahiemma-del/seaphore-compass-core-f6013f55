import { describe, expect, it, vi } from "vitest";
import { EquasisConnector } from "./index";

const VALID_FIXTURE = {
  sourceRef: "equasis-9412416",
  imoNumber: "9412416",
  vesselName: "MV Lagos Star",
  flagState: "Liberia",
  grossTonnage: 40542,
  vesselType: "Container Ship",
  owner: "Delta Marine Ltd",
  manager: "Delta Ship Management",
  classificationSociety: "Bureau Veritas",
  pscInspections: [
    { port: "Algeciras", authority: "Paris MoU", date: "2026-02-04", deficiencies: 9, detained: true },
  ],
  detentions: [{ port: "Algeciras", date: "2026-02-04", reason: "MARPOL Annex I deficiencies" }],
  safetyRecords: [],
};

const MALFORMED_FIXTURE = { sourceRef: "equasis-broken", garbled: true };

describe("EquasisConnector", () => {
  const connector = new EquasisConnector();

  it("declares REGISTRY / credentials / VERIFIED metadata", () => {
    expect(connector.name).toBe("equasis");
    expect(connector.category).toBe("REGISTRY");
    expect(connector.authMethod).toBe("credentials");
    expect(connector.provenance).toBe("government");
    expect(connector.pollingIntervalMinutes).toBe(1440);
    expect(connector.rateLimitPerMinute).toBe(10);
  });

  it("normalize() maps a valid record with 0.9 VERIFIED confidence", () => {
    const record = connector.normalize(VALID_FIXTURE);
    expect(record.entityType).toBe("VESSEL");
    expect(record.entityId).toBe("9412416");
    expect(record.confidence).toBe(0.9);
    expect(record.confidenceLevel).toBe("VERIFIED");
    const data = record.data as { owner: string; detentions: unknown[] };
    expect(data.owner).toBe("Delta Marine Ltd");
    expect(data.detentions.length).toBe(1);
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED_FIXTURE)).not.toThrow();
    expect(connector.normalize(MALFORMED_FIXTURE).entityId).toBe("");
  });

  it("mapToGraph() emits OWNED_BY, MANAGED_BY, and PSC_DETENTION edges", () => {
    const record = connector.normalize(VALID_FIXTURE);
    const edges = connector.mapToGraph(record);
    expect(edges.find((e) => e.relationship === "VESSEL_OWNED_BY")?.toEntityId).toBe("Delta Marine Ltd");
    expect(edges.find((e) => e.relationship === "VESSEL_MANAGED_BY")?.toEntityId).toBe("Delta Ship Management");
    expect(edges.find((e) => e.relationship === "VESSEL_UNDER_PSC_DETENTION")).toBeDefined();
  });

  it("fetch() returns seed data when credentials are absent", async () => {
    const originalEmail = process.env.EQUASIS_EMAIL;
    const originalPass = process.env.EQUASIS_PASSWORD;
    delete process.env.EQUASIS_EMAIL;
    delete process.env.EQUASIS_PASSWORD;
    try {
      const records = await connector.fetch();
      expect(records.length).toBeGreaterThan(0);
    } finally {
      if (originalEmail) process.env.EQUASIS_EMAIL = originalEmail;
      if (originalPass) process.env.EQUASIS_PASSWORD = originalPass;
    }
  });

  it("healthCheck() reports healthy when Equasis returns 200", async () => {
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
