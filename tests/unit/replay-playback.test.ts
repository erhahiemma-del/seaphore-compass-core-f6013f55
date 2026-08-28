/**
 * Replay playback — regression cover for the bugs that made it unreachable.
 *
 * Replay shipped broken and stayed broken through several passes, and the
 * reason it survived review is that every part of it looked right in
 * isolation. The player was correct. The recorder was correct. The
 * presentation logic was correct. What was wrong lived between them: each
 * layer waited for a state only another layer could produce.
 *
 * So these tests are deliberately about the seams rather than the units.
 * `geospatial-replay.test.ts` already covers the player's transport in
 * detail; nothing here duplicates it. Every case below is one of the
 * defects actually measured in the browser, written so that reintroducing
 * it fails a test rather than being noticed months later by an officer.
 */
import { describe, expect, it } from "vitest";

import {
  ReplayPlayer,
  VesselUpdateEngine,
  type ReplayFrame,
  type Vessel,
} from "@/services/geospatial";
import { replayPresentation } from "@/features/maritime/replay-presentation";
import {
  displayOwner,
  replayOwnsDisplay,
  DISPLAY_OWNER_LABEL,
  SESSION_REPLAY_EXPLANATION,
} from "@/features/maritime/replay-ownership";

const T0 = Date.parse("2026-08-28T12:00:00.000Z");
const SEC = 1_000;

function vessel(imo: string, atMs: number, lon: number): Vessel {
  return {
    identity: { imo, name: `Vessel ${imo}` },
    position: { lon, lat: 5.2, heading: 90, speed: 10, timestamp: new Date(atMs).toISOString() },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  };
}

/** A recording of one hull moving east, one observation per second. */
function recording(count: number): ReplayFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    recordedAt: T0 + i * SEC,
    observedAt: T0 + i * SEC,
    vessel: vessel("IMO1", T0 + i * SEC, 4 + i * 0.01),
  }));
}

function playerOver(frames: readonly ReplayFrame[]) {
  const engine = new VesselUpdateEngine();
  const player = new ReplayPlayer({ frames, sink: engine });
  return { engine, player, lon: () => engine.get("IMO1")?.position.lon };
}

describe("replay presentation — the controls must be reachable", () => {
  const base = {
    selection: null,
    status: null,
    unavailableReason: "",
  } as const;

  /*
   * The primary defect. The player is built by the first transport
   * command, so `status` is null until something presses play — and the
   * bar only drew the transport once `status` existed. Nothing could
   * start, and a session holding a thousand recorded frames rendered
   * "select a vessel to inspect movement history".
   */
  it("draws live controls for a ready recording before any player exists", () => {
    const presentation = replayPresentation({ ...base, availability: "READY" });

    expect(presentation.controlsLive).toBe(true);
    expect(presentation.state).toBe("REPLAY_READY");
  });

  it("still draws live controls when a vessel is selected and a recording exists", () => {
    const presentation = replayPresentation({
      ...base,
      availability: "READY",
      selection: { kind: "vessel", id: "IMO1", label: "Vessel IMO1" } as never,
      sourceSupportsHistory: false,
    });

    expect(presentation.controlsLive).toBe(true);
  });

  it("does not draw controls when there is genuinely nothing to play", () => {
    for (const availability of ["NO_HISTORY", "NO_MOVEMENT", "PENDING_CREDENTIALS"] as const) {
      expect(replayPresentation({ ...base, availability }).controlsLive).toBe(false);
    }
  });

  it("keeps reporting a failing source rather than offering controls", () => {
    const presentation = replayPresentation({
      ...base,
      availability: "SOURCE_UNAVAILABLE",
      unavailableReason: "The vessel source is connected but currently failing.",
    });

    expect(presentation.controlsLive).toBe(false);
    expect(presentation.state).toBe("REPLAY_ERROR");
  });
});

describe("replay display ownership", () => {
  const status = (state: "idle" | "playing" | "paused" | "ended") =>
    ({
      state,
      speed: 1,
      position: T0,
      from: T0,
      to: T0,
      cursor: 0,
      total: 1,
      progress: 0,
    }) as const;

  it("gives replay the display while playing and while paused", () => {
    expect(displayOwner(status("playing"))).toBe("SESSION_REPLAY");
    expect(displayOwner(status("paused"))).toBe("PAUSED_REPLAY");
    expect(replayOwnsDisplay(displayOwner(status("playing")))).toBe(true);
    /*
     * Paused matters as much as playing. The live feed polls throughout,
     * so a paused replay that released the display would have the vessel
     * jump to the present while the transport said it was holding still.
     */
    expect(replayOwnsDisplay(displayOwner(status("paused")))).toBe(true);
  });

  it("returns the display to live when there is no playback", () => {
    expect(displayOwner(null)).toBe("LIVE");
    expect(displayOwner(status("idle"))).toBe("LIVE");
    // Completion restoration: the map must not be stranded in the past.
    expect(displayOwner(status("ended"))).toBe("LIVE");
    expect(replayOwnsDisplay("LIVE")).toBe(false);
  });

  it("never labels session replay as live, or as provider history", () => {
    expect(DISPLAY_OWNER_LABEL.SESSION_REPLAY).toBe("SESSION REPLAY");
    expect(DISPLAY_OWNER_LABEL.PAUSED_REPLAY).toContain("SESSION REPLAY");
    for (const label of Object.values(DISPLAY_OWNER_LABEL)) {
      if (label !== DISPLAY_OWNER_LABEL.LIVE) expect(label).not.toBe("LIVE");
      expect(label).not.toMatch(/AIS/i);
    }
    expect(SESSION_REPLAY_EXPLANATION).toContain("this Maritime Command session");
    expect(SESSION_REPLAY_EXPLANATION).not.toMatch(/AIS|archive|provider/i);
  });
});

describe("replay playback moves vessels", () => {
  it("advances the cursor and the vessel position as time passes", () => {
    const { player, lon } = playerOver(recording(6));
    player.play();
    const start = lon();

    player.tick(3 * SEC);

    expect(player.status().cursor).toBe(4);
    expect(lon()).not.toBe(start);
  });

  it("holds the vessel exactly where it was while paused", () => {
    const { player, lon } = playerOver(recording(6));
    player.play();
    player.tick(2 * SEC);
    const held = lon();

    player.pause();
    player.tick(3 * SEC);

    expect(player.status().state).toBe("paused");
    expect(lon()).toBe(held);
  });

  it("continues from where it paused on resume", () => {
    const { player, lon } = playerOver(recording(6));
    player.play();
    player.tick(2 * SEC);
    const held = lon();

    player.resume();
    player.tick(2 * SEC);

    expect(player.status().state).toBe("playing");
    expect(lon()).not.toBe(held);
  });

  it("returns the vessel to the first frame on restart", () => {
    const { player, lon } = playerOver(recording(6));
    player.play();
    // Settle on the opening frame first: nothing is applied until the
    // playhead has actually reached an observation.
    player.tick(0);
    const first = lon();
    expect(first).toBeDefined();
    player.tick(4 * SEC);
    expect(lon()).not.toBe(first);

    player.jumpTo(player.status().from);

    expect(player.status().position).toBe(T0);
    expect(lon()).toBe(first);
  });

  /*
   * Measured in the browser: pressing play on a finished recording left
   * the player paused and needed a second press. `jumpTo` decides a state
   * of its own, so rewinding after setting "playing" overwrote it.
   */
  it("plays again from the start once the recording has ended", () => {
    const { player, lon } = playerOver(recording(4));
    player.play();
    player.tick(10 * SEC);
    expect(player.status().state).toBe("ended");
    const atEnd = lon();

    player.play();

    expect(player.status().state).toBe("playing");
    expect(player.status().position).toBe(T0);
    expect(lon()).not.toBe(atEnd);
  });

  it("changes only the replay clock when the speed changes, never reported speed", () => {
    const slow = playerOver(recording(30));
    const fast = playerOver(recording(30));
    slow.player.play();
    fast.player.setSpeed(5);
    fast.player.play();

    slow.player.tick(SEC);
    fast.player.tick(SEC);

    expect(fast.player.status().position - T0).toBe(5 * (slow.player.status().position - T0));
    // The vessel's own reported speed is historical data and is replayed
    // untouched — acceleration is the clock's, not the ship's.
    expect(fast.engine.get("IMO1")?.position.speed).toBe(10);
    expect(slow.engine.get("IMO1")?.position.speed).toBe(10);
  });

  /*
   * The tick used to be credited with its nominal interval rather than
   * the time that actually passed, so any scheduler slippage was lost for
   * good and 1× ran at roughly four-fifths of real time.
   */
  it("advances by the elapsed time it is given, not by a fixed step", () => {
    const { player } = playerOver(recording(30));
    player.play();

    player.tick(137);
    player.tick(613);

    expect(player.status().position).toBe(T0 + 750);
  });

  it("keeps one engine — replay writes through the same vessel state as live", () => {
    const engine = new VesselUpdateEngine();
    engine.applyFull([vessel("IMO1", T0 + 60 * SEC, 9.9)]);
    const player = new ReplayPlayer({ frames: recording(4), sink: engine });

    player.play();
    player.tick(2 * SEC);

    expect(engine.snapshot()).toHaveLength(1);
    expect(engine.get("IMO1")?.position.lon).toBeCloseTo(4.02, 5);
  });
});
