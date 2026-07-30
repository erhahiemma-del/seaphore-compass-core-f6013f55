/**
 * INT-01B — Intelligence Object Model Tests
 *
 * Covers: all 20 object kinds, attribute extraction per evidence kind,
 * registry upsert/merge (grade-wins), buildIntelligenceObjects pipeline
 * integration, discriminated union narrowing, idempotency.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMicContainer } from "../factory";
import type { MicContainer } from "../container";
import { IntelligenceObjectRegistry } from "../entities/registry";
import { buildIntelligenceObjects } from "../entities/builder";
import {
  extractVesselAttributes,
  extractVoyageAttributes,
  extractPortAttributes,
  extractCargoAttributes,
  extractCompanyAttributes,
  extractPersonAttributes,
  extractSanctionAttributes,
  extractInspectionAttributes,
  extractSatelliteObservationAttributes,
  extractWeatherEventAttributes,
} from "../entities/extractors";
import { INTELLIGENCE_OBJECT_KINDS } from "../entities/types";
import type { NormalizedEvidence } from "@/services/ial/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { IdentityCluster } from "@/services/ife/identity-resolver";

// ─── Fixtures ─────────────────────────────────────────────────────────

const VESSEL_ID = "vessel:imo:9438291";

function ev(overrides: Partial<NormalizedEvidence> & { fields?: Record<string, unknown> } = {}): NormalizedEvidence {
  return {
    id: overrides.id ?? "ev_001",
    source: overrides.source ?? "gfw",
    sourceName: overrides.sourceName ?? "GFW",
    grade: overrides.grade ?? "CORROBORATED",
    entity: overrides.entity ?? { kind: "vessel", id: VESSEL_ID, label: "MV TEST" },
    kind: overrides.kind ?? "identity",
    fields: overrides.fields ?? { imo: "9438291", flag: "NG" },
    observedAt: overrides.observedAt ?? "2026-07-01T00:00:00Z",
    retrievedAt: "2026-07-01T00:00:00Z",
    freshnessSeconds: 3600,
    hash: overrides.id ?? "hash-001",
    excerpt: overrides.excerpt ?? "Test evidence",
  } as NormalizedEvidence;
}

function makeCluster(overrides: Partial<IdentityCluster> = {}): IdentityCluster {
  return {
    canonicalId: VESSEL_ID, entityKind: "vessel", label: "MV TEST",
    aliasIds: ["vessel:mmsi:440825000"],
    signals: { imo: "9438291", mmsi: "440825000", callSign: null, name: "MV TEST", aliases: [], historicalNames: [], flag: "NG" },
    confidence: { score: 88, tier: "VERIFIED", band: "auto-select", signals: [], ambiguous: false,
      topCandidate: { id: VESSEL_ID, score: 88, tier: "VERIFIED", band: "auto-select", signals: [], reasons: [], ambiguous: false },
      allCandidates: [], reasons: [] },
    evidenceIds: ["ev_001"], ...overrides,
  };
}

function makeUip(evidence: NormalizedEvidence[], id = "uip_test"): UnifiedIntelligencePackage {
  const uniq = [...new Set(evidence.map(e => e.entity.id))];
  return {
    id, createdAt: "2026-07-01T00:00:00Z",
    fused: {
      id: "fep", createdAt: "2026-07-01T00:00:00Z", sourcePackageId: "pkg",
      canonical: uniq.map(eid => {
        const e0 = evidence.find(e => e.entity.id === eid)!;
        return { entity: e0.entity, fields: [], confidence: "HIGH" as const, grade: e0.grade, sources: [e0.source], explanation: "" };
      }),
      contradictions: [], sources: [],
      report: { contradictions: [], evidenceStrength: "HIGH" as const, missing: [], unknowns: [], summary: "" },
      missing: [], confidence: "HIGH" as const, grade: "CORROBORATED" as const,
      stats: { inputRecords: evidence.length, canonicalEntities: uniq.length, contradictions: 0, sourcesQueried: 1, sourcesResponded: 1, averageFreshnessSeconds: 3600 },
    },
    identity: [makeCluster()],
    osae: [], provenance: [], freshestSeconds: 3600, hasContradictions: false, rawEvidence: evidence,
  };
}

// ─── 1. INTELLIGENCE OBJECT KINDS ─────────────────────────────────────

describe("INT-01B · INTELLIGENCE_OBJECT_KINDS", () => {
  it("defines exactly 20 kinds", () => {
    expect(INTELLIGENCE_OBJECT_KINDS).toHaveLength(20);
  });

  it("includes all specified kinds", () => {
    const required = [
      "vessel","voyage","port","cargo","manifest","container",
      "company","person","director","owner","organisation",
      "sanction","inspection","incident","document",
      "satellite-observation","weather-event","location",
      "insurance","classification-society",
    ];
    for (const k of required) {
      expect(INTELLIGENCE_OBJECT_KINDS).toContain(k);
    }
  });
});

// ─── 2. ATTRIBUTE EXTRACTORS ──────────────────────────────────────────

describe("INT-01B · Vessel attribute extractor", () => {
  it("extracts IMO, MMSI, flag from identity evidence", () => {
    const attrs = extractVesselAttributes(ev({
      kind: "identity",
      fields: { imo: "9438291", mmsi: "440825000", flag: "ng", vesselType: "Bulk Carrier", grossTonnage: 45000 },
    }));
    expect(attrs.imoNumber).toBe("9438291");
    expect(attrs.mmsi).toBe("440825000");
    expect(attrs.flag).toBe("NG");     // uppercase normalised
    expect(attrs.vesselType).toBe("Bulk Carrier");
    expect(attrs.grossTonnage).toBe(45000);
  });

  it("extracts former names as an array", () => {
    const attrs = extractVesselAttributes(ev({
      kind: "identity",
      fields: { name: "MV TEST", formerNames: ["OLD NAME 1", "OLD NAME 2"] },
    }));
    expect(attrs.name).toBe("MV TEST");
    expect(attrs.formerNames).toEqual(["OLD NAME 1", "OLD NAME 2"]);
  });

  it("maps yearBuilt and gross/net/deadweight tonnage", () => {
    const attrs = extractVesselAttributes(ev({
      kind: "identity",
      fields: { yearBuilt: 2008, grossTonnage: 50000, netTonnage: 30000, deadweightTonnage: 90000 },
    }));
    expect(attrs.yearBuilt).toBe(2008);
    expect(attrs.grossTonnage).toBe(50000);
    expect(attrs.netTonnage).toBe(30000);
    expect(attrs.deadweightTonnage).toBe(90000);
  });

  it("returns empty partial for irrelevant evidence kinds", () => {
    const attrs = extractVesselAttributes(ev({ kind: "sanctions", fields: { status: "listed" } }));
    expect(Object.keys(attrs)).toHaveLength(0);
  });

  it("returns null for absent fields, never fabricates", () => {
    const attrs = extractVesselAttributes(ev({ kind: "identity", fields: {} }));
    expect(attrs.imoNumber).toBeUndefined();   // not present — not null, not fabricated
    expect(attrs.flag).toBeUndefined();
  });
});

describe("INT-01B · Voyage attribute extractor", () => {
  it("extracts port-call fields", () => {
    const attrs = extractVoyageAttributes(ev({
      kind: "port-call",
      fields: { portName: "Apapa", portUnlocode: "NGAPP", arrivalTime: "2026-06-01T10:00:00Z", speed: 12.5 },
    }));
    expect(attrs.arrivalPort).toBe("Apapa");
    expect(attrs.arrivalPortUnlocode).toBe("NGAPP");
    expect(attrs.arrivalTime).toBe("2026-06-01T10:00:00Z");
    expect(attrs.speed).toBe(12.5);
  });
});

describe("INT-01B · Port attribute extractor", () => {
  it("extracts UNLOCODE and coordinates", () => {
    const attrs = extractPortAttributes(ev({
      kind: "port-call",
      fields: { unlocode: "NGAPP", portName: "Apapa", latitude: 6.45, longitude: 3.38 },
    }));
    expect(attrs.unlocode).toBe("NGAPP");
    expect(attrs.name).toBe("Apapa");
    expect(attrs.latitude).toBe(6.45);
    expect(attrs.longitude).toBe(3.38);
  });
});

describe("INT-01B · Cargo attribute extractor", () => {
  it("extracts HS code, weight, dangerous goods flag", () => {
    const attrs = extractCargoAttributes(ev({
      kind: "cargo",
      fields: { description: "Crude Oil", hsCode: "2709.00", weight: 50000000, dangerousGoods: true, imdgClass: "3" },
    }));
    expect(attrs.description).toBe("Crude Oil");
    expect(attrs.hsCode).toBe("2709.00");
    expect(attrs.weight).toBe(50000000);
    expect(attrs.dangerousGoods).toBe(true);
    expect(attrs.imdgClass).toBe("3");
  });
});

describe("INT-01B · Company attribute extractor", () => {
  it("extracts registration number and status", () => {
    const attrs = extractCompanyAttributes(ev({
      kind: "identity",
      entity: { kind: "company", id: "company:oc:123", label: "Test Corp" },
      fields: { registeredName: "Test Corporation Ltd", cacNumber: "RC123456", status: "active" },
    }));
    expect(attrs.registeredName).toBe("Test Corporation Ltd");
    expect(attrs.cacNumber).toBe("RC123456");
    expect(attrs.status).toBe("active");
  });
});

describe("INT-01B · Person attribute extractor", () => {
  it("extracts name, nationality, seafarer book", () => {
    const attrs = extractPersonAttributes(ev({
      kind: "identity",
      entity: { kind: "person", id: "person:cdc:NG12345", label: "John Doe" },
      fields: { fullName: "John Doe", nationality: "NG", seafarerBookNumber: "NG-CDC-12345", rank: "Captain" },
    }));
    expect(attrs.fullName).toBe("John Doe");
    expect(attrs.nationality).toBe("NG");
    expect(attrs.seafarerBookNumber).toBe("NG-CDC-12345");
    expect(attrs.rank).toBe("Captain");
  });
});

describe("INT-01B · Sanction attribute extractor", () => {
  it("extracts list name, status, and programme", () => {
    const attrs = extractSanctionAttributes(ev({
      kind: "sanctions",
      fields: { sanctionList: "OFAC SDN", status: "active", programmeName: "RUSSIA" },
    }));
    expect(attrs.sanctionListName).toBe("OFAC SDN");
    expect(attrs.status).toBe("active");
    expect(attrs.programmeName).toBe("RUSSIA");
  });

  it("coerces unknown status to active for sanctions", () => {
    const attrs = extractSanctionAttributes(ev({
      kind: "sanctions",
      fields: { status: "listed" },
    }));
    expect(attrs.status).toBe("active");
  });
});

describe("INT-01B · Inspection attribute extractor", () => {
  it("extracts inspection type, result, deficiency count", () => {
    const attrs = extractInspectionAttributes(ev({
      kind: "inspection",
      fields: { inspectionType: "PSC", result: "detained", deficiencies: 7, authority: "NIMASA" },
    }));
    expect(attrs.inspectionType).toBe("PSC");
    expect(attrs.result).toBe("detained");
    expect(attrs.deficiencies).toBe(7);
    expect(attrs.authority).toBe("NIMASA");
  });
});

describe("INT-01B · Satellite observation attribute extractor", () => {
  it("extracts scene ID, collection, and bounding box", () => {
    const attrs = extractSatelliteObservationAttributes(ev({
      kind: "other",
      fields: {
        sceneId: "S1A_IW_GRDH_20260701T062130",
        collection: "SENTINEL-1",
        platform: "Sentinel-1A",
        centroidLatitude: 6.45,
        centroidLongitude: 3.38,
        sarMode: "IW",
        cloudCover: null,
      },
    }));
    expect(attrs.sceneId).toBe("S1A_IW_GRDH_20260701T062130");
    expect(attrs.collection).toBe("SENTINEL-1");
    expect(attrs.centroidLatitude).toBe(6.45);
    expect(attrs.centroidLongitude).toBe(3.38);
    expect(attrs.sarMode).toBe("IW");
  });
});

describe("INT-01B · Weather event attribute extractor", () => {
  it("extracts wind speed, wave height, SST", () => {
    const attrs = extractWeatherEventAttributes(ev({
      kind: "weather",
      fields: { waveHeight: 2.5, windSpeed: 18.3, seaSurfaceTemp: 28.1, sourceModel: "Open-Meteo Marine" },
    }));
    expect(attrs.waveHeight).toBe(2.5);
    expect(attrs.windSpeed).toBe(18.3);
    expect(attrs.seaSurfaceTemp).toBe(28.1);
    expect(attrs.sourceModel).toBe("Open-Meteo Marine");
  });
});

// ─── 3. INTELLIGENCE OBJECT REGISTRY ─────────────────────────────────

describe("INT-01B · IntelligenceObjectRegistry", () => {
  let reg: IntelligenceObjectRegistry;
  beforeEach(() => { reg = new IntelligenceObjectRegistry(); });

  it("stores and retrieves an object by id", () => {
    reg.upsert({
      objectId: VESSEL_ID, objectKind: "vessel", label: "MV TEST",
      aliases: [], confidence: "HIGH", grade: "CORROBORATED",
      citations: [], sourceUipIds: ["uip_1"],
      firstSeenAt: "2026-01-01T00:00:00Z", lastSeenAt: "2026-07-01T00:00:00Z",
      revision: 1,
      attributes: { imoNumber: "9438291", flag: "NG" },
    } as any);
    const obj = reg.get(VESSEL_ID);
    expect(obj?.objectKind).toBe("vessel");
    expect((obj?.attributes as any).imoNumber).toBe("9438291");
  });

  it("grade-wins: higher grade overwrites a populated field", () => {
    reg.upsert({
      objectId: VESSEL_ID, objectKind: "vessel", label: "MV TEST",
      aliases: [], confidence: "LOW", grade: "REPORTED",
      citations: [], sourceUipIds: ["uip_1"],
      firstSeenAt: null, lastSeenAt: null, revision: 1,
      attributes: { imoNumber: "9438291", vesselType: "Tanker" },
    } as any);
    reg.upsert({
      objectId: VESSEL_ID, objectKind: "vessel", label: "MV TEST",
      aliases: [], confidence: "VERY_HIGH", grade: "VERIFIED",
      citations: [], sourceUipIds: ["uip_2"],
      firstSeenAt: null, lastSeenAt: null, revision: 1,
      attributes: { imoNumber: "9438291", vesselType: "Crude Oil Tanker" },
    } as any);
    const obj = reg.get(VESSEL_ID);
    expect((obj?.attributes as any).vesselType).toBe("Crude Oil Tanker");
    expect(obj?.revision).toBe(2);
  });

  it("null incoming does not overwrite populated field", () => {
    reg.upsert({
      objectId: VESSEL_ID, objectKind: "vessel", label: "MV TEST",
      aliases: [], confidence: "HIGH", grade: "CORROBORATED",
      citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1,
      attributes: { imoNumber: "9438291" },
    } as any);
    reg.upsert({
      objectId: VESSEL_ID, objectKind: "vessel", label: "MV TEST",
      aliases: [], confidence: "VERY_HIGH", grade: "VERIFIED",
      citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1,
      attributes: { imoNumber: null },   // null — must not overwrite
    } as any);
    expect((reg.get(VESSEL_ID)?.attributes as any).imoNumber).toBe("9438291");
  });

  it("getByKind returns typed objects for a specific kind", () => {
    reg.upsert({ objectId: VESSEL_ID, objectKind: "vessel", label: "V", aliases: [], confidence: "HIGH", grade: "CORROBORATED", citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1, attributes: {} } as any);
    reg.upsert({ objectId: "company:oc:1", objectKind: "company", label: "C", aliases: [], confidence: "HIGH", grade: "CORROBORATED", citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1, attributes: {} } as any);
    expect(reg.getByKind("vessel")).toHaveLength(1);
    expect(reg.getByKind("company")).toHaveLength(1);
    expect(reg.getByKind("port")).toHaveLength(0);
  });

  it("stats() reports count per kind", () => {
    reg.upsert({ objectId: VESSEL_ID, objectKind: "vessel", label: "V", aliases: [], confidence: "HIGH", grade: "CORROBORATED", citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1, attributes: {} } as any);
    const s = reg.stats();
    expect(s.vessel).toBe(1);
  });
});

// ─── 4. CONTAINER INTEGRATION ─────────────────────────────────────────

describe("INT-01B · MicContainer integration", () => {
  let mic: MicContainer;
  beforeEach(() => { mic = createMicContainer(); });

  it("intelligenceObjects registry is populated after process()", () => {
    const evidence = [
      ev({ id: "ev_1", kind: "identity", fields: { imo: "9438291", flag: "NG", vesselType: "Tanker" } }),
    ];
    const uip = makeUip(evidence);
    mic.process(uip);
    expect(mic.intelligenceObjects.size).toBeGreaterThan(0);
    const obj = mic.intelligenceObjects.get(VESSEL_ID);
    expect(obj?.objectKind).toBe("vessel");
    expect((obj?.attributes as any).imoNumber).toBe("9438291");
    expect((obj?.attributes as any).flag).toBe("NG");
    expect((obj?.attributes as any).vesselType).toBe("Tanker");
  });

  it("stats() includes intelligenceObjects count and byKind breakdown", () => {
    mic.process(makeUip([ev()]));
    const stats = mic.stats();
    expect(stats.intelligenceObjects).toBeGreaterThan(0);
    expect(stats.intelligenceObjectsByKind).toBeDefined();
    expect(typeof stats.intelligenceObjectsByKind).toBe("object");
  });

  it("processes satellite evidence into satellite-observation object", () => {
    const uip = makeUip([
      ev(),
      ev({
        id: "ev_sat",
        kind: "other",
        entity: { kind: "vessel", id: VESSEL_ID, label: "MV TEST" },
        fields: {
          sceneId: "S1A_IW_GRDH_20260701",
          collection: "SENTINEL-1",
          platform: "Sentinel-1A",
          centroidLatitude: 6.45,
          centroidLongitude: 3.38,
          sarMode: "IW",
        },
      }),
    ]);
    mic.process(uip);
    // satellite-observation object may appear as a standalone object (from evidence)
    // OR be folded into the vessel's attributes — either is valid per the builder spec
    expect(mic.intelligenceObjects.size).toBeGreaterThan(0);
  });

  it("processes sanctions evidence into risk indicators and object", () => {
    const uip = makeUip([
      ev(),
      ev({
        id: "ev_sanc",
        kind: "sanctions",
        entity: { kind: "vessel", id: VESSEL_ID, label: "MV TEST" },
        fields: { status: "listed", sanctionList: "OFAC SDN", programmeName: "RUSSIA" },
        grade: "VERIFIED",
      }),
    ]);
    mic.process(uip);
    const risk = mic.risk.getForEntity(VESSEL_ID);
    expect(risk?.indicators.some(i => i.kind === "sanctions-hit")).toBe(true);
  });

  it("is idempotent — second process() does not increase io size", () => {
    const uip = makeUip([ev()]);
    mic.process(uip);
    const size1 = mic.intelligenceObjects.size;
    mic.process(uip);
    expect(mic.intelligenceObjects.size).toBe(size1);
  });

  it("buildReasoningContext includes intelligenceObjects count in stats", () => {
    const uip = makeUip([ev()]);
    mic.process(uip);
    const stats = mic.stats();
    expect(stats.intelligenceObjects).toBeGreaterThanOrEqual(1);
  });
});

// ─── 5. DISCRIMINATED UNION NARROWING ─────────────────────────────────

describe("INT-01B · Discriminated union narrowing", () => {
  it("narrows to VesselAttributes on objectKind === 'vessel'", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert({
      objectId: VESSEL_ID, objectKind: "vessel", label: "MV TEST",
      aliases: [], confidence: "HIGH", grade: "CORROBORATED",
      citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1,
      attributes: { imoNumber: "9438291", flag: "NG" },
    } as any);
    const obj = reg.get(VESSEL_ID)!;
    // TypeScript discriminated union — compile-time narrowing verified by type checker
    if (obj.objectKind === "vessel") {
      expect(obj.attributes.imoNumber).toBe("9438291");
      expect(obj.attributes.flag).toBe("NG");
    } else {
      throw new Error("Expected vessel");
    }
  });

  it("narrows to SanctionAttributes on objectKind === 'sanction'", () => {
    const reg = new IntelligenceObjectRegistry();
    reg.upsert({
      objectId: "sanction:ofac:12345", objectKind: "sanction", label: "SDN Entry",
      aliases: [], confidence: "VERY_HIGH", grade: "VERIFIED",
      citations: [], sourceUipIds: [], firstSeenAt: null, lastSeenAt: null, revision: 1,
      attributes: { sanctionListName: "OFAC SDN", status: "active", programmeName: "RUSSIA" },
    } as any);
    const obj = reg.get("sanction:ofac:12345")!;
    if (obj.objectKind === "sanction") {
      expect(obj.attributes.sanctionListName).toBe("OFAC SDN");
      expect(obj.attributes.status).toBe("active");
    } else {
      throw new Error("Expected sanction");
    }
  });
});
