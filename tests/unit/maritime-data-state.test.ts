/** TEST_FIXTURE — synthetic feed states only. */
import { describe, expect, it } from "vitest";

import { resolveMapDataState, type MapDataStateInput } from "@/services/geospatial";

const NOW = Date.parse("2026-08-22T12:00:00.000Z");

/** A connected, healthy feed. Individual tests vary one axis from here. */
function feed(overrides: Partial<MapDataStateInput> = {}): MapDataStateInput {
  return {
    loading: false,
    error: null,
    sourceId: "global-fishing-watch",
    lastAppliedAt: new Date(NOW - 60_000).toISOString(),
    recordCount: 12,
    now: NOW,
    ...overrides,
  };
}

/* ═══════ LIVE ═══════ */

describe("LIVE requires a real source, usable records and fresh data", () => {
  it("is LIVE when all three hold", () => {
    const result = resolveMapDataState(feed());
    expect(result.state).toBe("LIVE");
    expect(result.isLive).toBe(true);
    expect(result.reason).toContain("global-fishing-watch");
  });

  it("is the only state that may animate", () => {
    expect(resolveMapDataState(feed()).isLive).toBe(true);
    expect(resolveMapDataState(feed({ error: "boom" })).isLive).toBe(false);
    expect(resolveMapDataState(feed({ demoMode: true })).isLive).toBe(false);
    expect(
      resolveMapDataState(feed({ lastAppliedAt: new Date(NOW - 3 * 3_600_000).toISOString() }))
        .isLive,
    ).toBe(false);
  });
});

/* ═══════ DELAYED ═══════ */

describe("DELAYED is connected but stale", () => {
  it("goes DELAYED once the data ages past the canonical fresh bands", () => {
    // 3 hours — well past `ageingMs`, using the shared thresholds rather
    // than a second staleness rule invented here.
    const result = resolveMapDataState(
      feed({ lastAppliedAt: new Date(NOW - 3 * 3_600_000).toISOString() }),
    );

    expect(result.state).toBe("DELAYED");
    expect(result.reason).toMatch(/hours? old/);
  });

  it("does not present an unmeasurable age as current", () => {
    const result = resolveMapDataState(feed({ lastAppliedAt: "not-a-date" }));
    expect(result.state).toBe("DELAYED");
    expect(result.state).not.toBe("LIVE");
  });

  it("treats a future timestamp as a clock problem, never as fresh", () => {
    const result = resolveMapDataState(
      feed({ lastAppliedAt: new Date(NOW + 3_600_000).toISOString() }),
    );
    expect(result.isLive).toBe(false);
  });
});

/* ═══════ DATA_UNAVAILABLE ═══════ */

describe("DATA_UNAVAILABLE covers every way there is nothing usable", () => {
  it("reports no configured source", () => {
    const result = resolveMapDataState(feed({ sourceId: null }));
    expect(result.state).toBe("DATA_UNAVAILABLE");
    expect(result.reason).toMatch(/No vessel source is connected/);
  });

  it("distinguishes a failed request from an empty sea", () => {
    // The distinction that matters most: an officer must never read
    // "the request failed" as "there are no vessels".
    const result = resolveMapDataState(feed({ error: "HTTP 503" }));
    expect(result.state).toBe("DATA_UNAVAILABLE");
    expect(result.reason).toMatch(/gap in collection, not an absence of vessels/);
  });

  it("reports connected-but-empty as unavailable, naming the source", () => {
    const result = resolveMapDataState(feed({ recordCount: 0 }));
    expect(result.state).toBe("DATA_UNAVAILABLE");
    expect(result.reason).toMatch(/returned no vessels/);
  });

  it("reports the first load before any response", () => {
    const result = resolveMapDataState(feed({ loading: true, lastAppliedAt: null }));
    expect(result.state).toBe("DATA_UNAVAILABLE");
  });

  it("never invents vessels to fill the gap", () => {
    const result = resolveMapDataState(feed({ sourceId: null, recordCount: 0 }));
    expect(result.state).toBe("DATA_UNAVAILABLE");
    expect(result.reason).toBeTruthy();
  });
});

/* ═══════ DEMO ═══════ */

describe("DEMO is explicit and can never become LIVE", () => {
  it("requires explicit configuration", () => {
    const result = resolveMapDataState(feed({ demoMode: true }));
    expect(result.state).toBe("DEMO");
  });

  it("stays DEMO even when the feed looks perfectly fresh", () => {
    // The exact bug this guards: a fixture generated a second ago is
    // *recent*, and without the demo check first it would resolve LIVE.
    const result = resolveMapDataState(
      feed({ demoMode: true, lastAppliedAt: new Date(NOW - 1_000).toISOString() }),
    );

    expect(result.state).toBe("DEMO");
    expect(result.isLive).toBe(false);
  });

  it("says plainly that nothing shown is an observation", () => {
    expect(resolveMapDataState(feed({ demoMode: true })).reason).toMatch(
      /Nothing shown here is an observation/,
    );
  });

  it("is never inferred from an empty feed", () => {
    // A surface is in demo mode because someone configured it, never
    // because its data happened to be missing.
    const result = resolveMapDataState(feed({ sourceId: null, recordCount: 0 }));
    expect(result.state).not.toBe("DEMO");
  });
});

/* ═══════ The rendering-vs-data distinction ═══════ */

describe("status describes the data, not the UI", () => {
  it("a successfully mounted map with no feed is still DATA_UNAVAILABLE", () => {
    // The map rendering is not evidence about vessels.
    const result = resolveMapDataState(feed({ sourceId: null }));
    expect(result.state).toBe("DATA_UNAVAILABLE");
  });

  it("every state carries a reason an officer can act on", () => {
    const cases: MapDataStateInput[] = [
      feed(),
      feed({ error: "x" }),
      feed({ sourceId: null }),
      feed({ demoMode: true }),
      feed({ lastAppliedAt: new Date(NOW - 5 * 3_600_000).toISOString() }),
    ];
    for (const input of cases) {
      expect(resolveMapDataState(input).reason.length).toBeGreaterThan(10);
    }
  });
});
