import { describe, expect, it, vi } from "vitest";
import { TemplateConnector } from "./index";

/**
 * Template connector tests — copy alongside your connector and adapt
 * the fixtures. Every connector must cover these four cases so the
 * engine's ingestion contract stays honest.
 */

const VALID_FIXTURE = {
  sourceRef: "template-9700001",
  id: "9700001",
  imo: "9700001",
  name: "MV Fixture",
  flag: "NG",
  owner: { name: "Fixture Holdings" },
  lastPort: "NGAPP",
};

const MALFORMED_FIXTURE = {
  sourceRef: "template-broken",
  // no imo, no id → normalize should return an empty (invalid) record
  garbled: true,
};

describe("TemplateConnector", () => {
  const connector = new TemplateConnector();

  it("normalize() maps a valid raw fixture to a SeaphoreRecord", () => {
    const record = connector.normalize(VALID_FIXTURE);
    expect(record).not.toBeNull();
    expect(record.sourceId).toBe(connector.name);
    expect(record.sourceRef).toBe("template-9700001");
    expect(record.entityType).toBe("VESSEL");
    expect(record.entityId).toBe("9700001");
    expect(record.rawData).toEqual(VALID_FIXTURE);
    expect(record.confidence).toBeGreaterThan(0);
    expect(record.confidence).toBeLessThanOrEqual(1);
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED_FIXTURE)).not.toThrow();
    const record = connector.normalize(MALFORMED_FIXTURE);
    // Contract: malformed input yields an invalid record (empty entityId)
    // rather than a throw — the pipeline dead-letters it.
    expect(record.entityId).toBe("");
  });

  it("healthCheck() returns a HealthStatus object", async () => {
    // Stub global fetch so the test does not hit the network.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    // Env var required by buildHeaders (auth is api_key by default).
    process.env.TEMPLATE_SOURCE_API_KEY = "test";

    try {
      const health = await connector.healthCheck();
      expect(health).toHaveProperty("status");
      expect(["healthy", "degraded", "down"]).toContain(health.status);
      expect(health).toHaveProperty("latencyMs");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.TEMPLATE_SOURCE_API_KEY;
    }
  });

  it("mapToGraph() returns at least one edge for a valid record", () => {
    const record = connector.normalize(VALID_FIXTURE);
    const edges = connector.mapToGraph(record);
    expect(edges.length).toBeGreaterThan(0);
    const owner = edges.find((e) => e.relationship === "VESSEL_OWNED_BY");
    expect(owner).toBeDefined();
    expect(owner?.fromEntityId).toBe("9700001");
    expect(owner?.toEntityId).toBe("Fixture Holdings");
  });
});
