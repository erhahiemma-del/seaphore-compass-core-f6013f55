import { describe, expect, it, vi } from "vitest";
import { CacNigeriaConnector } from "./index";

const VALID = {
  sourceRef: "CAC-RC-1200341",
  rcNumber: "1200341",
  companyName: "APAPA MARITIME SERVICES LIMITED",
  status: "ACTIVE",
  type: "LIMITED LIABILITY COMPANY",
  dateOfIncorporation: "2014-08-11",
  address: "24 Wharf Road, Apapa, Lagos",
  directors: [{ name: "ADEBAYO, Kunle", role: "Director" }],
  linkedVesselImos: ["9074729"],
};

const MALFORMED = { sourceRef: "broken" };

describe("CacNigeriaConnector", () => {
  const connector = new CacNigeriaConnector();

  it("declares REGISTRY / none / daily metadata", () => {
    expect(connector.name).toBe("cac-nigeria");
    expect(connector.category).toBe("REGISTRY");
    expect(connector.authMethod).toBe("none");
    expect(connector.pollingIntervalMinutes).toBe(1440);
    expect(connector.rateLimitPerMinute).toBe(5);
  });

  it("normalize() maps a CAC entity to OWNER with 0.85 VERIFIED confidence", () => {
    const rec = connector.normalize(VALID);
    expect(rec.entityType).toBe("OWNER");
    expect(rec.entityId).toBe("1200341");
    expect(rec.confidence).toBe(0.85);
    expect(rec.confidenceLevel).toBe("VERIFIED");
    expect((rec.data as { companyName: string }).companyName).toContain("APAPA");
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED)).not.toThrow();
    expect(connector.normalize(MALFORMED).entityId).toBe("");
  });

  it("mapToGraph() emits OWNER_REGISTERED_IN, AGENT_REGISTERED_IN, VESSEL_AGENT_IS edges", () => {
    const edges = connector.mapToGraph(connector.normalize(VALID));
    const rels = edges.map((e) => e.relationship);
    expect(rels).toContain("OWNER_REGISTERED_IN");
    expect(rels).toContain("AGENT_REGISTERED_IN");
    expect(rels).toContain("VESSEL_AGENT_IS");
    const ownerNg = edges.find((e) => e.relationship === "OWNER_REGISTERED_IN");
    expect(ownerNg?.toEntityId).toBe("Nigeria");
    const vessel = edges.find((e) => e.relationship === "VESSEL_AGENT_IS");
    expect(vessel?.fromEntityId).toBe("9074729");
  });

  it("healthCheck() reports healthy on 200", async () => {
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
