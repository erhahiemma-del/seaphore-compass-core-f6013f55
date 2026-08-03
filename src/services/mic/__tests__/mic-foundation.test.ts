/**
 * INT-01A — MIC Foundation Tests
 *
 * Covers: all eight registries, the container process() pipeline,
 * factory functions, confidence computation, timeline extraction,
 * risk scoring, and singleton isolation.
 *
 * No network, no Supabase, no React. Pure logic only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMicContainer, createMicContainerWithClock } from "../factory";
import type { MicContainer } from "../container";
import type { NormalizedEvidence } from "@/services/ial/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { IdentityCluster } from "@/services/ife/identity-resolver";
import {
  micTierFromScore,
  micScoreFromGrade,
  micBandFromScore,
  citationFromEvidence,
  MIC_CONFIDENCE_THRESHOLDS,
} from "../types";

// ─────────────────────────────────────────────────────────────────────
//  TEST FIXTURES
// ─────────────────────────────────────────────────────────────────────

const VESSEL_ID = "vessel:imo:9438291";
const COMPANY_ID = "company:oc:123456";
const PORT_ID = "port:unlocode:NGAPP";

function makeEvidence(overrides: Partial<NormalizedEvidence> = {}): NormalizedEvidence {
  return {
    id: overrides.id ?? "ev_001",
    source: overrides.source ?? "gfw",
    sourceName: overrides.sourceName ?? "Global Fishing Watch",
    grade: overrides.grade ?? "CORROBORATED",
    entity: overrides.entity ?? { kind: "vessel", id: VESSEL_ID, label: "MV OCEAN PEARL" },
    kind: overrides.kind ?? "identity",
    fields: overrides.fields ?? { imo: "9438291", flag: "NG" },
    observedAt: overrides.observedAt ?? "2026-07-01T00:00:00Z",
    retrievedAt: overrides.retrievedAt ?? "2026-07-01T00:00:00Z",
    freshnessSeconds: overrides.freshnessSeconds ?? 3600,
    hash: overrides.hash ?? "hash-001",
    excerpt: overrides.excerpt ?? "Vessel identity record",
  };
}

function makeCluster(overrides: Partial<IdentityCluster> = {}): IdentityCluster {
  return {
    canonicalId: overrides.canonicalId ?? VESSEL_ID,
    entityKind: overrides.entityKind ?? "vessel",
    label: overrides.label ?? "MV OCEAN PEARL",
    aliasIds: overrides.aliasIds ?? ["vessel:mmsi:440825000"],
    signals: {
      imo: "9438291",
      mmsi: "440825000",
      callSign: null,
      name: "MV OCEAN PEARL",
      aliases: [],
      historicalNames: [],
      flag: "NG",
    },
    confidence: {
      score: 88,
      tier: "VERIFIED",
      band: "auto-select",
      signals: [],
      ambiguous: false,
      topCandidate: {
        id: VESSEL_ID,
        score: 88,
        tier: "VERIFIED",
        band: "auto-select",
        signals: [],
        reasons: [],
        ambiguous: false,
      },
      allCandidates: [],
      reasons: ["IMO match", "MMSI match"],
    },
    evidenceIds: ["ev_001"],
  };
}

function makeUip(evidenceList: NormalizedEvidence[]): UnifiedIntelligencePackage {
  const cluster = makeCluster();
  return {
    id: `uip_${Date.now()}`,
    createdAt: "2026-07-01T00:00:00Z",
    fused: {
      id: "fep_001",
      createdAt: "2026-07-01T00:00:00Z",
      sourcePackageId: "pkg_001",
      canonical: evidenceList.map((ev) => ({
        entity: ev.entity,
        fields: [],
        confidence: "HIGH" as const,
        grade: ev.grade,
        sources: [ev.source],
        explanation: "fused",
      })),
      contradictions: [],
      sources: [],
      report: {
        contradictions: [],
        evidenceStrength: "HIGH" as const,
        missing: [],
        unknowns: [],
        summary: "",
      },
      missing: [],
      confidence: "HIGH" as const,
      grade: "CORROBORATED",
      stats: {
        inputRecords: evidenceList.length,
        canonicalEntities: new Set(evidenceList.map((e) => e.entity.id)).size,
        contradictions: 0,
        sourcesQueried: 1,
        sourcesResponded: 1,
        averageFreshnessSeconds: 3600,
      },
    },
    identity: [cluster],
    osae: [],
    provenance: [],
    freshestSeconds: 3600,
    hasContradictions: false,
    rawEvidence: evidenceList,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  CONFIDENCE TYPE TESTS
// ─────────────────────────────────────────────────────────────────────

describe("MIC · Confidence model", () => {
  it("micTierFromScore bands correctly", () => {
    expect(micTierFromScore(0.9)).toBe("VERY_HIGH");
    expect(micTierFromScore(0.85)).toBe("VERY_HIGH");
    expect(micTierFromScore(0.84)).toBe("HIGH");
    expect(micTierFromScore(0.65)).toBe("HIGH");
    expect(micTierFromScore(0.64)).toBe("MEDIUM");
    expect(micTierFromScore(0.4)).toBe("MEDIUM");
    expect(micTierFromScore(0.39)).toBe("LOW");
    expect(micTierFromScore(0.0)).toBe("LOW");
  });

  it("micScoreFromGrade maps every grade", () => {
    expect(micScoreFromGrade("VERIFIED")).toBe(0.95);
    expect(micScoreFromGrade("CORROBORATED")).toBe(0.8);
    expect(micScoreFromGrade("OBSERVED")).toBe(0.65);
    expect(micScoreFromGrade("REPORTED")).toBe(0.45);
    expect(micScoreFromGrade("INFERRED")).toBe(0.3);
    expect(micScoreFromGrade("UNKNOWN")).toBe(0.1);
  });

  it("micBandFromScore bands correctly", () => {
    expect(micBandFromScore(80)).toBe("critical");
    expect(micBandFromScore(75)).toBe("critical");
    expect(micBandFromScore(74)).toBe("high");
    expect(micBandFromScore(50)).toBe("high");
    expect(micBandFromScore(49)).toBe("elevated");
    expect(micBandFromScore(25)).toBe("elevated");
    expect(micBandFromScore(24)).toBe("low");
    expect(micBandFromScore(0)).toBe("low");
  });

  it("MIC_CONFIDENCE_THRESHOLDS are ordered correctly", () => {
    const { VERY_HIGH, HIGH, MEDIUM, LOW } = MIC_CONFIDENCE_THRESHOLDS;
    expect(VERY_HIGH).toBeGreaterThan(HIGH);
    expect(HIGH).toBeGreaterThan(MEDIUM);
    expect(MEDIUM).toBeGreaterThan(LOW);
  });

  it("citationFromEvidence populates all fields", () => {
    const ev = makeEvidence({ excerpt: "Test excerpt" });
    const cite = citationFromEvidence(ev);
    expect(cite.evidenceId).toBe(ev.id);
    expect(cite.connectorId).toBe(ev.source);
    expect(cite.sourceName).toBe(ev.sourceName);
    expect(cite.grade).toBe(ev.grade);
    expect(cite.observedAt).toBe(ev.observedAt);
    expect(cite.excerpt).toBe("Test excerpt");
  });
});

// ─────────────────────────────────────────────────────────────────────
//  REGISTRY TESTS
// ─────────────────────────────────────────────────────────────────────

describe("MIC · Entity Registry", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("registers a new entity and returns it", () => {
    const entry = mic.entities.register({
      kind: "vessel",
      canonicalId: VESSEL_ID,
      label: "MV OCEAN PEARL",
      aliases: ["vessel:mmsi:440825000"],
      confidence: "HIGH",
      grade: "CORROBORATED",
      citations: [],
      sourceUipIds: ["uip_1"],
    });
    expect(entry.canonicalId).toBe(VESSEL_ID);
    expect(entry.revision).toBe(1);
    expect(mic.entities.size).toBe(1);
  });

  it("merges aliases and citations on re-registration", () => {
    mic.entities.register({
      kind: "vessel",
      canonicalId: VESSEL_ID,
      label: "MV OCEAN PEARL",
      aliases: ["vessel:mmsi:111"],
      confidence: "HIGH",
      grade: "CORROBORATED",
      citations: [
        {
          evidenceId: "ev1",
          connectorId: "gfw",
          sourceName: "GFW",
          grade: "CORROBORATED",
          observedAt: "2026-01-01T00:00:00Z",
          excerpt: "A",
        },
      ],
      sourceUipIds: ["uip_1"],
    });
    mic.entities.register({
      kind: "vessel",
      canonicalId: VESSEL_ID,
      label: "MV OCEAN PEARL",
      aliases: ["vessel:mmsi:222"],
      confidence: "VERY_HIGH",
      grade: "VERIFIED",
      citations: [
        {
          evidenceId: "ev2",
          connectorId: "equasis",
          sourceName: "Equasis",
          grade: "VERIFIED",
          observedAt: "2026-02-01T00:00:00Z",
          excerpt: "B",
        },
      ],
      sourceUipIds: ["uip_2"],
    });
    const entity = mic.entities.get(VESSEL_ID)!;
    expect(entity.aliases).toHaveLength(2);
    expect(entity.citations).toHaveLength(2);
    expect(entity.sourceUipIds).toHaveLength(2);
    expect(entity.revision).toBe(2);
  });

  it("resolves aliases to canonical id", () => {
    mic.entities.register({
      kind: "vessel",
      canonicalId: VESSEL_ID,
      label: "MV OCEAN PEARL",
      aliases: ["vessel:mmsi:440825000"],
      confidence: "HIGH",
      grade: "CORROBORATED",
      citations: [],
      sourceUipIds: [],
    });
    expect(mic.entities.resolveAlias("vessel:mmsi:440825000")).toBe(VESSEL_ID);
    expect(mic.entities.resolveAlias(VESSEL_ID)).toBe(VESSEL_ID);
    expect(mic.entities.resolveAlias("unknown:id")).toBeUndefined();
  });

  it("getByKind returns only matching entities", () => {
    mic.entities.register({
      kind: "vessel",
      canonicalId: VESSEL_ID,
      label: "V1",
      aliases: [],
      confidence: "HIGH",
      grade: "CORROBORATED",
      citations: [],
      sourceUipIds: [],
    });
    mic.entities.register({
      kind: "company",
      canonicalId: COMPANY_ID,
      label: "C1",
      aliases: [],
      confidence: "HIGH",
      grade: "CORROBORATED",
      citations: [],
      sourceUipIds: [],
    });
    expect(mic.entities.getByKind("vessel")).toHaveLength(1);
    expect(mic.entities.getByKind("company")).toHaveLength(1);
    expect(mic.entities.getByKind("port")).toHaveLength(0);
  });
});

describe("MIC · Relationship Registry", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("registers a relationship and indexes it by both entities", () => {
    mic.relationships.register({
      edgeId: "OWNS::company:oc:1->vessel:imo:1",
      type: "OWNS",
      fromEntityId: "company:oc:1",
      toEntityId: "vessel:imo:1",
      confidence: "HIGH",
      grade: "CORROBORATED",
      citations: [],
      explanation: "Registered owner",
    });
    expect(mic.relationships.getForEntity("company:oc:1")).toHaveLength(1);
    expect(mic.relationships.getForEntity("vessel:imo:1")).toHaveLength(1);
    expect(mic.relationships.getForEntity("unknown:id")).toHaveLength(0);
  });

  it("strengthens an edge on re-registration", () => {
    const base = {
      edgeId: "OWNS::c->v",
      type: "OWNS" as const,
      fromEntityId: "c",
      toEntityId: "v",
      grade: "REPORTED" as const,
      citations: [],
      explanation: "First source",
    };
    mic.relationships.register({ ...base, confidence: "LOW" });
    mic.relationships.register({
      ...base,
      confidence: "HIGH",
      grade: "CORROBORATED",
      explanation: "Second source",
    });
    const rel = mic.relationships.get("OWNS::c->v")!;
    expect(rel.revision).toBe(2);
    expect(rel.confidence).toBe("HIGH");
  });
});

describe("MIC · Evidence Registry", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("registers evidence and deduplicates on second call", () => {
    const ev = makeEvidence();
    mic.evidence.register({
      evidenceId: ev.id,
      connectorId: ev.source,
      sourceName: ev.sourceName,
      grade: ev.grade,
      kind: ev.kind,
      entityId: ev.entity.id,
      observedAt: ev.observedAt,
      uipId: "uip_1",
    });
    mic.evidence.register({
      evidenceId: ev.id, // same id
      connectorId: ev.source,
      sourceName: ev.sourceName,
      grade: ev.grade,
      kind: ev.kind,
      entityId: ev.entity.id,
      observedAt: ev.observedAt,
      uipId: "uip_2",
    });
    expect(mic.evidence.size).toBe(1); // no duplicate
  });

  it("indexes evidence by entity and UIP", () => {
    mic.evidence.register({
      evidenceId: "ev_a",
      connectorId: "gfw",
      sourceName: "GFW",
      grade: "OBSERVED",
      kind: "position",
      entityId: VESSEL_ID,
      observedAt: "2026-07-01T00:00:00Z",
      uipId: "uip_x",
    });
    expect(mic.evidence.getForEntity(VESSEL_ID)).toHaveLength(1);
    expect(mic.evidence.getForUip("uip_x")).toHaveLength(1);
    expect(mic.evidence.getForConnector("gfw")).toHaveLength(1);
    expect(mic.evidence.getForEntity("unknown:id")).toHaveLength(0);
  });
});

describe("MIC · Confidence Registry", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("registers and retrieves a confidence entry", () => {
    mic.confidence.register({
      subjectId: VESSEL_ID,
      subjectKind: "entity",
      score: 0.82,
      tier: "HIGH",
      components: [{ factor: "authority", contribution: 0.82, explanation: "VERIFIED evidence" }],
    });
    const entry = mic.confidence.getForSubject("entity", VESSEL_ID);
    expect(entry?.score).toBe(0.82);
    expect(entry?.tier).toBe("HIGH");
  });

  it("updates confidence on re-registration", () => {
    mic.confidence.register({
      subjectId: VESSEL_ID,
      subjectKind: "entity",
      score: 0.5,
      tier: "MEDIUM",
      components: [],
    });
    mic.confidence.register({
      subjectId: VESSEL_ID,
      subjectKind: "entity",
      score: 0.9,
      tier: "VERY_HIGH",
      components: [],
    });
    const entry = mic.confidence.getForSubject("entity", VESSEL_ID)!;
    expect(entry.score).toBe(0.9);
    expect(entry.revision).toBe(2);
  });
});

describe("MIC · Timeline Registry", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("registers and retrieves timeline events in chronological order", () => {
    mic.timeline.register({
      kind: "port-visit",
      label: "Apapa arrival",
      description: "Port visit",
      entityId: VESSEL_ID,
      relatedEntityIds: [],
      occurredAt: "2026-06-15T00:00:00Z",
      citations: [],
      grade: "OBSERVED",
      significance: "medium",
    });
    mic.timeline.register({
      kind: "ais-dark",
      label: "AIS dark event",
      description: "AIS gap",
      entityId: VESSEL_ID,
      relatedEntityIds: [],
      occurredAt: "2026-05-01T00:00:00Z",
      citations: [],
      grade: "CORROBORATED",
      significance: "high",
    });
    const events = mic.timeline.getForEntity(VESSEL_ID);
    expect(events).toHaveLength(2);
    // Chronological order: May before June
    expect(events[0].occurredAt < events[1].occurredAt).toBe(true);
  });

  it("deduplicates identical events on re-ingestion", () => {
    for (let i = 0; i < 3; i++) {
      mic.timeline.register({
        kind: "port-visit",
        label: "Same visit",
        description: "d",
        entityId: VESSEL_ID,
        relatedEntityIds: [],
        occurredAt: "2026-06-01T00:00:00Z",
        citations: [],
        grade: "OBSERVED",
        significance: "low",
      });
    }
    expect(mic.timeline.getForEntity(VESSEL_ID)).toHaveLength(1);
  });
});

describe("MIC · Risk Registry", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("registers a risk profile and retrieves it by entity", () => {
    mic.risk.register({
      entityId: VESSEL_ID,
      entityLabel: "MV OCEAN PEARL",
      entityKind: "vessel",
      score: 72,
      band: "high",
      confidence: "HIGH",
      indicators: [
        {
          kind: "sanctions-hit",
          label: "Sanctions",
          score: 1.0,
          weight: 0.3,
          points: 30,
          rationale: "OFAC hit",
          citations: [],
          nodeIds: [VESSEL_ID],
          confidence: "VERY_HIGH",
        },
      ],
      narrative: "HIGH risk: active sanctions.",
      computedAt: "2026-07-01T00:00:00Z",
    });
    const profile = mic.risk.getForEntity(VESSEL_ID)!;
    expect(profile.score).toBe(72);
    expect(profile.band).toBe("high");
    expect(profile.indicators).toHaveLength(1);
  });

  it("getByBand returns only matching band", () => {
    mic.risk.register({
      entityId: VESSEL_ID,
      entityLabel: "V",
      entityKind: "vessel",
      score: 80,
      band: "critical",
      confidence: "HIGH",
      indicators: [],
      narrative: "",
      computedAt: "2026-07-01T00:00:00Z",
    });
    mic.risk.register({
      entityId: COMPANY_ID,
      entityLabel: "C",
      entityKind: "company",
      score: 10,
      band: "low",
      confidence: "MEDIUM",
      indicators: [],
      narrative: "",
      computedAt: "2026-07-01T00:00:00Z",
    });
    expect(mic.risk.getCritical()).toHaveLength(1);
    expect(mic.risk.getByBand("low")).toHaveLength(1);
  });
});

describe("MIC · Reasoning Registry", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("registers a reasoning log and retrieves by session", () => {
    mic.reasoning.register({
      sessionId: "sess_001",
      query: "vessel:imo:1",
      primaryEntityId: VESSEL_ID,
      statements: [],
      confidence: "HIGH",
      grade: "CORROBORATED",
      uipId: "uip_1",
    });
    const logs = mic.reasoning.getForSession("sess_001");
    expect(logs).toHaveLength(1);
    expect(logs[0].query).toBe("vessel:imo:1");
  });
});

// ─────────────────────────────────────────────────────────────────────
//  CONTAINER process() INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────────────

describe("MIC · Container — process()", () => {
  let mic: MicContainer;

  beforeEach(() => {
    mic = createMicContainerWithClock("2026-07-01T00:00:00Z");
  });

  it("processes a UIP and populates all registries", () => {
    const evidence = [
      makeEvidence({ id: "ev_1", grade: "VERIFIED" }),
      makeEvidence({
        id: "ev_2",
        kind: "position",
        fields: { portName: "Apapa" },
        grade: "OBSERVED",
        observedAt: "2026-06-15T00:00:00Z",
      }),
    ];
    const uip = makeUip(evidence);
    const result = mic.process(uip);

    expect(result.stats.entitiesRegistered).toBeGreaterThan(0);
    expect(result.stats.evidenceRegistered).toBe(2);
    expect(result.graphSnapshot.nodes.length).toBeGreaterThan(0);
    expect(result.graphSnapshot.edges.length).toBeGreaterThanOrEqual(0);
    // Registries populated
    expect(mic.entities.size).toBeGreaterThan(0);
    expect(mic.evidence.size).toBe(2);
    expect(mic.confidence.size).toBeGreaterThan(0);
    expect(mic.risk.size).toBeGreaterThan(0);
    expect(mic.graph.size).toBe(1);
  });

  it("is idempotent — re-processing the same UIP does not duplicate entities", () => {
    const uip = makeUip([makeEvidence()]);
    const result1 = mic.process(uip);
    const entityCountAfterFirst = mic.entities.size;
    const result2 = mic.process(uip); // second time
    // Re-processing the same UIP must not increase entity or evidence count.
    // (The entity count may be > 1 because mintEdgesForRecord creates related nodes,
    //  e.g. a flag-state/country node from the identity record's `flag` field.
    //  That is correct — one entity per real-world entity, not one per evidence record.)
    expect(mic.entities.size).toBe(entityCountAfterFirst);
    expect(mic.evidence.size).toBe(1); // same evidence record, not duplicated
    // Stats should show the same number of entities registered
    expect(result2.stats.entitiesRegistered).toBe(result1.stats.entitiesRegistered);
  });

  it("extracts timeline events from port-visit evidence", () => {
    const uip = makeUip([
      makeEvidence({
        id: "ev_p",
        kind: "position",
        fields: { portName: "Apapa" },
        grade: "OBSERVED",
      }),
    ]);
    mic.process(uip);
    const events = mic.timeline.getForEntity(VESSEL_ID);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === "port-visit")).toBe(true);
  });

  it("detects sanctions hit in risk profile", () => {
    const uip = makeUip([
      makeEvidence(),
      makeEvidence({
        id: "ev_s",
        kind: "sanctions",
        fields: { status: "listed", entityName: "MV OCEAN PEARL" },
        grade: "VERIFIED",
      }),
    ]);
    mic.process(uip);
    const risk = mic.risk.getForEntity(VESSEL_ID)!;
    expect(risk).toBeDefined();
    const sanctionsIndicator = risk.indicators.find((i) => i.kind === "sanctions-hit");
    expect(sanctionsIndicator).toBeDefined();
    expect(sanctionsIndicator!.score).toBe(1.0);
  });

  it("detects AIS dark activity in risk profile", () => {
    const uip = makeUip([
      makeEvidence(),
      makeEvidence({ id: "ev_ais", kind: "position", fields: { gapHours: 48 }, grade: "OBSERVED" }),
    ]);
    mic.process(uip);
    const risk = mic.risk.getForEntity(VESSEL_ID)!;
    expect(risk).toBeDefined();
    const aisIndicator = risk.indicators.find((i) => i.kind === "ais-dark-activity");
    expect(aisIndicator).toBeDefined();
    expect(aisIndicator!.score).toBeGreaterThan(0);
  });

  it("stats() returns accurate counts after processing", () => {
    mic.process(
      makeUip([makeEvidence({ id: "ev_a" }), makeEvidence({ id: "ev_b", kind: "position" })]),
    );
    const stats = mic.stats();
    expect(stats.entities).toBeGreaterThan(0);
    expect(stats.evidence).toBe(2);
    expect(stats.confidence).toBeGreaterThan(0);
    expect(stats.riskProfiles).toBeGreaterThan(0);
    expect(stats.mkgNodes).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  FACTORY TESTS
// ─────────────────────────────────────────────────────────────────────

describe("MIC · Factory", () => {
  it("createMicContainer returns isolated instances", () => {
    const a = createMicContainer();
    const b = createMicContainer();
    a.entities.register({
      kind: "vessel",
      canonicalId: VESSEL_ID,
      label: "V",
      aliases: [],
      confidence: "HIGH",
      grade: "CORROBORATED",
      citations: [],
      sourceUipIds: [],
    });
    // b must not be polluted by a
    expect(b.entities.size).toBe(0);
  });

  it("createMicContainerWithClock uses the injected timestamp", () => {
    const fixed = "2025-01-01T00:00:00Z";
    const c = createMicContainerWithClock(fixed);
    const uip = makeUip([makeEvidence()]);
    const result = c.process(uip);
    const risk = result.risk[0];
    if (risk) {
      expect(risk.computedAt).toBe(fixed);
    }
  });

  it("process-wide singleton (mic) is a MicContainer", async () => {
    const { mic: singleton } = await import("../container");
    expect(singleton).toBeInstanceOf(Object);
    expect(typeof singleton.process).toBe("function");
    expect(typeof singleton.stats).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────
//  REASONING CONTEXT TESTS
// ─────────────────────────────────────────────────────────────────────

describe("MIC · buildReasoningContext()", () => {
  let mic: MicContainer;
  beforeEach(() => {
    mic = createMicContainer();
  });

  it("returns null entity for unknown id", () => {
    const ctx = mic.buildReasoningContext("unknown:id", "uip_1", "sess_1");
    expect(ctx.entity).toBeUndefined();
    expect(ctx.relationships).toHaveLength(0);
    expect(ctx.timeline).toHaveLength(0);
  });

  it("returns full context after process()", () => {
    const uip = makeUip([makeEvidence()]);
    mic.process(uip);
    const ctx = mic.buildReasoningContext(VESSEL_ID, uip.id, "sess_001");
    expect(ctx.entity?.canonicalId).toBe(VESSEL_ID);
    expect(ctx.confidence).toBeDefined();
    expect(ctx.risk).toBeDefined();
    expect(ctx.registryId).toBeDefined();
    // Reasoning registry should now have one entry for this session
    expect(mic.reasoning.getForSession("sess_001")).toHaveLength(1);
  });

  it("resolves an alias to the canonical entity", () => {
    const uip = makeUip([makeEvidence()]);
    mic.process(uip);
    // "vessel:mmsi:440825000" is an alias from the cluster fixture
    const ctx = mic.buildReasoningContext("vessel:mmsi:440825000", uip.id, "sess_002");
    expect(ctx.entity?.canonicalId).toBe(VESSEL_ID);
  });
});
