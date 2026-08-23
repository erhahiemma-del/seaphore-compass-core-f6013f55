import { describe, expect, it } from "vitest";

import { validateBatch, validateObservation, type Vessel } from "@/services/geospatial";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

function vessel(overrides: Partial<Vessel> = {}): Vessel {
  return {
    identity: { imo: "9411765", mmsi: "657123456", name: "MV Test" },
    position: {
      lon: 4.1,
      lat: 5.2,
      heading: 145,
      speed: 8.4,
      timestamp: new Date(NOW - 60_000).toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    confidence: 0.6,
    ...overrides,
  };
}

function position(overrides: Partial<Vessel["position"]>): Partial<Vessel> {
  return { position: { ...vessel().position, ...overrides } };
}

describe("validateObservation — accepted", () => {
  it("accepts a complete, recent observation", () => {
    const result = validateObservation(vessel(), { now: NOW });

    expect(result.verdict).toBe("accepted");
    expect(result.reasons).toEqual([]);
    expect(result.vessel).not.toBeNull();
  });
});

describe("validateObservation — rejections", () => {
  it("rejects a missing position", () => {
    const result = validateObservation(
      { ...vessel(), position: undefined as unknown as Vessel["position"] },
      { now: NOW },
    );

    expect(result.verdict).toBe("rejected");
    expect(result.vessel).toBeNull();
    expect(result.reasons.map((r) => r.code)).toContain("missing-coordinates");
  });

  it("rejects a non-finite coordinate", () => {
    const result = validateObservation(vessel(position({ lat: Number.NaN })), { now: NOW });

    expect(result.verdict).toBe("rejected");
    expect(result.reasons.map((r) => r.code)).toContain("invalid-coordinates");
  });

  it("rejects an out-of-range coordinate", () => {
    const result = validateObservation(vessel(position({ lat: 91 })), { now: NOW });

    expect(result.verdict).toBe("rejected");
    expect(result.reasons.map((r) => r.code)).toContain("invalid-coordinates");
  });

  it("rejects an unparseable timestamp", () => {
    const result = validateObservation(vessel(position({ timestamp: "nope" })), { now: NOW });

    expect(result.verdict).toBe("rejected");
    expect(result.reasons.map((r) => r.code)).toContain("invalid-timestamp");
  });

  it("rejects an observation older than the maximum age", () => {
    const result = validateObservation(
      vessel(position({ timestamp: new Date(NOW - 30 * 86_400_000).toISOString() })),
      { now: NOW },
    );

    expect(result.verdict).toBe("rejected");
    expect(result.reasons.map((r) => r.code)).toContain("position-too-old");
  });

  it("rejects an observation with no identity at all", () => {
    const result = validateObservation(
      { ...vessel(), identity: { imo: "", name: "x" } },
      { now: NOW },
    );

    expect(result.verdict).toBe("rejected");
    expect(result.reasons.map((r) => r.code)).toContain("missing-identity");
  });

  it("rejects a duplicate against the seen set", () => {
    const result = validateObservation(vessel(), { now: NOW, seen: new Set(["9411765"]) });

    expect(result.verdict).toBe("rejected");
    expect(result.reasons.map((r) => r.code)).toContain("duplicate-observation");
  });

  it("rejects confidence below an explicit floor", () => {
    const result = validateObservation(vessel({ confidence: 0.1 }), {
      now: NOW,
      minConfidence: 0.3,
    });

    expect(result.verdict).toBe("rejected");
    expect(result.reasons.map((r) => r.code)).toContain("confidence-below-threshold");
  });

  it("does not reject on confidence by default", () => {
    const result = validateObservation(vessel({ confidence: 0.01 }), { now: NOW });

    expect(result.verdict).toBe("warning");
  });
});

describe("validateObservation — warnings still reach the map", () => {
  it("warns but keeps an observation with no MMSI", () => {
    const result = validateObservation(
      { ...vessel(), identity: { imo: "9411765", name: "MV Test" } },
      { now: NOW },
    );

    expect(result.verdict).toBe("warning");
    expect(result.vessel).not.toBeNull();
    expect(result.reasons.map((r) => r.code)).toContain("missing-mmsi");
  });

  it("warns on exactly 0,0", () => {
    const result = validateObservation(vessel(position({ lat: 0, lon: 0 })), { now: NOW });

    expect(result.verdict).toBe("warning");
    expect(result.vessel).not.toBeNull();
    expect(result.reasons.map((r) => r.code)).toContain("null-island");
  });

  it("warns on an ageing but usable position", () => {
    const result = validateObservation(
      vessel(position({ timestamp: new Date(NOW - 2 * 3_600_000).toISOString() })),
      { now: NOW },
    );

    expect(result.verdict).toBe("warning");
    expect(result.vessel).not.toBeNull();
  });

  it("warns on a future timestamp", () => {
    const result = validateObservation(
      vessel(position({ timestamp: new Date(NOW + 3_600_000).toISOString() })),
      { now: NOW },
    );

    expect(result.reasons.map((r) => r.code)).toContain("future-timestamp");
    expect(result.vessel).not.toBeNull();
  });

  it("tolerates small clock skew without warning", () => {
    const result = validateObservation(
      vessel(position({ timestamp: new Date(NOW + 60_000).toISOString() })),
      { now: NOW },
    );

    expect(result.reasons.map((r) => r.code)).not.toContain("future-timestamp");
  });

  it("warns on an implausible speed", () => {
    const result = validateObservation(vessel(position({ speed: 90 })), { now: NOW });

    expect(result.reasons.map((r) => r.code)).toContain("implausible-speed");
    expect(result.vessel).not.toBeNull();
  });

  it("warns on an out-of-range heading", () => {
    const result = validateObservation(vessel(position({ heading: 400 })), { now: NOW });

    expect(result.reasons.map((r) => r.code)).toContain("invalid-heading");
  });
});

describe("validateObservation — reason collection", () => {
  it("collects every applicable finding, not just the first", () => {
    const result = validateObservation(
      {
        ...vessel({ confidence: 0.1 }),
        identity: { imo: "9411765", name: "x" },
        position: {
          lon: 0,
          lat: 0,
          heading: 400,
          speed: 99,
          timestamp: new Date(NOW).toISOString(),
        },
      },
      { now: NOW },
    );

    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain("missing-mmsi");
    expect(codes).toContain("null-island");
    expect(codes).toContain("invalid-heading");
    expect(codes).toContain("implausible-speed");
    expect(codes).toContain("confidence-below-threshold");
  });

  it("gives every reason a message", () => {
    const result = validateObservation(vessel(position({ lat: 999 })), { now: NOW });

    for (const reason of result.reasons) {
      expect(reason.message.length).toBeGreaterThan(0);
    }
  });
});

describe("validateBatch", () => {
  it("passes accepted and warned observations through, and drops rejected", () => {
    const batch = validateBatch(
      [
        vessel({ identity: { imo: "1", mmsi: "a", name: "ok" } }),
        vessel({ identity: { imo: "2", name: "warn-no-mmsi" } }),
        { ...vessel(), identity: { imo: "3", mmsi: "c", name: "bad" }, ...position({ lat: 999 }) },
      ],
      { now: NOW },
    );

    expect(batch.vessels).toHaveLength(2);
    expect(batch.summary.accepted).toBe(1);
    expect(batch.summary.warned).toBe(1);
    expect(batch.summary.rejected).toBe(1);
  });

  it("marks the older copy as the duplicate", () => {
    const older = {
      ...vessel(),
      ...position({ timestamp: new Date(NOW - 600_000).toISOString(), lat: 1 }),
    };
    const newer = {
      ...vessel(),
      ...position({ timestamp: new Date(NOW - 60_000).toISOString(), lat: 2 }),
    };

    const batch = validateBatch([older, newer], { now: NOW });

    expect(batch.vessels).toHaveLength(1);
    expect(batch.vessels[0].position.lat).toBe(2);
    expect(batch.summary.rejected).toBe(1);
    expect(batch.summary.rejectionsByCode["duplicate-observation"]).toBe(1);
  });

  it("counts findings by code for diagnostics", () => {
    const batch = validateBatch(
      [
        vessel({ identity: { imo: "1", name: "no-mmsi-1" } }),
        vessel({ identity: { imo: "2", name: "no-mmsi-2" } }),
      ],
      { now: NOW },
    );

    expect(batch.summary.warningsByCode["missing-mmsi"]).toBe(2);
  });

  it("handles an empty batch", () => {
    const batch = validateBatch([], { now: NOW });

    expect(batch.vessels).toEqual([]);
    expect(batch.summary).toMatchObject({ accepted: 0, warned: 0, rejected: 0 });
  });
});
