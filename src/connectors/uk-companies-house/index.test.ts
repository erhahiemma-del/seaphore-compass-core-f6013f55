import { describe, expect, it, vi } from "vitest";
import { UkCompaniesHouseConnector } from "./index";

const VALID = {
  sourceRef: "CH-00041424",
  companyNumber: "00041424",
  companyName: "P&O SHIPPING LIMITED",
  companyStatus: "active",
  companyType: "ltd",
  incorporatedOn: "1896-01-01",
  registeredAddress: "79 Pall Mall, London, SW1Y 5EJ",
  officers: [{ name: "SMITH, John", role: "director" }],
  sicCodes: ["50200"],
  filingHistory: [{ date: "2025-06-30", category: "accounts", description: "Annual accounts filed" }],
  linkedVesselImos: ["9074729"],
};

const MALFORMED = { sourceRef: "broken" };

describe("UkCompaniesHouseConnector", () => {
  const connector = new UkCompaniesHouseConnector();

  it("declares REGISTRY / api_key / daily metadata", () => {
    expect(connector.name).toBe("uk-companies-house");
    expect(connector.category).toBe("REGISTRY");
    expect(connector.authMethod).toBe("api_key");
    expect(connector.pollingIntervalMinutes).toBe(1440);
    expect(connector.rateLimitPerMinute).toBe(600);
  });

  it("normalize() maps a company to OWNER with 0.9 VERIFIED confidence", () => {
    const rec = connector.normalize(VALID);
    expect(rec.entityType).toBe("OWNER");
    expect(rec.entityId).toBe("00041424");
    expect(rec.confidence).toBe(0.9);
    expect(rec.confidenceLevel).toBe("VERIFIED");
    expect((rec.data as { companyName: string }).companyName).toBe("P&O SHIPPING LIMITED");
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED)).not.toThrow();
    expect(connector.normalize(MALFORMED).entityId).toBe("");
  });

  it("mapToGraph() emits REGISTERED_IN, REGISTERED_AS, VESSEL_OWNED_BY edges", () => {
    const edges = connector.mapToGraph(connector.normalize(VALID));
    const rels = edges.map((e) => e.relationship);
    expect(rels).toContain("OWNER_REGISTERED_IN");
    expect(rels).toContain("AGENT_REGISTERED_AS");
    expect(rels).toContain("VESSEL_OWNED_BY");
    const uk = edges.find((e) => e.relationship === "OWNER_REGISTERED_IN");
    expect(uk?.toEntityId).toBe("United Kingdom");
    const vessel = edges.find((e) => e.relationship === "VESSEL_OWNED_BY");
    expect(vessel?.fromEntityId).toBe("9074729");
  });

  it("fetch() falls back to seed data when no API key is configured", async () => {
    const prev = process.env.COMPANIES_HOUSE_API_KEY;
    delete process.env.COMPANIES_HOUSE_API_KEY;
    try {
      const records = await connector.fetch();
      expect(records.length).toBeGreaterThan(0);
    } finally {
      if (prev !== undefined) process.env.COMPANIES_HOUSE_API_KEY = prev;
    }
  });

  it("healthCheck() reports healthy on 200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    try {
      const health = await connector.healthCheck();
      expect(health.status).toBe("healthy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
