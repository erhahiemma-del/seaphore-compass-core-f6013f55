/**
 * Sprint 1D — Unified Intelligence Package tests.
 *
 * Golden Rule: One entity, one fused view, many sources, zero duplicates.
 */
import { describe, expect, it } from "vitest";

import type { ConnectorId, NormalizedEvidence } from "@/services/ial/types";
import { buildUnifiedIntelligencePackage, resolveIdentities } from "../";
import type { OsaeAssessment } from "@/services/osae";

let seq = 0;
function ev(o: {
  source: ConnectorId;
  entityId: string;
  entityKind?: NormalizedEvidence["entity"]["kind"];
  label?: string;
  fields: Record<string, NormalizedEvidence["fields"][string]>;
  grade?: NormalizedEvidence["grade"];
}): NormalizedEvidence {
  seq += 1;
  const now = "2026-07-25T00:00:00Z";
  return {
    id: `ev_${seq}`,
    source: o.source,
    sourceName: o.source,
    grade: o.grade ?? "OBSERVED",
    entity: { kind: o.entityKind ?? "vessel", id: o.entityId, label: o.label },
    kind: "identity",
    fields: o.fields,
    observedAt: now,
    retrievedAt: now,
    freshnessSeconds: 3600,
    hash: `h_${seq}`,
  };
}

describe("resolveIdentities (cross-connector merge)", () => {
  it("merges records that share an IMO but use different entity id schemes", () => {
    const records = [
      ev({ source: "gfw", entityId: "vessel:mmsi:440825000", label: "DONGWON NO.16",
           fields: { name: "DONGWON NO.16", imo: "9438291", mmsi: "440825000" } }),
      ev({ source: "equasis", entityId: "vessel:imo:9438291", label: "Dongwon 16",
           fields: { name: "Dongwon 16", imo: "9438291", flag: "KR" } }),
    ];
    const { records: out, clusters } = resolveIdentities(records);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].canonicalId).toBe("vessel:imo:9438291");
    expect(clusters[0].aliasIds).toContain("vessel:mmsi:440825000");
    expect(new Set(out.map((r) => r.entity.id))).toEqual(new Set(["vessel:imo:9438291"]));
    expect(clusters[0].confidence.score).toBeGreaterThanOrEqual(70);
  });

  it("does NOT merge vessels with conflicting IMOs even if names look similar", () => {
    const records = [
      ev({ source: "gfw", entityId: "vessel:imo:1111111", label: "Ocean Pearl",
           fields: { name: "Ocean Pearl", imo: "1111111" } }),
      ev({ source: "equasis", entityId: "vessel:imo:2222222", label: "Ocean Pearl",
           fields: { name: "Ocean Pearl", imo: "2222222" } }),
    ];
    const { clusters } = resolveIdentities(records);
    expect(clusters).toHaveLength(2);
  });

  it("merges on fuzzy name when no conflicting strong identifier exists", () => {
    const records = [
      ev({ source: "gfw", entityId: "vessel:name:mv-ocean-pearl", label: "MV Ocean Pearl",
           fields: { name: "MV Ocean Pearl" } }),
      ev({ source: "opensanctions", entityId: "vessel:name:ocean-pearl", label: "Ocean Pearl",
           fields: { name: "Ocean Pearl" } }),
    ];
    const { clusters } = resolveIdentities(records);
    expect(clusters).toHaveLength(1);
  });

  it("leaves non-mergeable kinds (ports) untouched", () => {
    const records = [
      ev({ source: "customs", entityId: "port:unlocode:NGLOS", entityKind: "port",
           fields: { unlocode: "NGLOS" } }),
    ];
    const { records: out, clusters } = resolveIdentities(records);
    expect(clusters).toHaveLength(1);
    expect(out[0].entity.id).toBe("port:unlocode:NGLOS");
  });
});

describe("buildUnifiedIntelligencePackage", () => {
  it("produces one canonical record per entity across multiple connectors", () => {
    const records = [
      ev({ source: "gfw", entityId: "vessel:mmsi:440825000",
           fields: { name: "DONGWON NO.16", imo: "9438291", mmsi: "440825000" } }),
      ev({ source: "equasis", entityId: "vessel:imo:9438291",
           fields: { name: "Dongwon 16", imo: "9438291", flag: "KR" } }),
      ev({ source: "opensanctions", entityId: "vessel:imo:9438291",
           fields: { name: "DONGWON NO.16", sanctioned: false } }),
    ];
    const pkg = buildUnifiedIntelligencePackage({ input: { records } });
    expect(pkg.fused.canonical).toHaveLength(1);
    expect(pkg.fused.canonical[0].entity.id).toBe("vessel:imo:9438291");
    expect(pkg.identity).toHaveLength(1);
    expect(pkg.identity[0].signals.imo).toBe("9438291");
    expect(pkg.identity[0].signals.mmsi).toBe("440825000");
  });

  it("surfaces conflicting values instead of silently overwriting", () => {
    const records = [
      ev({ source: "gfw", entityId: "vessel:imo:9438291", grade: "OBSERVED",
           fields: { name: "DONGWON NO.16", flag: "KR" } }),
      ev({ source: "equasis", entityId: "vessel:imo:9438291", grade: "VERIFIED",
           fields: { name: "DONGWON NO.16", flag: "PA" } }),
    ];
    const pkg = buildUnifiedIntelligencePackage({ input: { records } });
    expect(pkg.hasContradictions).toBe(true);
    const flagContradiction = pkg.fused.contradictions.find((c) => c.field === "flag");
    expect(flagContradiction).toBeTruthy();
    expect(flagContradiction!.values.map((v) => v.source).sort()).toEqual(["equasis", "gfw"]);
  });

  it("attaches OSAE assessment to the resolved canonical entity id", () => {
    const records = [
      ev({ source: "gfw", entityId: "vessel:mmsi:440825000",
           fields: { name: "DONGWON NO.16", imo: "9438291", mmsi: "440825000" } }),
      ev({ source: "equasis", entityId: "vessel:imo:9438291",
           fields: { name: "Dongwon 16", imo: "9438291" } }),
    ];
    const assessment: OsaeAssessment = {
      vesselId: "vessel:mmsi:440825000", // connector produced with MMSI
      priority: "urgent",
      summary: "AIS gap detected.",
      evidence: [],
      producedAt: "2026-07-25T00:00:00Z",
    };
    const pkg = buildUnifiedIntelligencePackage({
      input: { records },
      osaeAssessments: [assessment],
    });
    expect(pkg.osae).toHaveLength(1);
    expect(pkg.osae[0].entityId).toBe("vessel:imo:9438291"); // remapped to canonical
    expect(pkg.osae[0].assessment.priority).toBe("urgent");
  });

  it("preserves full source attribution and agreement scores", () => {
    const records = [
      ev({ source: "gfw", entityId: "vessel:imo:9438291", fields: { name: "DONGWON NO.16" } }),
      ev({ source: "equasis", entityId: "vessel:imo:9438291", fields: { name: "DONGWON NO.16" } }),
    ];
    const pkg = buildUnifiedIntelligencePackage({ input: { records } });
    const providers = pkg.provenance.map((p) => p.connectorId).sort();
    expect(providers).toEqual(["equasis", "gfw"]);
    for (const p of pkg.provenance) {
      expect(p.agreementScore).toBeGreaterThan(0);
    }
  });

  it("handles empty input gracefully", () => {
    const pkg = buildUnifiedIntelligencePackage({ input: { records: [] } });
    expect(pkg.fused.canonical).toHaveLength(0);
    expect(pkg.identity).toHaveLength(0);
    expect(pkg.osae).toHaveLength(0);
    expect(pkg.hasContradictions).toBe(false);
  });
});
