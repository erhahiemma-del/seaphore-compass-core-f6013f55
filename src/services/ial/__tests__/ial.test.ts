import { describe, expect, it } from "vitest";

import {
  ConnectorManager,
  SimulatedAisConnector,
  SimulatedEquasisConnector,
  SimulatedImoConnector,
  SimulatedMarineTrafficConnector,
  SimulatedOpenSanctionsConnector,
  acquireEvidence,
  canonicalEntityId,
  normalizeRecord,
  resolveEntities,
  validateRecords,
} from "../";
import type { AcquisitionQuery } from "../types";

const VESSEL_QUERY: AcquisitionQuery = {
  entity: { kind: "vessel", id: canonicalEntityId("vessel", "9438291"), label: "MV Ocean Pearl" },
  kinds: ["identity", "position", "ownership", "sanctions", "port-call"],
};

function build(opts: { withFailing?: boolean } = {}): ConnectorManager {
  const mgr = new ConnectorManager();
  mgr.register(new SimulatedAisConnector(opts.withFailing ? { failing: true } : {}));
  mgr.register(new SimulatedEquasisConnector());
  mgr.register(new SimulatedImoConnector());
  mgr.register(new SimulatedMarineTrafficConnector());
  mgr.register(new SimulatedOpenSanctionsConnector());
  return mgr;
}

describe("IAL: normalization", () => {
  it("produces canonical vessel ids from raw IMO", () => {
    expect(canonicalEntityId("vessel", "IMO 9438291")).toBe("vessel:imo:9438291");
    expect(canonicalEntityId("port", "NGLOS")).toBe("port:unlocode:NGLOS");
  });

  it("normalizes to the Seaphore evidence model with a stable hash", () => {
    const a = normalizeRecord({
      source: "equasis",
      sourceName: "Equasis",
      grade: "VERIFIED",
      entity: { kind: "vessel", nativeId: "9438291" },
      kind: "identity",
      fields: { name: "MV Ocean Pearl", flag: "PA" },
      observedAt: new Date("2026-07-01T00:00:00Z"),
    });
    const b = normalizeRecord({
      source: "equasis",
      sourceName: "Equasis",
      grade: "VERIFIED",
      entity: { kind: "vessel", nativeId: "9438291" },
      kind: "identity",
      fields: { name: "MV Ocean Pearl", flag: "PA" },
      observedAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(a.hash).toEqual(b.hash);
    expect(a.entity.id).toBe("vessel:imo:9438291");
  });
});

describe("IAL: entity resolution", () => {
  it("collapses records from different providers onto one canonical id", () => {
    const equasis = normalizeRecord({
      source: "equasis",
      sourceName: "Equasis",
      grade: "VERIFIED",
      entity: { kind: "vessel", nativeId: "9438291", label: "Ocean Pearl" },
      kind: "identity",
      fields: { name: "Ocean Pearl", flag: "PA" },
      observedAt: new Date(),
    });
    const imo = normalizeRecord({
      source: "imo-gisis",
      sourceName: "IMO",
      grade: "VERIFIED",
      entity: { kind: "vessel", nativeId: "9438291", label: "MV Ocean Pearl" },
      kind: "identity",
      fields: { name: "MV Ocean Pearl", flag: "PA" },
      observedAt: new Date(),
    });
    const resolved = resolveEntities([equasis, imo]);
    expect(resolved.canonical).toHaveLength(1);
    expect(resolved.canonical[0].id).toBe("vessel:imo:9438291");
  });
});

describe("IAL: validation", () => {
  it("flags missing required fields without dropping records", () => {
    const rec = normalizeRecord({
      source: "ais",
      sourceName: "AIS",
      grade: "OBSERVED",
      entity: { kind: "vessel", nativeId: "9438291" },
      kind: "position",
      fields: { lat: 6.45 }, // missing lon
      observedAt: new Date(),
    });
    const { issues } = validateRecords([rec]);
    expect(issues.some((i) => i.code === "missing-required")).toBe(true);
  });
});

describe("IAL: package assembly", () => {
  it("returns a validated EvidencePackage for a vessel query", async () => {
    const mgr = build();
    await mgr.warmup();
    const pkg = await mgr.acquire(VESSEL_QUERY);
    expect(pkg.verified.length).toBeGreaterThan(0);
    expect(pkg.canonicalEntities.some((e) => e.id === "vessel:imo:9438291")).toBe(true);
    expect(pkg.summary.sourcesResponded).toBeGreaterThan(0);
    // 'identity' returned by both Equasis and IMO — should either be
    // deduped or flagged as conflicting; both are fine, but not silent.
    expect(pkg.missing).not.toContain("identity");
  });

  it("survives a failing connector and still returns a package", async () => {
    const mgr = build({ withFailing: true });
    await mgr.warmup();
    const pkg = await mgr.acquire(VESSEL_QUERY);
    // AIS is the failing connector — position kind should appear in
    // `missing` because no other connector returned it.
    expect(pkg.missing).toContain("position");
    expect(pkg.summary.sourcesResponded).toBeGreaterThan(0);
  });

  it("caches successful acquisitions", async () => {
    const mgr = build();
    await mgr.warmup();
    const first = await mgr.acquire(VESSEL_QUERY);
    const second = await mgr.acquire(VESSEL_QUERY);
    expect(first.verified.length).toBe(second.verified.length);
    expect(second.summary.cacheHits).toBe(1);
  });

  it("exposes health snapshots to administrators", async () => {
    const mgr = build({ withFailing: true });
    await mgr.warmup();
    await mgr.acquire(VESSEL_QUERY);
    const health = mgr.getHealth();
    const ais = health.find((h) => h.connectorId === "ais");
    expect(ais?.available).toBe(false);
    expect(ais?.lastError).toBeTruthy();
  });
});

describe("IAL: default entry point", () => {
  it("acquireEvidence returns a package via the default manager", async () => {
    const pkg = await acquireEvidence(VESSEL_QUERY);
    expect(pkg.id).toMatch(/^pkg_/);
    expect(pkg.sources.length).toBeGreaterThan(0);
  });
});
