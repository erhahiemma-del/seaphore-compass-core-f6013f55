import { describe, expect, it, vi } from "vitest";
import { UnEuSanctionsConnector } from "./index";

const VALID_FIXTURE = {
  sourceRef: "un-KPe.077",
  referenceNumber: "KPe.077",
  listType: "UN" as const,
  entityName: "MV WISE HONEST",
  entityType: "Vessel",
  aliases: [],
  listDate: "2018-06-05",
  remarks: "DPRK coal export.",
  vesselIMO: "8905530",
};

const EU_FIXTURE = {
  sourceRef: "eu-EU.1234.56",
  referenceNumber: "EU.1234.56",
  listType: "EU" as const,
  entityName: "SOVCOMFLOT PJSC",
  entityType: "Entity",
  aliases: [],
  listDate: "2022-04-08",
  remarks: "EU 269/2014.",
  vesselIMO: null,
};

const MALFORMED = { sourceRef: "un-broken", garbled: true };

describe("UnEuSanctionsConnector", () => {
  const connector = new UnEuSanctionsConnector();

  it("declares SANCTIONS / none / AUDITED metadata", () => {
    expect(connector.name).toBe("un-eu-sanctions");
    expect(connector.category).toBe("SANCTIONS");
    expect(connector.authMethod).toBe("none");
    expect(connector.pollingIntervalMinutes).toBe(10080);
    expect(connector.rateLimitPerMinute).toBe(2);
  });

  it("normalize() maps a UN vessel record with 0.99 AUDITED confidence", () => {
    const record = connector.normalize(VALID_FIXTURE);
    expect(record.entityType).toBe("SANCTION");
    expect(record.entityId).toBe("KPe.077");
    expect(record.confidence).toBe(0.99);
    expect(record.confidenceLevel).toBe("AUDITED");
    expect((record.data as { vesselIMO: string }).vesselIMO).toBe("8905530");
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED)).not.toThrow();
    expect(connector.normalize(MALFORMED).entityId).toBe("");
  });

  it("mapToGraph() emits vessel APPLIES_TO + UN ISSUED_BY for UN vessel entries", () => {
    const edges = connector.mapToGraph(connector.normalize(VALID_FIXTURE));
    const applies = edges.find((e) => e.relationship === "SANCTION_APPLIES_TO");
    const issuer = edges.find((e) => e.relationship === "SANCTION_ISSUED_BY");
    expect(applies?.toEntityType).toBe("VESSEL");
    expect(applies?.toEntityId).toBe("8905530");
    expect(issuer?.toEntityId).toBe("UN Security Council");
  });

  it("mapToGraph() emits EU issuer for EU entries", () => {
    const edges = connector.mapToGraph(connector.normalize(EU_FIXTURE));
    const issuer = edges.find((e) => e.relationship === "SANCTION_ISSUED_BY");
    expect(issuer?.toEntityId).toBe("EU EEAS");
  });

  it("fetch() returns seed data when both downloads fail", async () => {
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
