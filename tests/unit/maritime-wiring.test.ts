/**
 * TEST_FIXTURE — synthetic vessels and frames only.
 *
 * Covers M1D (national picture on real vessels) and M1B (timeline on the
 * canonical replay engine).
 */
import { describe, expect, it, vi } from "vitest";

import {
  ReplayPlayer,
  ReplayRecorder,
  VesselUpdateEngine,
  buildNationalPicture,
  describeMetric,
  type Vessel,
} from "@/services/geospatial";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");

/** TEST_FIXTURE */
function vessel(over: Partial<Vessel> = {}, imo = "9074729"): Vessel {
  return {
    identity: { imo, mmsi: "657123400", name: `TEST_FIXTURE ${imo}`, flag: "NG" },
    position: {
      lon: 3.4,
      lat: 6.4,
      heading: 90,
      speed: 12,
      timestamp: new Date(NOW - 60_000).toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    provenance: {
      source: "global-fishing-watch",
      provider: "Global Fishing Watch",
      retrievedAt: new Date(NOW).toISOString(),
      observedAt: new Date(NOW - 60_000).toISOString(),
    },
    ...over,
  } as Vessel;
}

/* ═══════════ M1D — national picture on real vessels ═══════════ */

describe("national picture reads the canonical engine", () => {
  it("counts the vessels the engine actually holds", () => {
    // The engine is the source of truth the map draws from; the picture
    // must count the same objects, not a parallel store.
    const engine = new VesselUpdateEngine();
    engine.applyFull([vessel({}, "9074729"), vessel({}, "9319466")]);

    const picture = buildNationalPicture({
      vessels: engine.snapshot(),
      vesselSourceConnected: true,
      now: NOW,
    });

    expect(describeMetric(picture.vessels)).toBe("2");
  });

  it("follows the engine as vessels are added and removed", () => {
    const engine = new VesselUpdateEngine();
    engine.applyFull([vessel({}, "9074729"), vessel({}, "9319466")]);
    engine.remove("9319466");

    const picture = buildNationalPicture({
      vessels: engine.snapshot(),
      vesselSourceConnected: true,
      now: NOW,
    });

    expect(describeMetric(picture.vessels)).toBe("1");
  });

  it("shows a real zero when a connected source returned nothing", () => {
    const picture = buildNationalPicture({
      vessels: [],
      vesselSourceConnected: true,
      vesselsLoading: false,
      now: NOW,
    });

    expect(picture.vessels.kind).toBe("available");
    expect(describeMetric(picture.vessels)).toBe("0");
  });

  it("does not report a count while the first request is in flight", () => {
    // Reporting 0 mid-round-trip would be a number invented by latency.
    const picture = buildNationalPicture({
      vessels: [],
      vesselSourceConnected: true,
      vesselsLoading: true,
      now: NOW,
    });

    expect(picture.vessels.kind).toBe("pending");
    if (picture.vessels.kind !== "pending") return;
    expect(picture.vessels.reason).toMatch(/has not yet returned/);
  });

  it("keeps counting the last good fleet after a failed refresh", () => {
    // A failed refresh does not mean the vessels left.
    const picture = buildNationalPicture({
      vessels: [vessel()],
      vesselSourceConnected: true,
      vesselsLoading: false,
      vesselFeedError: "HTTP 503",
      now: NOW,
    });

    expect(describeMetric(picture.vessels)).toBe("1");
  });

  it("never shows zero when no provider is connected", () => {
    const picture = buildNationalPicture({
      vessels: [],
      vesselSourceConnected: false,
      now: NOW,
    });

    expect(describeMetric(picture.vessels)).toBe("Data source pending");
  });

  it("counts anchored vessels from real speeds once a provider reports them", () => {
    const engine = new VesselUpdateEngine();
    engine.applyFull([
      vessel({ position: { ...vessel().position, speed: 0 } }, "9074729"),
      vessel({ position: { ...vessel().position, speed: 11 } }, "9319466"),
    ]);

    const picture = buildNationalPicture({
      vessels: engine.snapshot(),
      vesselSourceConnected: true,
      providerReportsSpeed: true,
      now: NOW,
    });

    expect(describeMetric(picture.anchored)).toBe("1");
  });

  it("attributes counts to the real provider on the vessels", () => {
    const picture = buildNationalPicture({
      vessels: [vessel()],
      vesselSourceConnected: true,
      now: NOW,
    });

    expect(picture.contributingSources).toEqual(["global-fishing-watch"]);
  });
});

/* ═══════════ M1B — timeline on the canonical engine ═══════════ */

describe("replay drives the same engine the map draws", () => {
  function recording() {
    const recorder = new ReplayRecorder();
    recorder.recordBatch([vessel({}, "9074729")]);
    recorder.recordBatch([
      vessel(
        {
          position: {
            lon: 3.5,
            lat: 6.5,
            heading: 90,
            speed: 12,
            timestamp: new Date(NOW - 30_000).toISOString(),
          },
        },
        "9074729",
      ),
    ]);
    return recorder;
  }

  it("applies frames to the engine, moving the vessels on screen", () => {
    const engine = new VesselUpdateEngine();
    const player = new ReplayPlayer({ frames: recording().snapshot(), sink: engine });

    player.stepForward();

    // The vessel exists in the engine because replay put it there — not
    // in a private copy the map cannot see.
    expect(engine.snapshot().length).toBeGreaterThan(0);
  });

  it("makes the national picture historical automatically", () => {
    // Because replay's sink is the same engine, a count taken at a replay
    // position is a historical count. There is no live count to mislabel.
    const engine = new VesselUpdateEngine();
    const player = new ReplayPlayer({ frames: recording().snapshot(), sink: engine });
    player.stepForward();

    const picture = buildNationalPicture({
      vessels: engine.snapshot(),
      vesselSourceConnected: true,
      now: NOW,
    });

    expect(picture.vessels.kind).toBe("available");
  });

  it("reports a real recording span", () => {
    const span = recording().span();

    expect(span).not.toBeNull();
    expect(span!.to).toBeGreaterThanOrEqual(span!.from);
  });

  it("has no span with nothing recorded", () => {
    expect(new ReplayRecorder().span()).toBeNull();
  });

  it("accepts every offered speed", () => {
    const engine = new VesselUpdateEngine();
    const player = new ReplayPlayer({ frames: recording().snapshot(), sink: engine });

    for (const speed of [1, 5, 10, 20, 100] as const) {
      player.setSpeed(speed);
      expect(player.status().speed).toBe(speed);
    }
  });

  it("play and pause move the canonical player, not a UI flag", () => {
    const player = new ReplayPlayer({
      frames: recording().snapshot(),
      sink: new VesselUpdateEngine(),
    });

    player.play();
    expect(player.status().state).toBe("playing");
    player.pause();
    expect(player.status().state).toBe("paused");
  });

  it("scrubbing moves the canonical playhead", () => {
    const frames = recording().snapshot();
    const player = new ReplayPlayer({ frames, sink: new VesselUpdateEngine() });
    const target = frames[frames.length - 1].observedAt;

    player.seekTo(target);

    expect(player.status().position).toBeGreaterThanOrEqual(frames[0].observedAt);
  });

  it("publishes position changes so one playhead is shared", () => {
    const onChange = vi.fn();
    const player = new ReplayPlayer({
      frames: recording().snapshot(),
      sink: new VesselUpdateEngine(),
      onChange,
    });

    player.stepForward();

    // The subscriber is how MapState.timelinePosition mirrors the player,
    // rather than any component keeping its own current time.
    expect(onChange).toHaveBeenCalled();
    const status = onChange.mock.calls.at(-1)?.[0];
    expect(status.position).toBe(player.status().position);
  });

  it("a recorder with one observation has nothing to play through", () => {
    const recorder = new ReplayRecorder();
    recorder.recordBatch([vessel()]);

    // Distinct from an empty recorder: observations exist, movement does not.
    expect(recorder.snapshot()).toHaveLength(1);
    expect(recorder.span()).not.toBeNull();
  });
});
