/**
 * AIS timeline follow-up tests.
 *
 * The Copilot's AIS Replay / "show AIS timeline" follow-up is powered by the
 * IFE field timeline built from normalized AIS position records. These tests
 * pin the guarantees that the OIE relies on when it narrates the timeline:
 *
 *   1. Records are ordered strictly newest → oldest regardless of insertion
 *      order.
 *   2. Duplicate AIS pings (same value at same instant, or byte-identical
 *      records replayed twice) are handled without crashing and do not
 *      corrupt the latest/previous/historical progression.
 *   3. Missing AIS data — no records at all, or records missing the position
 *      field — degrades safely (LOW confidence, missing kinds propagated,
 *      no thrown exceptions).
 *   4. Malformed / unparseable observedAt timestamps do not break sorting.
 */
import { describe, expect, it } from "vitest";

import type { ConnectorId, EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import { fuseEvidence } from "../";

type MakeOpts = {
  source: ConnectorId;
  grade?: EvidenceGrade;
  entityId?: string;
  fields: NormalizedEvidence["fields"];
  observedAt?: string;
  id?: string;
  hash?: string;
};

let seq = 0;
function makeAis(o: MakeOpts): NormalizedEvidence {
  seq += 1;
  const observedAt = o.observedAt ?? "2026-07-20T00:00:00Z";
  return {
    id: o.id ?? `ev_${seq}`,
    source: o.source,
    sourceName: o.source,
    grade: o.grade ?? "OBSERVED",
    entity: {
      kind: "vessel",
      id: o.entityId ?? "vessel:imo:9438291",
      label: "MV Ocean Pearl",
    },
    kind: "position",
    fields: o.fields,
    observedAt,
    retrievedAt: observedAt,
    freshnessSeconds: 3600,
    hash: o.hash ?? `h_${seq}`,
    providerRecordId: `p_${seq}`,
  };
}

function positionTimeline(records: NormalizedEvidence[]) {
  const fused = fuseEvidence({ records });
  const canonical = fused.canonical[0];
  const positionField = canonical?.fields.find((f) => f.field === "position");
  return { fused, timeline: positionField?.timeline ?? [] };
}

describe("AIS timeline: chronological ordering", () => {
  it("orders records newest → oldest even when supplied out of order", () => {
    const records = [
      makeAis({
        source: "ais",
        fields: { position: "6.1N,3.1E" },
        observedAt: "2026-07-20T02:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T10:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.2N,3.2E" },
        observedAt: "2026-07-20T06:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.0N,3.0E" },
        observedAt: "2026-07-19T22:00:00Z",
      }),
    ];
    const { timeline } = positionTimeline(records);

    // Must be strictly descending by observedAt.
    const timestamps = timeline.map((t) => Date.parse(t.observedAt));
    const sortedDesc = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sortedDesc);

    // Newest observedAt is always at index 0 regardless of which value wins fusion.
    expect(timeline[0].observedAt).toBe("2026-07-20T10:00:00Z");
    expect(timeline[timeline.length - 1].observedAt).toBe("2026-07-19T22:00:00Z");
  });

  it("assigns latest / previous / historical to the winning value in time order", () => {
    // Same winning position observed three times — should progress
    // latest → previous → historical, newest first.
    const records = [
      makeAis({
        source: "ais",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T08:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T06:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T04:00:00Z",
      }),
    ];
    const { timeline } = positionTimeline(records);
    const winning = timeline.filter((t) => t.status !== "superseded");
    expect(winning.map((t) => t.status)).toEqual(["latest", "previous", "historical"]);
    expect(winning.map((t) => t.observedAt)).toEqual([
      "2026-07-20T08:00:00Z",
      "2026-07-20T06:00:00Z",
      "2026-07-20T04:00:00Z",
    ]);
  });
});

describe("AIS timeline: duplicate messages", () => {
  it("does not crash when the exact same AIS ping is replayed twice", () => {
    const dup = makeAis({
      source: "ais",
      fields: { position: "6.4N,3.4E" },
      observedAt: "2026-07-20T08:00:00Z",
      id: "ev_dup",
      hash: "hash_dup",
    });
    const records = [dup, { ...dup }];
    expect(() => fuseEvidence({ records })).not.toThrow();
    const { timeline } = positionTimeline(records);
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].status).toBe("latest");
    // The duplicate must not overwrite `latest` with `superseded`.
    const latestEntries = timeline.filter((t) => t.status === "latest");
    expect(latestEntries).toHaveLength(1);
  });

  it("keeps a single canonical latest value when two providers report the same position at the same time", () => {
    const records = [
      makeAis({
        source: "ais",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T08:00:00Z",
      }),
      makeAis({
        source: "marinetraffic",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T08:00:00Z",
      }),
    ];
    const { fused, timeline } = positionTimeline(records);
    expect(fused.canonical).toHaveLength(1);
    const latest = timeline.filter((t) => t.status === "latest");
    expect(latest).toHaveLength(1);
    // Both sources should back the canonical value.
    const posField = fused.canonical[0].fields.find((f) => f.field === "position")!;
    expect(posField.supportingSources.slice().sort()).toEqual(["ais", "marinetraffic"]);
  });
});

describe("AIS timeline: missing messages", () => {
  it("degrades safely when no AIS records are returned", () => {
    const fused = fuseEvidence({ records: [], missing: ["position"] });
    expect(fused.canonical).toHaveLength(0);
    expect(fused.report.missing).toContain("position");
    expect(fused.confidence).toBe("LOW");
  });

  it("does not throw when an AIS record has no position field", () => {
    const records = [
      makeAis({
        source: "ais",
        fields: { speedKn: 11.2 }, // position missing
        observedAt: "2026-07-20T08:00:00Z",
      }),
    ];
    expect(() => fuseEvidence({ records })).not.toThrow();
    const { timeline } = positionTimeline(records);
    // There is no `position` field for this record, so the position timeline
    // is empty — but the pipeline must still succeed.
    expect(timeline).toEqual([]);
  });

  it("still produces an ordered timeline when only some records carry position", () => {
    const records = [
      makeAis({
        source: "ais",
        fields: { speedKn: 10 },
        observedAt: "2026-07-20T09:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T08:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.3N,3.3E" },
        observedAt: "2026-07-20T06:00:00Z",
      }),
    ];
    const { timeline } = positionTimeline(records);
    expect(timeline.length).toBe(2);
    expect(timeline[0].observedAt).toBe("2026-07-20T08:00:00Z");
    expect(timeline[1].observedAt).toBe("2026-07-20T06:00:00Z");
  });
});

describe("AIS timeline: malformed timestamps", () => {
  it("does not crash when observedAt is unparseable", () => {
    const records = [
      makeAis({
        source: "ais",
        fields: { position: "6.4N,3.4E" },
        observedAt: "2026-07-20T08:00:00Z",
      }),
      makeAis({
        source: "ais",
        fields: { position: "6.3N,3.3E" },
        observedAt: "not-a-real-timestamp",
      }),
    ];
    expect(() => fuseEvidence({ records })).not.toThrow();
    const { timeline } = positionTimeline(records);
    // Valid timestamp must still be recognised as the newest entry.
    expect(timeline[0].observedAt).toBe("2026-07-20T08:00:00Z");
  });
});
