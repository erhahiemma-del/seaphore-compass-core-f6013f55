import { describe, expect, it, vi } from "vitest";
import { PiClubPublicationsConnector } from "./index";

const VALID = {
  sourceRef: "GARD-2026-022",
  circularId: "GARD-2026-022",
  club: "Gard",
  title: "Vessel caution: MV NORTHERN STAR piracy incident off Bonny",
  publicationDate: "2026-06-02",
  summary:
    "Gard advises members that MV NORTHERN STAR was subject to an attempted boarding near Port Harcourt.",
  url: "https://www.gard.no/web/publications/circulars/gard-2026-022",
  affectedVessels: ["NORTHERN STAR"],
  affectedPorts: ["Port Harcourt"],
};

const MALFORMED = { sourceRef: "broken" };

describe("PiClubPublicationsConnector", () => {
  const connector = new PiClubPublicationsConnector();

  it("declares COMPLIANCE / none / daily metadata", () => {
    expect(connector.name).toBe("p-i-club-publications");
    expect(connector.category).toBe("COMPLIANCE");
    expect(connector.authMethod).toBe("none");
    expect(connector.pollingIntervalMinutes).toBe(1440);
    expect(connector.rateLimitPerMinute).toBe(10);
  });

  it("normalize() maps a circular to ALERT with 0.7 INFERRED confidence", () => {
    const rec = connector.normalize(VALID);
    expect(rec.entityType).toBe("ALERT");
    expect(rec.confidence).toBe(0.7);
    expect(rec.confidenceLevel).toBe("INFERRED");
    const data = rec.data as { alertType: string; affectedVessels: string[] };
    expect(data.alertType).toBe("VESSEL_CAUTION");
    expect(data.affectedVessels).toContain("NORTHERN STAR");
  });

  it("normalize() never throws on malformed input", () => {
    expect(() => connector.normalize(MALFORMED)).not.toThrow();
    expect(connector.normalize(MALFORMED).entityId).toBeDefined();
  });

  it("mapToGraph() emits ALERT_ISSUED_BY + ALERT_AFFECTS (vessel & port) edges", () => {
    const edges = connector.mapToGraph(connector.normalize(VALID));
    const rels = edges.map((e) => e.relationship);
    expect(rels).toContain("ALERT_ISSUED_BY");
    expect(rels).toContain("ALERT_AFFECTS");
    const issuedBy = edges.find((e) => e.relationship === "ALERT_ISSUED_BY");
    expect(issuedBy?.toEntityId).toBe("Gard");
    const vesselEdge = edges.find(
      (e) => e.relationship === "ALERT_AFFECTS" && e.toEntityType === "VESSEL",
    );
    expect(vesselEdge?.toEntityId).toBe("NORTHERN STAR");
    const portEdge = edges.find(
      (e) => e.relationship === "ALERT_AFFECTS" && e.toEntityType === "PORT",
    );
    expect(portEdge?.toEntityId).toBe("Port Harcourt");
  });

  it("fetch() falls back to seed data when the endpoint is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    try {
      const raw = await connector.fetch();
      expect(raw.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

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
