import { describe, expect, it } from "vitest";

import type { NormalizedEvidence, ConnectorId, EvidenceGrade } from "@/services/ial/types";
import { fuseEvidence } from "../";

type MakeOpts = {
  source: ConnectorId;
  sourceName?: string;
  grade?: EvidenceGrade;
  entityId?: string;
  entityKind?: NormalizedEvidence["entity"]["kind"];
  fields: Record<string, NormalizedEvidence["fields"][string]>;
  observedAt?: string;
  freshnessSeconds?: number;
  id?: string;
};

let seq = 0;
function make(o: MakeOpts): NormalizedEvidence {
  seq += 1;
  const observedAt = o.observedAt ?? "2026-07-20T00:00:00Z";
  return {
    id: o.id ?? `ev_${seq}`,
    source: o.source,
    sourceName: o.sourceName ?? o.source,
    grade: o.grade ?? "OBSERVED",
    entity: {
      kind: o.entityKind ?? "vessel",
      id: o.entityId ?? "vessel:imo:9438291",
      label: "MV Ocean Pearl",
    },
    kind: "identity",
    fields: o.fields,
    observedAt,
    retrievedAt: observedAt,
    freshnessSeconds: o.freshnessSeconds ?? 3600,
    hash: `h_${seq}`,
    providerRecordId: `p_${seq}`,
  };
}

describe("IFE: agreement", () => {
  it("returns one canonical record when three providers agree", () => {
    const records = [
      make({ source: "ais", fields: { flag: "PA", name: "MV Ocean Pearl" } }),
      make({ source: "marinetraffic", fields: { flag: "PA", name: "MV Ocean Pearl" } }),
      make({ source: "equasis", fields: { flag: "PA", name: "MV Ocean Pearl" }, grade: "VERIFIED" }),
    ];
    const fused = fuseEvidence({ records });
    expect(fused.canonical).toHaveLength(1);
    expect(fused.contradictions).toHaveLength(0);
    expect(fused.confidence).toBe("HIGH");
    const flag = fused.canonical[0].fields.find((f) => f.field === "flag")!;
    expect(flag.value).toBe("PA");
    expect(flag.supportingSources.slice().sort()).toEqual(["ais", "equasis", "marinetraffic"]);
    expect(flag.dissentingSources).toHaveLength(0);
  });

  it("boosts to CORROBORATED when 2+ providers agree on OBSERVED evidence", () => {
    const records = [
      make({ source: "ais", grade: "OBSERVED", fields: { destination: "NGLOS" } }),
      make({ source: "marinetraffic", grade: "OBSERVED", fields: { destination: "NGLOS" } }),
    ];
    const fused = fuseEvidence({ records });
    const dest = fused.canonical[0].fields.find((f) => f.field === "destination")!;
    expect(dest.grade).toBe("CORROBORATED");
    expect(dest.confidence).toBe("HIGH");
  });
});

describe("IFE: disagreement", () => {
  it("surfaces contradictions when providers disagree, never overwrites silently", () => {
    const records = [
      make({ source: "ais", fields: { owner: "OceanLine SA" } }),
      make({ source: "marinetraffic", fields: { owner: "Blue Horizon Ltd" } }),
    ];
    const fused = fuseEvidence({ records });
    expect(fused.contradictions).toHaveLength(1);
    const c = fused.contradictions[0];
    expect(c.field).toBe("owner");
    expect(c.values.filter((v) => v.accepted)).toHaveLength(1);
    expect(c.values.filter((v) => !v.accepted)).toHaveLength(1);
    expect(fused.report.contradictions).toHaveLength(1);
    expect(fused.confidence).toBe("LOW");
  });

  it("prefers official government/regulator data over commercial", () => {
    const records = [
      make({ source: "ais", fields: { flag: "LR" } }),
      make({ source: "marinetraffic", fields: { flag: "LR" } }),
      make({ source: "imo-gisis", grade: "VERIFIED", fields: { flag: "PA" } }),
    ];
    const fused = fuseEvidence({ records });
    const flag = fused.canonical[0].fields.find((f) => f.field === "flag")!;
    expect(flag.value).toBe("PA");
    expect(flag.supportingSources).toContain("imo-gisis");
    expect(flag.dissentingSources.slice().sort()).toEqual(["ais", "marinetraffic"]);
    expect(fused.contradictions[0].resolution).toBe("official-source-preferred");
  });

  it("marks confidence LOW when three providers disagree three ways", () => {
    const records = [
      make({ source: "ais", fields: { destination: "NGLOS" } }),
      make({ source: "marinetraffic", fields: { destination: "GHTKD" } }),
      make({ source: "gfw", fields: { destination: "CILOM" } }),
    ];
    const fused = fuseEvidence({ records });
    expect(fused.confidence).toBe("LOW");
    expect(fused.contradictions[0].resolution).toBe("highest-authority");
    expect(fused.contradictions[0].values).toHaveLength(3);
  });

  it("majority agreement wins when 2 of 3 commercial providers agree", () => {
    const records = [
      make({ source: "ais", fields: { draught: 12.5 } }),
      make({ source: "marinetraffic", fields: { draught: 12.5 } }),
      make({ source: "gfw", fields: { draught: 9.8 } }),
    ];
    const fused = fuseEvidence({ records });
    const draught = fused.canonical[0].fields.find((f) => f.field === "draught")!;
    expect(draught.value).toBe(12.5);
    expect(fused.contradictions[0].resolution).toBe("majority-agreement");
    expect(draught.confidence).toBe("MEDIUM");
  });
});

describe("IFE: canonical record", () => {
  it("produces exactly one canonical record per entity even with N providers", () => {
    const records = [
      make({ source: "ais", fields: { name: "MV Ocean Pearl" } }),
      make({ source: "marinetraffic", fields: { name: "MV Ocean Pearl" } }),
      make({ source: "equasis", fields: { name: "MV Ocean Pearl" } }),
      make({ source: "imo-gisis", fields: { name: "MV Ocean Pearl" } }),
      make({
        source: "ais",
        entityId: "vessel:imo:9111222",
        fields: { name: "MV Second Vessel" },
      }),
    ];
    const fused = fuseEvidence({ records });
    expect(fused.canonical).toHaveLength(2);
    const pearl = fused.canonical.find((r) => r.entity.id === "vessel:imo:9438291")!;
    expect(pearl.fields.find((f) => f.field === "name")!.supportingSources).toHaveLength(4);
  });
});

describe("IFE: timeline", () => {
  it("marks latest / previous / superseded on the field timeline", () => {
    const records = [
      make({ source: "ais", fields: { position: "6.4N,3.4E" }, observedAt: "2026-07-20T08:00:00Z" }),
      make({ source: "ais", fields: { position: "6.4N,3.4E" }, observedAt: "2026-07-20T06:00:00Z" }),
      make({
        source: "marinetraffic",
        fields: { position: "6.3N,3.5E" },
        observedAt: "2026-07-19T22:00:00Z",
      }),
    ];
    const fused = fuseEvidence({ records });
    const pos = fused.canonical[0].fields.find((f) => f.field === "position")!;
    expect(pos.timeline[0].status).toBe("latest");
    expect(pos.timeline.some((t) => t.status === "previous")).toBe(true);
    expect(pos.timeline.some((t) => t.status === "superseded")).toBe(true);
  });
});

describe("IFE: missing evidence", () => {
  it("propagates missing kinds and produces LOW confidence with no records", () => {
    const fused = fuseEvidence({ records: [], missing: ["position", "ownership"] });
    expect(fused.canonical).toHaveLength(0);
    expect(fused.report.missing).toEqual(["position", "ownership"]);
    expect(fused.confidence).toBe("LOW");
  });
});

describe("IFE: source ranking", () => {
  it("computes an agreement score per source", () => {
    const records = [
      make({ source: "ais", fields: { flag: "PA" } }),
      make({ source: "marinetraffic", fields: { flag: "PA" } }),
      make({ source: "gfw", fields: { flag: "LR" } }),
    ];
    const fused = fuseEvidence({ records });
    const ais = fused.sources.find((s) => s.connectorId === "ais")!;
    const gfw = fused.sources.find((s) => s.connectorId === "gfw")!;
    expect(ais.agreementScore).toBe(1);
    expect(gfw.agreementScore).toBe(0);
  });
});

describe("IFE: OIE receives exactly one package", () => {
  it("summarises input records, entities, and contradictions", () => {
    const records = [
      make({ source: "ais", fields: { flag: "PA" } }),
      make({ source: "marinetraffic", fields: { flag: "PA" } }),
      make({ source: "gfw", fields: { flag: "LR" } }),
    ];
    const fused = fuseEvidence({ records });
    expect(fused.stats.inputRecords).toBe(3);
    expect(fused.stats.canonicalEntities).toBe(1);
    expect(fused.stats.contradictions).toBeGreaterThanOrEqual(1);
    expect(fused.stats.sourcesQueried).toBe(3);
  });
});
