// @vitest-environment jsdom
/** TEST_FIXTURE — synthetic map state only. */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextDrawer } from "@/features/maritime/ContextDrawer";
import { NationalPicturePanel } from "@/features/maritime/NationalPicturePanel";
import { OperatingModeBar } from "@/features/maritime/OperatingModeBar";
import { TimelineBar } from "@/features/maritime/TimelineBar";
import {
  buildNationalPicture,
  sgs,
  type MapSelection,
  type ReplayStatus,
  type Vessel,
} from "@/services/geospatial";

afterEach(() => {
  cleanup();
  sgs.reset();
});

const NOW = Date.parse("2026-08-20T12:00:00.000Z");

/** TEST_FIXTURE */
function vessel(): Vessel {
  return {
    identity: { imo: "9074729", mmsi: "657123400", name: "TEST_FIXTURE MV ABC", flag: "NG" },
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
  } as Vessel;
}

/* ═══════════ Operating mode ═══════════ */

describe("operating mode bar", () => {
  it("offers the modes an officer can enter directly", () => {
    render(<OperatingModeBar />);
    const bar = screen.getByTestId("operating-mode-bar");

    for (const label of ["National", "Port", "Vessel", "Incident", "Investigation", "History"]) {
      expect(within(bar).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("does not offer Replay as an entry point", () => {
    // Arriving in replay with no recording would show playback controls
    // over nothing.
    render(<OperatingModeBar />);
    expect(
      within(screen.getByTestId("operating-mode-bar")).queryByRole("button", { name: "Replay" }),
    ).not.toBeInTheDocument();
  });

  it("writes the mode to shared state", () => {
    render(<OperatingModeBar />);
    fireEvent.click(screen.getByRole("button", { name: "Port" }));

    expect(sgs.get().operatingMode).toBe("PORT");
  });

  it("marks the active mode as pressed", () => {
    sgs.setOperatingMode("INVESTIGATION");
    render(<OperatingModeBar />);

    expect(screen.getByRole("button", { name: "Investigation" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

/* ═══════════ National picture ═══════════ */

describe("national picture panel", () => {
  const pendingPicture = buildNationalPicture({
    vessels: [],
    vesselSourceConnected: false,
    now: NOW,
  });

  it("never renders a pending metric as zero", () => {
    // The distinction the whole panel exists to protect.
    render(<NationalPicturePanel picture={pendingPicture} />);
    const tile = screen.getByTestId("metric-vessels");

    expect(tile).toHaveAttribute("data-pending", "true");
    expect(within(tile).getByText("Source pending")).toBeInTheDocument();
    expect(within(tile).queryByText("0")).not.toBeInTheDocument();
  });

  it("renders a real zero as a number", () => {
    const picture = buildNationalPicture({
      vessels: [],
      vesselSourceConnected: true,
      now: NOW,
    });
    render(<NationalPicturePanel picture={picture} />);

    const connected = screen.getByTestId("metric-vessels");
    expect(connected).toHaveAttribute("data-pending", "false");
    expect(within(connected).getByText("0")).toBeInTheDocument();
  });

  it("makes a pending metric unclickable — it answers nothing", () => {
    const onSelect = vi.fn();
    render(<NationalPicturePanel picture={pendingPicture} onSelectMetric={onSelect} />);

    fireEvent.click(screen.getByTestId("metric-vessels"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId("metric-vessels")).toBeDisabled();
  });

  it("routes a real metric click to the map", () => {
    const onSelect = vi.fn();
    render(
      <NationalPicturePanel
        picture={buildNationalPicture({ vessels: [], vesselSourceConnected: true, now: NOW })}
        onSelectMetric={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("metric-vessels"));
    expect(onSelect).toHaveBeenCalledWith("vessels");
  });

  it("states coverage so an officer knows how much is answerable", () => {
    render(<NationalPicturePanel picture={pendingPicture} />);
    expect(screen.getByText("1/9 answerable")).toBeInTheDocument();
  });

  it("warns plainly when nothing is contributing", () => {
    render(<NationalPicturePanel picture={pendingPicture} />);
    expect(
      screen.getByText(/reflects Seaphore's collection, not the state of Nigerian waters/),
    ).toBeInTheDocument();
  });
});

/* ═══════════ Context drawer ═══════════ */

describe("context drawer", () => {
  it("renders nothing when nothing is selected", () => {
    render(<ContextDrawer selection={null} onClose={() => {}} />);
    expect(screen.queryByTestId("context-drawer")).not.toBeInTheDocument();
  });

  it("renders the vessel card for a resolved vessel", () => {
    render(
      <ContextDrawer
        selection={{ kind: "vessel", id: "9074729", imo: "9074729" }}
        vessel={vessel()}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId("context-drawer")).toHaveAttribute("data-selection-kind", "vessel");
    // The card renders the name as both a heading and a field.
    expect(screen.getAllByText(/TEST_FIXTURE MV ABC/).length).toBeGreaterThan(0);
  });

  it("distinguishes an unloaded vessel from a non-existent one", () => {
    render(
      <ContextDrawer
        selection={{ kind: "vessel", id: "9074729", imo: "9074729" }}
        vessel={null}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Vessel not loaded")).toBeInTheDocument();
    expect(screen.getByText(/provider that is not connected/)).toBeInTheDocument();
  });

  it("shows port sections with NPA stated as pending, never fabricated", () => {
    render(<ContextDrawer selection={{ kind: "port", id: "NGAPAPA" }} onClose={() => {}} />);

    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText(/NPA SHIPPOS integration awaiting data access/)).toBeInTheDocument();
  });

  it("shows a SAR detection panel that admits no detector is configured", () => {
    render(
      <ContextDrawer
        selection={{ kind: "sar-detection", id: "d1", sceneId: "s1" }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/No SAR ship-detection service is configured/)).toBeInTheDocument();
  });

  it("says an AIS gap cannot be detected without a provider, not that none exist", () => {
    render(
      <ContextDrawer
        selection={{ kind: "ais-gap", id: "g1", mmsi: "657123400" }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/not a statement that no vessel has gone dark/)).toBeInTheDocument();
  });

  it("adapts to each selection kind rather than branching inside one panel", () => {
    const kinds: MapSelection[] = [
      { kind: "vessel", id: "v", imo: null },
      { kind: "port", id: "p" },
      { kind: "sar-detection", id: "d", sceneId: "s" },
      { kind: "incident", id: "i", source: "nosdra" },
      { kind: "geofence", id: "f" },
    ];

    for (const selection of kinds) {
      cleanup();
      render(<ContextDrawer selection={selection} onClose={() => {}} />);
      expect(screen.getByTestId("context-drawer")).toHaveAttribute(
        "data-selection-kind",
        selection.kind,
      );
    }
  });

  it("states honestly when a kind has no panel yet", () => {
    render(<ContextDrawer selection={{ kind: "geofence", id: "f1" }} onClose={() => {}} />);
    expect(screen.getByText(/nothing connected to show/)).toBeInTheDocument();
  });

  it("closes on request", () => {
    const onClose = vi.fn();
    render(<ContextDrawer selection={{ kind: "port", id: "p" }} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close intelligence drawer" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Copilot the selection as context", () => {
    const onAsk = vi.fn();
    const selection: MapSelection = { kind: "port", id: "NGAPAPA" };
    render(<ContextDrawer selection={selection} onClose={() => {}} onAskCopilot={onAsk} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask Copilot" }));
    expect(onAsk).toHaveBeenCalledWith(selection);
  });
});

/* ═══════════ Timeline ═══════════ */

describe("timeline bar", () => {
  const status: ReplayStatus = {
    state: "paused",
    speed: 5,
    position: NOW - 3_600_000,
    from: NOW - 7_200_000,
    to: NOW,
    cursor: 10,
    total: 40,
    progress: 0.25,
  };

  it("offers all four speeds", () => {
    render(<TimelineBar status={status} windowLabel="last 2 hours" />);

    for (const speed of [1, 5, 20, 100]) {
      expect(screen.getByRole("button", { name: `${speed} times speed` })).toBeInTheDocument();
    }
  });

  it("marks the active speed", () => {
    render(<TimelineBar status={status} windowLabel="last 2 hours" />);
    expect(screen.getByRole("button", { name: "5 times speed" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("disables controls with no recording loaded", () => {
    render(<TimelineBar status={null} windowLabel="live" />);

    expect(screen.getByRole("button", { name: "Play replay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1 times speed" })).toBeDisabled();
  });

  it("states why there is nothing to replay rather than drawing an empty track", () => {
    // An empty scrubber reads as a quiet period, which is the opposite of
    // what is true.
    render(<TimelineBar status={null} windowLabel="live" />);

    expect(screen.getByText(/Historical AIS is not connected/)).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("keeps the query window distinct from the playhead", () => {
    render(<TimelineBar status={status} windowLabel="last 7 days" />);

    expect(screen.getByText(/Window · last 7 days/)).toBeInTheDocument();
    // The scrubber shows the playhead, which is a different instant.
    expect(screen.getByRole("slider")).toHaveValue(String(status.position));
  });

  it("emits play, pause, step and speed commands", () => {
    const onPlay = vi.fn();
    const onStep = vi.fn();
    const onSpeed = vi.fn();
    render(
      <TimelineBar
        status={status}
        windowLabel="last 2 hours"
        onPlay={onPlay}
        onStep={onStep}
        onSpeed={onSpeed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play replay" }));
    fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
    fireEvent.click(screen.getByRole("button", { name: "100 times speed" }));

    expect(onPlay).toHaveBeenCalled();
    expect(onStep).toHaveBeenCalledWith(1);
    expect(onSpeed).toHaveBeenCalledWith(100);
  });

  it("shows pause while playing", () => {
    render(<TimelineBar status={{ ...status, state: "playing" }} windowLabel="live" />);
    expect(screen.getByRole("button", { name: "Pause replay" })).toBeInTheDocument();
  });
});
