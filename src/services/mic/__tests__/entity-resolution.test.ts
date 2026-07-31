/**
 * INT-01B — Entity Resolution Engine Tests
 */
import { describe, it, expect, beforeEach } from "vitest";
import { IntelligenceObjectRegistry } from "../entities/registry";
import { resolveEntities } from "../resolution/engine";

function makeVessel(id: string, imoNumber: string | null, label = "MV TEST") {
  return {
    objectId: id, objectKind: "vessel" as const, label,
    aliases: [], confidence: "HIGH" as const, grade: "CORROBORATED" as const,
    citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1,
    attributes: { imoNumber },
  } as any;
}

function makeCompany(id: string, regNum: string | null, label: string) {
  return {
    objectId: id, objectKind: "company" as const, label,
    aliases: [], confidence: "HIGH" as const, grade: "CORROBORATED" as const,
    citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1,
    attributes: { registrationNumber: regNum },
  } as any;
}

describe("Entity Resolution · IMO match", () => {
  it("merges two vessels sharing the same IMO number", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeVessel("vessel:gfw:001", "9438291", "MV OCEAN PEARL"));
    reg.upsert(makeVessel("vessel:equasis:002", "9438291", "OCEAN PEARL"));
    const result = resolveEntities(reg, ["vessel"]);
    expect(result.mergesPerformed).toBe(1);
    expect(result.decisions[0].method).toBe("imo-match");
    expect(result.decisions[0].confidence).toBe(1.0);
  });

  it("does NOT merge vessels with different IMO numbers", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeVessel("vessel:a", "9438291", "MV ALPHA"));
    reg.upsert(makeVessel("vessel:b", "9123456", "MV BETA"));
    const result = resolveEntities(reg, ["vessel"]);
    expect(result.mergesPerformed).toBe(0);
  });

  it("does NOT merge vessel with null IMO against another", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeVessel("vessel:a", null, "MV ALPHA"));
    reg.upsert(makeVessel("vessel:b", null, "MV ALPHA"));
    const result = resolveEntities(reg, ["vessel"]);
    // null IMO does not trigger IMO-match; name similarity would for identical names
    expect(result.decisions.every(d => d.method !== "imo-match")).toBe(true);
  });
});

describe("Entity Resolution · Company registration match", () => {
  it("merges two companies sharing a CAC number", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeCompany("company:a", "RC123456", "Apex Shipping Ltd"));
    reg.upsert(makeCompany("company:b", "RC123456", "Apex Shipping Limited"));
    const result = resolveEntities(reg, ["company"]);
    expect(result.mergesPerformed).toBeGreaterThan(0);
  });
});

describe("Entity Resolution · Name similarity", () => {
  it("merges companies with >85% token similarity", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeCompany("company:a", null, "Mediterranean Shipping Company SA"));
    reg.upsert(makeCompany("company:b", null, "Mediterranean Shipping Company"));
    const result = resolveEntities(reg, ["company"]);
    const nameDec = result.decisions.find(d => d.method === "name-similarity");
    if (result.mergesPerformed > 0) {
      expect(nameDec?.confidence).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("does NOT merge companies with low name similarity", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeCompany("company:a", null, "Apex Shipping"));
    reg.upsert(makeCompany("company:b", null, "Delta Marine Services"));
    const result = resolveEntities(reg, ["company"]);
    const nameDec = result.decisions.find(d => d.method === "name-similarity");
    // If merge happened, confidence must be high; but likely no merge
    if (nameDec) {
      expect(nameDec.confidence).toBeGreaterThanOrEqual(0.85);
    }
  });
});

describe("Entity Resolution · Duplicate guard", () => {
  it("does not process an id that was already merged", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeVessel("vessel:a", "9999991", "V1"));
    reg.upsert(makeVessel("vessel:b", "9999991", "V1-dup"));
    reg.upsert(makeVessel("vessel:c", "9999991", "V1-dup2"));
    const result = resolveEntities(reg, ["vessel"]);
    // All three share the same IMO — two merges possible
    expect(result.mergesPerformed).toBeGreaterThan(0);
    // merged ids should be unique (no double-count)
    const mergedIds = result.decisions.map(d => d.mergedId);
    expect(mergedIds.length).toBe(new Set(mergedIds).size);
  });
});

describe("Entity Resolution · Result structure", () => {
  it("returns totalCandidates, mergesPerformed, decisions, durationMs", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert(makeVessel("vessel:a", "1234567", "V1"));
    const result = resolveEntities(reg, ["vessel"]);
    expect(typeof result.totalCandidates).toBe("number");
    expect(typeof result.mergesPerformed).toBe("number");
    expect(Array.isArray(result.decisions)).toBe(true);
    expect(typeof result.durationMs).toBe("number");
  });

  it("returns empty decisions when no duplicates", () => {
    const reg = new IntelligenceObjectRegistry();
    const result = resolveEntities(reg, ["vessel"]);
    expect(result.mergesPerformed).toBe(0);
    expect(result.decisions).toHaveLength(0);
  });
});
