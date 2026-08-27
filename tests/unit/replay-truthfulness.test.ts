/**
 * What the replay bar draws, and what it refuses to draw.
 *
 * The bar used to render one thing: the full transport strip — restart,
 * step, play, step, four speeds, a scrubber — permanently greyed out,
 * with a sentence beside it explaining there was nothing to replay.
 * Every control was honestly `disabled`, so nothing was lying exactly.
 *
 * It was still the wrong surface. A row of playback controls reads as a
 * capability the system has and the officer has failed to reach, so they
 * go looking for the setting that turns it on. There is no such setting.
 * Disabling is not the fix; not drawing is.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REPLAY_ACTION_LABELS,
  replayPresentation,
  type ReplayPresentationInput,
} from "@/features/maritime/replay-presentation";
import type { ReplayStatus } from "@/services/geospatial";

const BAR = readFileSync(resolve(process.cwd(), "src/features/maritime/TimelineBar.tsx"), "utf8");
const SHELL = readFileSync(
  resolve(process.cwd(), "src/features/maritime/MaritimeCommand.tsx"),
  "utf8",
);

function input(over: Partial<ReplayPresentationInput> = {}): ReplayPresentationInput {
  return {
    selection: null,
    availability: "PENDING_CREDENTIALS",
    status: null,
    unavailableReason: "Historical movement is not available.",
    ...over,
  };
}

function playing(state: ReplayStatus["state"] = "playing"): ReplayStatus {
  return {
    state,
    from: 0,
    to: 100,
    position: 50,
    cursor: 5,
    total: 10,
    speed: 1,
  } as ReplayStatus;
}

describe("controls are live or absent, never drawn dead", () => {
  it("draws no controls when there is nothing to drive", () => {
    for (const availability of ["PENDING_CREDENTIALS", "NO_HISTORY", "NO_MOVEMENT"] as const) {
      const result = replayPresentation(input({ availability }));
      expect(result.controlsLive, availability).toBe(false);
      expect(result.message, availability).not.toBe("");
    }
  });

  it("draws controls exactly when a player exists", () => {
    // The player is only built when frames exist, so its presence is
    // proof there is something to drive.
    expect(replayPresentation(input({ status: playing() })).controlsLive).toBe(true);
  });

  it("never renders an explanation beside live controls", () => {
    // The pairing the officer found contradictory: a dead transport
    // strip and a sentence saying replay is unavailable, together.
    const live = replayPresentation(input({ status: playing() }));
    expect(live.controlsLive).toBe(true);
    expect(live.message).toBe("");
  });
});

describe("the state names what is missing", () => {
  it("asks for a selection only when there is nothing to play", () => {
    const result = replayPresentation(input());
    expect(result.state).toBe("NO_VESSEL_SELECTED");
    expect(result.message).toBe("Select a vessel to inspect movement history.");
  });

  it("says the vessel has no history once one is chosen", () => {
    const result = replayPresentation(
      input({ selection: { kind: "vessel", id: "v1", imo: "9999999" } }),
    );
    expect(result.state).toBe("VESSEL_SELECTED_NO_HISTORY");
    expect(result.message).toBe(
      "Historical movement data is not currently available for this vessel.",
    );
  });

  it("offers what is still worth doing for that vessel", () => {
    /*
     * An officer who cannot replay a track can still see where the ship
     * is now and what is known about it. Offering nothing would make the
     * dead end feel like a fault.
     */
    const result = replayPresentation(
      input({ selection: { kind: "vessel", id: "v1", imo: "9999999" } }),
    );
    expect(result.actions).toContain("view-position");
    expect(result.actions).toContain("open-intelligence");
    for (const action of result.actions) expect(REPLAY_ACTION_LABELS[action]).toBeTruthy();
  });

  it("does not ask for a vessel when a port is selected", () => {
    // Only a vessel has a track; asking about vessels while a port is
    // open would be answering a question nobody asked.
    const result = replayPresentation(input({ selection: { kind: "port", id: "NGAPP" } }));
    expect(result.state).toBe("NO_VESSEL_SELECTED");
  });

  it("separates a failing source from an absent archive", () => {
    /*
     * A connected source that is failing may recover, and it means the
     * live picture is suspect too. An archive that does not exist is a
     * settled fact. Collapsing them would hide an active fault.
     */
    const result = replayPresentation(input({ availability: "SOURCE_UNAVAILABLE" }));
    expect(result.state).toBe("REPLAY_ERROR");
  });

  it("says it is loading rather than showing a conclusion it will contradict", () => {
    expect(replayPresentation(input({ availability: "LOADING" })).state).toBe("REPLAY_LOADING");
    expect(replayPresentation(input({ historyLoading: true })).state).toBe("REPLAY_LOADING");
  });

  it("reports play and pause distinctly", () => {
    expect(replayPresentation(input({ status: playing("playing") })).state).toBe("REPLAY_PLAYING");
    expect(replayPresentation(input({ status: playing("paused") })).state).toBe("REPLAY_PAUSED");
  });
});

describe("a playable recording outranks a selection", () => {
  it("keeps session replay working with nothing selected", () => {
    /*
     * The existing replay records the whole operational picture, so it
     * can replay a period with no vessel chosen. Demanding a selection
     * to satisfy a tidier state machine would remove working
     * functionality and invent a requirement.
     */
    const result = replayPresentation(input({ selection: null, status: playing() }));
    expect(result.controlsLive).toBe(true);
    expect(result.state).not.toBe("NO_VESSEL_SELECTED");
  });
});

describe("the bar and the shell use it", () => {
  it("returns early rather than disabling when controls are not live", () => {
    const code = BAR.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("presentation && !presentation.controlsLive");
    expect(code).toContain("replay-explanation");
  });

  it("is mounted with derived state, not a hardcoded shape", () => {
    expect(SHELL).toContain("replayPresentation({");
    expect(SHELL).toContain("availability: replay.availability");
  });

  it("exposes the state for verification", () => {
    // So a browser run can assert which shape is on screen rather than
    // inferring it from pixels.
    expect(BAR).toContain("data-replay-state");
  });

  it("routes the position action through canonical navigation", () => {
    // Not a camera call in an onClick.
    const code = SHELL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const handler = code.slice(code.indexOf("onAction={"), code.indexOf("onPlay={"));
    expect(handler).toContain("navigateToCoordinates");
    for (const forbidden of ["flyTo(", "jumpTo(", "easeTo(", "setZoom("]) {
      expect(handler, forbidden).not.toContain(forbidden);
    }
  });
});
