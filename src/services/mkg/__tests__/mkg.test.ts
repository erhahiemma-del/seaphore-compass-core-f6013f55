/**
 * MKG — unit + integration tests.
 *
 * Cover:
 *   • Node/edge upsert semantics (dedupe, provenance merge, grade recompute).
 *   • Ingestion from a Unified Intelligence Package (identity clusters,
 *     alias edges, cross-connector evidence).
 *   • Traversal (bounded BFS, findPaths, hidden-link detection).
 *   • Conflicting identity surfacing.
 */
import { describe, it, expect } from "vitest";
import { MaritimeKnowledgeGraph } from "../graph";
import { ingestUnifiedPackage } from "../ingest";
import {
  summariseEntity,
  findHiddenLinks,
  findConflictingIdentities,
  describePath,
} from "../insights";
import type { NormalizedEvidence } from "@/services/ial/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";

const REC_BASE = {
  units: undefined,
  excerpt: undefined,
  providerRecordId: undefined,
} as const;

function evidence(over: Partial<NormalizedEvidence>): NormalizedEvidence {
  return {
    id: "ev_x",
    source: "gfw",
    sourceName: "Global Fishing Watch",
    grade: "CORROBORATED",
    entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
    kind: "identity",
    fields: {},
    observedAt: "2026-07-01T00:00:00.000Z",
    retrievedAt: "2026-07-01T00:00:00.000Z",
    freshnessSeconds: 1,
    hash: "hash-1",
    ...REC_BASE,
    ...over,
  } as NormalizedEvidence;
}

describe("MaritimeKnowledgeGraph — core", () => {
  it("upsertNode merges aliases and provenance without duplicating", () => {
    const g = new MaritimeKnowledgeGraph();
    g.upsertNode({
      id: "vessel:imo:9438291", kind: "vessel", label: "DONGWON NO.16",
      aliases: ["vessel:mmsi:440825000"],
      provenance: [{ connectorId: "gfw", sourceName: "GFW", evidenceId: "e1", observedAt: "2026-06-01T00:00:00.000Z", grade: "CORROBORATED" }],
    });
    g.upsertNode({
      id: "vessel:imo:9438291", kind: "vessel", label: "DONGWON NO.16",
      aliases: ["vessel:mmsi:440825000", "vessel:name:DONGWON"],
      provenance: [{ connectorId: "equasis", sourceName: "Equasis", evidenceId: "e2", observedAt: "2026-06-15T00:00:00.000Z", grade: "VERIFIED" }],
    });
    const node = g.getNode("vessel:imo:9438291")!;
    expect(node.aliases.length).toBe(2);
    expect(node.provenance.length).toBe(2);
    expect(node.grade).toBe("VERIFIED"); // strongest wins
  });

  it("upsertEdge strengthens weight when a second connector corroborates", () => {
    const g = new MaritimeKnowledgeGraph();
    const nodeInputs = [
      { id: "vessel:imo:1", label: "V", provenance: [{ connectorId: "gfw", sourceName: "GFW", evidenceId: "n1", observedAt: "t", grade: "CORROBORATED" as const }] },
      { id: "company:cac:2", label: "C", provenance: [{ connectorId: "gfw", sourceName: "GFW", evidenceId: "n2", observedAt: "t", grade: "REPORTED" as const }] },
    ];
    g.upsertNode({ ...nodeInputs[0], kind: "vessel" });
    g.upsertNode({ ...nodeInputs[1], kind: "company" });
    const e1 = g.upsertEdge({
      type: "OWNS", fromId: "company:cac:2", toId: "vessel:imo:1",
      explanation: "owner",
      provenance: [{ connectorId: "gfw", sourceName: "GFW", evidenceId: "ownx", observedAt: "2026-06-01T00:00:00.000Z", grade: "REPORTED" }],
    });
    const w1 = e1.weight;
    const e2 = g.upsertEdge({
      type: "OWNS", fromId: "company:cac:2", toId: "vessel:imo:1",
      explanation: "owner",
      provenance: [{ connectorId: "equasis", sourceName: "Equasis", evidenceId: "owny", observedAt: "2026-06-02T00:00:00.000Z", grade: "VERIFIED" }],
    });
    expect(e2.weight).toBeGreaterThan(w1);
    expect(e2.sources).toContain("gfw");
    expect(e2.sources).toContain("equasis");
    expect(e2.grade).toBe("VERIFIED");
    expect(g.size().edges).toBe(1); // merged, not duplicated
  });

  it("refuses edges that reference unknown nodes", () => {
    const g = new MaritimeKnowledgeGraph();
    expect(() =>
      g.upsertEdge({
        type: "OWNS", fromId: "a", toId: "b",
        explanation: "x",
        provenance: [{ connectorId: "gfw", sourceName: "GFW", evidenceId: "e", observedAt: "t", grade: "REPORTED" }],
      }),
    ).toThrow(/unknown node/);
  });
});

describe("MKG — traversal", () => {
  function buildChain() {
    const g = new MaritimeKnowledgeGraph();
    const P = (id: string) => [{
      connectorId: "gfw" as const, sourceName: "GFW",
      evidenceId: `ev-${id}`, observedAt: "2026-06-01T00:00:00.000Z",
      grade: "CORROBORATED" as const,
    }];
    g.upsertNode({ id: "vessel:v1", kind: "vessel", label: "V1", provenance: P("v1") });
    g.upsertNode({ id: "company:c1", kind: "company", label: "Owner Co", provenance: P("c1") });
    g.upsertNode({ id: "person:d1", kind: "person", label: "Director D", provenance: P("d1") });
    g.upsertNode({ id: "port:p1", kind: "port", label: "Port A", provenance: P("p1") });
    g.upsertNode({ id: "cargo:x1", kind: "cargo", label: "Cargo X", provenance: P("x1") });
    g.upsertEdge({ type: "OWNS", fromId: "company:c1", toId: "vessel:v1", explanation: "", provenance: P("e1") });
    g.upsertEdge({ type: "DIRECTOR_OF", fromId: "person:d1", toId: "company:c1", explanation: "", provenance: P("e2") });
    g.upsertEdge({ type: "CALLS_AT", fromId: "vessel:v1", toId: "port:p1", explanation: "", provenance: P("e3") });
    g.upsertEdge({ type: "CARRIED", fromId: "vessel:v1", toId: "cargo:x1", explanation: "", provenance: P("e4") });
    return g;
  }

  it("bounded BFS finds every reachable node within maxDepth", () => {
    const g = buildChain();
    const paths = g.traverse("vessel:v1", { maxDepth: 3 });
    const targets = new Set(paths.map((p) => p.nodeIds[p.nodeIds.length - 1]));
    expect(targets.has("company:c1")).toBe(true);
    expect(targets.has("person:d1")).toBe(true);
    expect(targets.has("port:p1")).toBe(true);
    expect(targets.has("cargo:x1")).toBe(true);
  });

  it("findPaths returns multi-hop paths between two nodes", () => {
    const g = buildChain();
    const paths = g.findPaths("vessel:v1", "person:d1");
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].hops).toBe(2);
    expect(describePath(g, paths[0])).toMatch(/DIRECTOR_OF|OWNS/);
  });
});

describe("MKG — ingestion from Unified Intelligence Package", () => {
  function buildPackage(): { uip: UnifiedIntelligencePackage; ev: NormalizedEvidence[] } {
    const ev: NormalizedEvidence[] = [
      evidence({
        id: "ev-gfw-1", source: "gfw", sourceName: "GFW",
        entity: { kind: "vessel", id: "vessel:mmsi:440825000", label: "DONGWON NO.16" },
        kind: "identity",
        fields: { mmsi: "440825000", flag: "KOR" },
      }),
      evidence({
        id: "ev-eq-1", source: "equasis", sourceName: "Equasis",
        entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
        kind: "ownership",
        grade: "VERIFIED",
        fields: {
          ownerEntityId: "company:cac:RC-100",
          ownerName: "Dongwon Industries",
          managerEntityId: "company:cac:RC-200",
          managerName: "Manager Co",
          flag: "KOR",
        },
      }),
      evidence({
        id: "ev-eq-2", source: "equasis", sourceName: "Equasis",
        entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
        kind: "port-call",
        fields: { portUnlocode: "NGLOS", portName: "Lagos" },
      }),
      evidence({
        id: "ev-sanc-1", source: "opensanctions", sourceName: "OpenSanctions",
        entity: { kind: "company", id: "company:cac:RC-100", label: "Dongwon Industries" },
        kind: "sanctions",
        grade: "VERIFIED",
        fields: { list: "OFAC SDN", match: "listed" },
      }),
    ];
    // Craft a minimal but well-formed UnifiedIntelligencePackage.
    const uip: UnifiedIntelligencePackage = {
      id: "uip_test",
      createdAt: "2026-07-25T00:00:00.000Z",
      fused: {
        id: "fp_test",
        createdAt: "2026-07-25T00:00:00.000Z",
        sourcePackageId: "src",
        canonical: [
          {
            entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
            fields: [], confidence: "HIGH", grade: "VERIFIED", sources: ["gfw", "equasis"],
            explanation: "",
          },
          {
            entity: { kind: "company", id: "company:cac:RC-100", label: "Dongwon Industries" },
            fields: [], confidence: "HIGH", grade: "VERIFIED", sources: ["equasis", "opensanctions"],
            explanation: "",
          },
        ],
        contradictions: [],
        sources: [],
        report: { contradictions: [], evidenceStrength: "HIGH", missing: [], unknowns: [], summary: "" },
        missing: [],
        confidence: "HIGH",
        grade: "VERIFIED",
        stats: { inputRecords: 4, canonicalEntities: 2, contradictions: 0, sourcesQueried: 3, sourcesResponded: 3, averageFreshnessSeconds: 1 },
      },
      identity: [
        {
          canonicalId: "vessel:imo:9438291",
          entityKind: "vessel",
          label: "DONGWON NO.16",
          aliasIds: ["vessel:mmsi:440825000"],
          signals: { imo: "9438291", mmsi: "440825000", callSign: null, name: "DONGWON NO.16", aliases: [], historicalNames: [], flag: "KOR" },
          confidence: { score: 0.95, recommendation: "AUTO_SELECT", topSignal: "imo" } as never,
          evidenceIds: ["ev-gfw-1", "ev-eq-1"],
        },
        {
          canonicalId: "company:cac:RC-100",
          entityKind: "company",
          label: "Dongwon Industries",
          aliasIds: [],
          signals: { imo: null, mmsi: null, callSign: null, name: "Dongwon Industries", aliases: [], historicalNames: [], flag: null },
          confidence: { score: 0.9, recommendation: "AUTO_SELECT", topSignal: "name" } as never,
          evidenceIds: ["ev-eq-1", "ev-sanc-1"],
        },
      ],
      osae: [],
      provenance: [
        { connectorId: "gfw", sourceName: "GFW", records: 1, agreementScore: 1 },
        { connectorId: "equasis", sourceName: "Equasis", records: 2, agreementScore: 1 },
        { connectorId: "opensanctions", sourceName: "OpenSanctions", records: 1, agreementScore: 1 },
      ],
      freshestSeconds: 1,
      hasContradictions: false,
    };
    return { uip, ev };
  }

  it("aggregates evidence from all connectors into one canonical vessel", () => {
    const g = new MaritimeKnowledgeGraph();
    const { uip, ev } = buildPackage();
    const result = ingestUnifiedPackage(g, uip, { evidence: ev });
    expect(result.nodesTouched).toBeGreaterThan(0);
    const vessel = g.getNode("vessel:imo:9438291")!;
    expect(vessel).toBeDefined();
    // Provenance from BOTH gfw and equasis attaches to the merged node.
    const connectors = new Set(vessel.provenance.map((p) => p.connectorId));
    expect(connectors.has("equasis")).toBe(true);
    // Alias node + ALIAS_OF edge exist for the MMSI variant.
    expect(g.getNode("vessel:mmsi:440825000")).toBeDefined();
    const alias = g.neighbors("vessel:imo:9438291").find((n) => n.edge.type === "ALIAS_OF");
    expect(alias).toBeDefined();
  });

  it("mints Vessel→Owner→Sanctions traversal path (multi-hop)", () => {
    const g = new MaritimeKnowledgeGraph();
    const { uip, ev } = buildPackage();
    ingestUnifiedPackage(g, uip, { evidence: ev });
    const paths = g.findPaths("vessel:imo:9438291", "sanction:ofac-sdn");
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].hops).toBe(2);
  });

  it("summariseEntity surfaces every neighbour kind with connector attribution", () => {
    const g = new MaritimeKnowledgeGraph();
    const { uip, ev } = buildPackage();
    ingestUnifiedPackage(g, uip, { evidence: ev });
    const s = summariseEntity(g, "vessel:imo:9438291")!;
    expect(s.owners.length).toBeGreaterThan(0);
    expect(s.ports.length).toBe(1);
    expect(s.connectorsCiting.length).toBeGreaterThan(1);
  });

  it("findHiddenLinks reports the indirect vessel → sanctions link", () => {
    const g = new MaritimeKnowledgeGraph();
    const { uip, ev } = buildPackage();
    ingestUnifiedPackage(g, uip, { evidence: ev });
    const hidden = findHiddenLinks(g, "vessel:imo:9438291", 3);
    expect(hidden.some((h) => h.b === "sanction:ofac-sdn")).toBe(true);
  });

  it("ingestion is idempotent — re-ingesting does not duplicate", () => {
    const g = new MaritimeKnowledgeGraph();
    const { uip, ev } = buildPackage();
    ingestUnifiedPackage(g, uip, { evidence: ev });
    const first = g.size();
    ingestUnifiedPackage(g, uip, { evidence: ev });
    expect(g.size()).toEqual(first);
  });

  it("flags contradictions from the fused package as officer-review candidates", () => {
    const g = new MaritimeKnowledgeGraph();
    const { uip, ev } = buildPackage();
    // Force a contradiction on the fused package.
    const withConflict: UnifiedIntelligencePackage = {
      ...uip,
      hasContradictions: true,
      fused: {
        ...uip.fused,
        contradictions: [
          {
            entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
            field: "flag", severity: "warn",
            values: [], resolution: "unresolved", explanation: "test",
          } as never,
        ],
      },
    };
    ingestUnifiedPackage(g, withConflict, { evidence: ev });
    const conflicts = findConflictingIdentities(g);
    expect(conflicts.some((c) => c.node.id === "vessel:imo:9438291")).toBe(true);
  });
});
