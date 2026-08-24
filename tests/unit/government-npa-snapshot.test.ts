import { describe, expect, it } from "vitest";

import {
  NPA_DATASETS,
  NpaShipposAdapter,
  coverageDays,
  createSnapshot,
  describeDrift,
  describeFailure,
  detectChanges,
  etaChanges,
  etaHistory,
  hasCoverageFor,
  ingest,
  snapshotVesselKey,
  summarizeChanges,
  type NpaDailySnapshot,
  type PortSchedule,
} from "@/services/government";
import type { FetchResult } from "@/services/government";

const SCHEMA = "npa.portschedule.v1";

function rows(over: Record<string, unknown> = {}) {
  return [
    {
      Vessel: "MV ABC",
      "IMO Number": "9074729",
      Terminal: "Apapa",
      ETA: "20/08/2026 16:00",
      Agent: "Acme Shipping",
      Cargo: "Containers",
      Tonnage: "28,730",
      ...over,
    },
  ];
}

function normalize(over: Record<string, unknown> = {}): readonly PortSchedule[] {
  return new NpaShipposAdapter().normalize(rows(over), NPA_DATASETS.expected);
}

function snapshot(records: readonly PortSchedule[], retrievedAt: string): NpaDailySnapshot {
  return createSnapshot({
    dataset: "NPA_VESSELS_EXPECTED",
    source: "npa-shippos",
    sourceUrl: "https://shippos.nigerianports.gov.ng/",
    retrievalMethod: "PUBLIC_EXPORT",
    records,
    sourceTimestamp: null,
    retrievedAt,
    schemaVersion: SCHEMA,
  });
}

function fetchResult(over: Partial<FetchResult<PortSchedule>> = {}): FetchResult<PortSchedule> {
  return {
    sourceId: "npa-shippos",
    datasetId: NPA_DATASETS.expected,
    records: normalize(),
    route: "PUBLIC_EXPORT",
    health: "UP",
    unavailableReason: null,
    sourceTimestamp: null,
    retrievedAt: "2026-08-19T06:00:00.000Z",
    durationMs: 10,
    ...over,
  };
}

/* ───────────────────────── immutability ───────────────────────── */

describe("NpaDailySnapshot", () => {
  it("is frozen — history cannot be edited", () => {
    const snap = snapshot(normalize(), "2026-08-19T06:00:00.000Z");

    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.records)).toBe(true);
    expect(Object.isFrozen(snap.records[0])).toBe(true);
  });

  it("keeps both the raw payload slot and the normalized record", () => {
    // The raw is the evidence: it allows re-normalising past snapshots
    // without re-fetching data that no longer exists upstream.
    const snap = createSnapshot({
      dataset: "NPA_VESSELS_EXPECTED",
      source: "npa-shippos",
      sourceUrl: "https://shippos.nigerianports.gov.ng/",
      retrievalMethod: "PUBLIC_EXPORT",
      records: normalize(),
      rawPayloads: rows(),
      sourceTimestamp: null,
      retrievedAt: "2026-08-19T06:00:00.000Z",
      schemaVersion: SCHEMA,
    });

    expect(snap.records[0].rawPayload).toEqual(rows()[0]);
    expect(snap.records[0].normalizedRecord.vessel.imo).toBe("9074729");
  });

  it("hashes identical content identically, so a re-run is a no-op", () => {
    // One normalise, two snapshots. Calling normalize() twice would stamp
    // two different `retrievedAt` values — which legitimately change the
    // hash — and the resulting failure would be about clock resolution
    // rather than about content.
    const records = normalize();
    const a = snapshot(records, "2026-08-19T06:00:00.000Z");
    const b = snapshot(records, "2026-08-19T18:00:00.000Z");

    expect(a.contentHash).toBe(b.contentHash);
    // Different retrieval times, same content — so the ids differ.
    expect(a.snapshotId).not.toBe(b.snapshotId);
  });

  it("defaults to licence review rather than assuming reuse rights", () => {
    expect(snapshot(normalize(), "2026-08-19T06:00:00.000Z").licenseStatus).toBe("REVIEW_REQUIRED");
  });
});

/* ──────────────────── failure is never a snapshot ───────────────── */

describe("ingestion failure", () => {
  it("refuses to build a snapshot from a failed fetch", () => {
    // The most dangerous bug available here: storing zero records because
    // the source was unreachable, and rendering it as "no vessels".
    const outcome = ingest(
      fetchResult({ health: "NOT_CONFIGURED", records: [], unavailableReason: "No route." }),
      "NPA_VESSELS_EXPECTED",
      null,
      { schemaVersion: SCHEMA },
    );

    expect(outcome.kind).toBe("INGESTION_FAILED");
  });

  it("carries the last successful snapshot so staleness is visible", () => {
    const last = snapshot(normalize(), "2026-08-19T06:00:00.000Z");
    const outcome = ingest(
      fetchResult({ health: "DOWN", records: [], unavailableReason: "HTTP 502" }),
      "NPA_VESSELS_EXPECTED",
      last,
      { schemaVersion: SCHEMA },
    );

    expect(outcome.kind).toBe("INGESTION_FAILED");
    if (outcome.kind !== "INGESTION_FAILED") return;
    expect(outcome.lastSuccessfulSnapshot?.snapshotDate).toBe("2026-08-19");
    expect(describeFailure(outcome)).toMatch(/NPA data unavailable — last successful snapshot/);
  });

  it("never describes a failure as an absence of vessels", () => {
    const outcome = ingest(
      fetchResult({ health: "DOWN", records: [], unavailableReason: "timeout" }),
      "NPA_VESSELS_EXPECTED",
      null,
      { schemaVersion: SCHEMA },
    );
    if (outcome.kind !== "INGESTION_FAILED") throw new Error("expected failure");

    expect(describeFailure(outcome)).not.toMatch(/no vessels/i);
    expect(describeFailure(outcome)).toMatch(/unavailable/i);
  });

  it("distinguishes an empty schedule from an outage", () => {
    // Zero records from a healthy source is a real observation.
    const outcome = ingest(
      fetchResult({ records: [], health: "UP", unavailableReason: null }),
      "NPA_VESSELS_EXPECTED",
      null,
      { schemaVersion: SCHEMA },
    );

    expect(outcome.kind).toBe("SNAPSHOT");
    if (outcome.kind !== "SNAPSHOT") return;
    expect(outcome.snapshot.recordCount).toBe(0);
  });

  it("builds a snapshot from a healthy fetch", () => {
    const outcome = ingest(fetchResult(), "NPA_VESSELS_EXPECTED", null, {
      schemaVersion: SCHEMA,
    });

    expect(outcome.kind).toBe("SNAPSHOT");
    if (outcome.kind !== "SNAPSHOT") return;
    expect(outcome.snapshot.recordCount).toBe(1);
    expect(outcome.snapshot.retrievalMethod).toBe("PUBLIC_EXPORT");
  });
});

/* ────────────────────── vessel identity ─────────────────────────── */

describe("cross-snapshot vessel identity", () => {
  it("prefers IMO", () => {
    expect(snapshotVesselKey(normalize()[0])).toBe("imo:9074729");
  });

  it("falls back to name scoped by terminal", () => {
    const [record] = normalize({ "IMO Number": "" });
    expect(snapshotVesselKey(record)).toBe("name:mv abc|terminal:apapa");
  });

  it("treats a near-miss name as a different vessel", () => {
    const [a] = normalize({ "IMO Number": "", Vessel: "MV ABC" });
    const [b] = normalize({ "IMO Number": "", Vessel: "MV ABCD" });
    expect(snapshotVesselKey(a)).not.toBe(snapshotVesselKey(b));
  });
});

/* ────────────────────── change detection ────────────────────────── */

describe("NpaChangeDetectionService", () => {
  const day19 = snapshot(normalize(), "2026-08-19T06:00:00.000Z");

  it("reports nothing when the content is unchanged", () => {
    const day20 = snapshot(normalize(), "2026-08-20T06:00:00.000Z");
    expect(detectChanges(day19, day20)).toEqual([]);
  });

  it("detects an ETA change with both values retained", () => {
    const day20 = snapshot(normalize({ ETA: "20/08/2026 18:30" }), "2026-08-20T06:00:00.000Z");
    const [change] = detectChanges(day19, day20);

    expect(change.type).toBe("ETA_CHANGED");
    expect(change.oldValue).toBe("2026-08-20T16:00:00.000Z");
    expect(change.newValue).toBe("2026-08-20T18:30:00.000Z");
    expect(change.previousSnapshot).toBe(day19.snapshotId);
    expect(change.currentSnapshot).toBe(day20.snapshotId);
  });

  it("detects a new vessel", () => {
    const day20 = snapshot(
      [...normalize(), ...normalize({ Vessel: "MV XYZ", "IMO Number": "9319466" })],
      "2026-08-20T06:00:00.000Z",
    );
    const changes = detectChanges(day19, day20);

    expect(changes.map((c) => c.type)).toContain("NEW_VESSEL");
  });

  it("states a removal as an observation, not a departure", () => {
    // A vessel leaving the list may have arrived, or the schedule may
    // have been revised. The engine does not guess.
    const day20 = snapshot([], "2026-08-20T06:00:00.000Z");
    const [change] = detectChanges(day19, day20);

    expect(change.type).toBe("REMOVED_VESSEL");
    expect(change.detail).toMatch(
      /may mean the vessel progressed, or that the schedule was revised/,
    );
  });

  it("detects terminal, agent, cargo and tonnage changes", () => {
    const day20 = snapshot(
      normalize({ Terminal: "Tin Can", Agent: "Beta Ltd", Cargo: "Bulk", Tonnage: "31,000" }),
      "2026-08-20T06:00:00.000Z",
    );
    const types = detectChanges(day19, day20).map((c) => c.type);

    expect(types).toContain("TERMINAL_CHANGED");
    expect(types).toContain("AGENT_CHANGED");
    expect(types).toContain("CARGO_CHANGED");
    expect(types).toContain("TONNAGE_CHANGED");
  });

  it("does not report first-time enrichment as a change", () => {
    // "Agent: null → Acme" would bury the real changes.
    const sparse = snapshot(normalize({ Agent: "" }), "2026-08-19T06:00:00.000Z");
    const enriched = snapshot(normalize(), "2026-08-20T06:00:00.000Z");

    expect(detectChanges(sparse, enriched).map((c) => c.type)).not.toContain("AGENT_CHANGED");
  });

  it("flags a length change as a data-quality signal", () => {
    // A vessel's length does not change; this means bad data or a
    // conflated identity.
    const a = snapshot(normalize({ Length: "180" }), "2026-08-19T06:00:00.000Z");
    const b = snapshot(normalize({ Length: "220" }), "2026-08-20T06:00:00.000Z");
    const [change] = detectChanges(a, b);

    expect(change.type).toBe("VESSEL_DIMENSION_CHANGED");
    expect(change.detail).toMatch(/does not change; treat as a data-quality signal/);
  });

  it("refuses to diff two different datasets", () => {
    const atBerth = createSnapshot({
      dataset: "NPA_AT_BERTH",
      source: "npa-shippos",
      sourceUrl: "https://shippos.nigerianports.gov.ng/",
      retrievalMethod: "PUBLIC_EXPORT",
      records: normalize(),
      sourceTimestamp: null,
      retrievedAt: "2026-08-20T06:00:00.000Z",
      schemaVersion: SCHEMA,
    });

    expect(() => detectChanges(day19, atBerth)).toThrow(/same dataset/);
  });

  it("summarises changes by type for triage", () => {
    const day20 = snapshot(
      [
        ...normalize({ ETA: "20/08/2026 18:30" }),
        ...normalize({ Vessel: "MV XYZ", "IMO Number": "9319466" }),
      ],
      "2026-08-20T06:00:00.000Z",
    );
    const summary = summarizeChanges(detectChanges(day19, day20));

    expect(summary.length).toBeGreaterThan(0);
    expect(summary.reduce((n, s) => n + s.count, 0)).toBeGreaterThan(1);
  });
});

/* ─────────────────────────── ETA history ─────────────────────────── */

describe("ETA history", () => {
  const snapshots = [
    snapshot(normalize({ ETA: "20/08/2026 16:00" }), "2026-08-19T06:00:00.000Z"),
    snapshot(normalize({ ETA: "20/08/2026 17:20" }), "2026-08-20T06:00:00.000Z"),
    snapshot(normalize({ ETA: "20/08/2026 18:30" }), "2026-08-20T18:00:00.000Z"),
  ];

  it("reconstructs every revision without overwriting", () => {
    const history = etaHistory(snapshots, "imo:9074729");

    expect(history?.points).toHaveLength(3);
    expect(history?.revisions).toBe(2);
    expect(history?.points.map((p) => p.eta)).toEqual([
      "2026-08-20T16:00:00.000Z",
      "2026-08-20T17:20:00.000Z",
      "2026-08-20T18:30:00.000Z",
    ]);
  });

  it("computes the net drift", () => {
    const history = etaHistory(snapshots, "imo:9074729");
    expect(history?.netDriftMs).toBe(2.5 * 3_600_000);
    expect(describeDrift(history!.netDriftMs)).toBe("+2h 30m");
  });

  it("records the step between consecutive observations", () => {
    const history = etaHistory(snapshots, "imo:9074729");
    expect(history?.points[0].deltaMs).toBeNull();
    expect(history?.points[1].deltaMs).toBe(80 * 60_000);
  });

  it("ignores a repeated identical ETA", () => {
    const repeated = [
      snapshot(normalize(), "2026-08-19T06:00:00.000Z"),
      snapshot(normalize(), "2026-08-20T06:00:00.000Z"),
    ];
    expect(etaHistory(repeated, "imo:9074729")?.revisions).toBe(0);
  });

  it("returns null for a vessel that never carried an ETA", () => {
    expect(etaHistory(snapshots, "imo:9999999")).toBeNull();
  });

  it("describes an earlier ETA as negative drift", () => {
    expect(describeDrift(-45 * 60_000)).toBe("−45m");
  });

  it("filters changes to ETA revisions for the Copilot question", () => {
    const changes = detectChanges(snapshots[0], snapshots[1]);
    expect(etaChanges(changes)).toHaveLength(1);
  });
});

/* ──────────────────────── coverage gating ───────────────────────── */

describe("historical coverage", () => {
  const snapshots = [
    snapshot(normalize(), "2026-08-19T06:00:00.000Z"),
    snapshot(normalize(), "2026-08-20T06:00:00.000Z"),
    snapshot(normalize(), "2026-08-21T06:00:00.000Z"),
  ];

  it("counts distinct days, not retrievals", () => {
    const twiceDaily = [...snapshots, snapshot(normalize(), "2026-08-21T18:00:00.000Z")];
    expect(coverageDays(twiceDaily)).toBe(3);
  });

  it("withholds a 90-day window until 90 days exist", () => {
    // A "90-day average" over three days is a fabricated statistic
    // wearing a real label.
    const coverage = hasCoverageFor(snapshots, 90);

    expect(coverage.sufficient).toBe(false);
    expect(coverage.have).toBe(3);
    expect(coverage.need).toBe(90);
  });

  it("permits a window the data supports", () => {
    expect(hasCoverageFor(snapshots, 3).sufficient).toBe(true);
  });
});
