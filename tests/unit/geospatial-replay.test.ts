import { describe, expect, it, vi } from "vitest";

import {
  ReplayPlayer,
  ReplayRecorder,
  VesselUpdateEngine,
  type Vessel,
} from "@/services/geospatial";

const T0 = Date.parse("2026-08-04T12:00:00.000Z");
const MIN = 60_000;

function vessel(imo: string, atMs: number, lon = 4.1): Vessel {
  return {
    identity: { imo, name: `Vessel ${imo}` },
    position: { lon, lat: 5.2, heading: 90, speed: 10, timestamp: new Date(atMs).toISOString() },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  };
}

describe("ReplayRecorder", () => {
  it("records observations with their observed time", () => {
    const recorder = new ReplayRecorder({ now: () => T0 });

    recorder.record(vessel("1", T0 - MIN));

    expect(recorder.size).toBe(1);
    expect(recorder.snapshot()[0].observedAt).toBe(T0 - MIN);
    expect(recorder.snapshot()[0].recordedAt).toBe(T0);
  });

  it("falls back to the record time for an unparseable timestamp", () => {
    const recorder = new ReplayRecorder({ now: () => T0 });
    const broken = {
      ...vessel("1", T0),
      position: { ...vessel("1", T0).position, timestamp: "x" },
    };

    recorder.record(broken);

    expect(recorder.snapshot()[0].observedAt).toBe(T0);
  });

  it("records a batch", () => {
    const recorder = new ReplayRecorder({ now: () => T0 });

    recorder.recordBatch([vessel("1", T0), vessel("2", T0)]);

    expect(recorder.size).toBe(2);
  });

  it("bounds retention and counts drops", () => {
    const recorder = new ReplayRecorder({ now: () => T0, maxFrames: 2 });

    recorder.recordBatch([vessel("1", T0), vessel("2", T0), vessel("3", T0)]);

    expect(recorder.size).toBe(2);
    expect(recorder.droppedCount).toBe(1);
    expect(recorder.snapshot()[0].vessel.identity.imo).toBe("2");
  });

  it("reports its span, and null when empty", () => {
    const recorder = new ReplayRecorder({ now: () => T0 });
    expect(recorder.span()).toBeNull();

    recorder.record(vessel("1", T0));
    recorder.record(vessel("2", T0 + 5 * MIN));

    expect(recorder.span()).toEqual({ from: T0, to: T0 + 5 * MIN });
  });

  it("clears", () => {
    const recorder = new ReplayRecorder({ now: () => T0 });
    recorder.record(vessel("1", T0));

    recorder.clear();

    expect(recorder.size).toBe(0);
  });
});

describe("ReplayPlayer — transport", () => {
  function frames() {
    const recorder = new ReplayRecorder({ now: () => T0 });
    recorder.record(vessel("1", T0));
    recorder.record(vessel("1", T0 + 1 * MIN, 4.2));
    recorder.record(vessel("1", T0 + 2 * MIN, 4.3));
    return recorder.snapshot();
  }

  function player(onChange?: (s: unknown) => void) {
    const sink = { applyPatch: vi.fn(), clear: vi.fn() };
    return {
      sink,
      p: new ReplayPlayer({ frames: frames(), sink, onChange: onChange as never }),
    };
  }

  it("starts idle at the beginning", () => {
    const { p } = player();
    const status = p.status();

    expect(status.state).toBe("idle");
    expect(status.position).toBe(T0);
    expect(status.total).toBe(3);
    expect(status.progress).toBe(0);
  });

  it("applies frames as time advances", () => {
    const { p, sink } = player();
    p.play();

    p.tick(1 * MIN);

    // Frames at T0 and T0+1m are due.
    expect(sink.applyPatch).toHaveBeenCalledTimes(2);
  });

  it("scales elapsed time by speed", () => {
    const { p, sink } = player();
    p.setSpeed(10);
    p.play();

    p.tick(12_000); // 12s × 10 = 2 minutes of history

    expect(sink.applyPatch).toHaveBeenCalledTimes(3);
  });

  it("pauses and resumes", () => {
    const { p, sink } = player();
    p.play();
    p.pause();

    expect(p.tick(5 * MIN)).toBe(0);
    expect(sink.applyPatch).not.toHaveBeenCalled();

    p.resume();
    p.tick(5 * MIN);
    expect(sink.applyPatch).toHaveBeenCalled();
  });

  it("ends at the last frame", () => {
    const { p } = player();
    p.play();

    p.tick(10 * MIN);

    expect(p.status().state).toBe("ended");
    expect(p.status().progress).toBe(1);
  });

  it("steps forward one frame at a time", () => {
    const { p, sink } = player();

    expect(p.stepForward()).toBe(true);
    expect(sink.applyPatch).toHaveBeenCalledTimes(1);
    expect(p.status().position).toBe(T0);

    p.stepForward();
    expect(p.status().position).toBe(T0 + 1 * MIN);
  });

  it("refuses to step past the end", () => {
    const { p } = player();
    p.stepForward();
    p.stepForward();
    p.stepForward();

    expect(p.stepForward()).toBe(false);
  });

  it("steps back by rebuilding, never by inverting an observation", () => {
    const { p, sink } = player();
    p.stepForward();
    p.stepForward();
    sink.applyPatch.mockClear();
    sink.clear.mockClear();

    expect(p.stepBack()).toBe(true);

    // Rebuild = clear, then reapply the frames before the new cursor.
    expect(sink.clear).toHaveBeenCalledTimes(1);
    expect(sink.applyPatch).toHaveBeenCalledTimes(1);
    expect(p.status().cursor).toBe(1);
  });

  it("refuses to step back from the start", () => {
    const { p } = player();

    expect(p.stepBack()).toBe(false);
  });

  it("jumps to a timestamp and rebuilds the picture there", () => {
    const { p, sink } = player();

    p.jumpTo(T0 + 1 * MIN);

    expect(sink.clear).toHaveBeenCalled();
    // Frames at T0 and T0+1m are at or before the target.
    expect(sink.applyPatch).toHaveBeenCalledTimes(2);
    expect(p.status().position).toBe(T0 + 1 * MIN);
  });

  it("clamps a jump outside the recording", () => {
    const { p } = player();

    p.jumpTo(T0 - 999 * MIN);
    expect(p.status().position).toBe(T0);

    p.jumpTo(T0 + 999 * MIN);
    expect(p.status().position).toBe(T0 + 2 * MIN);
  });

  it("notifies on every transport change", () => {
    const onChange = vi.fn();
    const { p } = player(onChange);

    p.play();
    p.pause();
    p.stepForward();

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("handles an empty recording without throwing", () => {
    const sink = { applyPatch: vi.fn(), clear: vi.fn() };
    const p = new ReplayPlayer({ frames: [], sink });

    p.play();
    expect(p.tick(60_000)).toBe(0);
    expect(p.status().total).toBe(0);
    expect(p.stepForward()).toBe(false);
  });
});

describe("ReplayPlayer — no duplicated vessel state", () => {
  it("replays through the same update engine the live map uses", () => {
    const recorder = new ReplayRecorder({ now: () => T0 });
    recorder.record(vessel("1", T0, 4.1));
    recorder.record(vessel("1", T0 + MIN, 4.9));

    const engine = new VesselUpdateEngine();
    const player = new ReplayPlayer({ frames: recorder.snapshot(), sink: engine });

    player.play();
    player.tick(2 * MIN);

    // One vessel, at its latest replayed position — identical to what the
    // live path would have produced from the same observations.
    expect(engine.size).toBe(1);
    expect(engine.get("1")?.position.lon).toBe(4.9);
  });

  it("rebuilds engine state exactly when seeking backwards", () => {
    const recorder = new ReplayRecorder({ now: () => T0 });
    recorder.record(vessel("1", T0, 4.1));
    recorder.record(vessel("1", T0 + MIN, 4.9));

    const engine = new VesselUpdateEngine();
    const player = new ReplayPlayer({ frames: recorder.snapshot(), sink: engine });

    player.jumpTo(T0 + MIN);
    expect(engine.get("1")?.position.lon).toBe(4.9);

    player.jumpTo(T0);
    expect(engine.get("1")?.position.lon).toBe(4.1);
  });
});
