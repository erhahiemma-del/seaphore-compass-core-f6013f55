/**
 * The Maritime Command control rail.
 *
 * Ten controls, each exactly once, each honest about whether pressing it
 * does anything. The rail is where the map's capability model becomes
 * visible to an officer, so the failure it must not have is a control
 * that looks operational and is not.
 *
 * It is also where the diagnostics used to be. Provider counts, freshness
 * statistics and answerability ratios were the first thing above the
 * filters, which made the primary map surface read as a status page for a
 * system rather than an instrument for looking at the sea. Those numbers
 * are real and they belong in Data Sources; the assertion here is only
 * that they are not in front of the officer's filters.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONTROL_STATUS_LABEL,
  MAP_CONTROLS,
  findControl,
  readyControls,
} from "@/features/maritime/control-rail";

const RAIL = readFileSync(resolve(process.cwd(), "src/features/maritime/ControlRail.tsx"), "utf8");

const CANONICAL = [
  "map-style",
  "layers",
  "vessel-filters",
  "watchlists",
  "weather",
  "density",
  "replay",
  "voyage-intelligence",
  "spatial-tools",
  "full-screen",
] as const;

describe("the canonical rail", () => {
  it("has exactly the ten agreed controls, in order", () => {
    expect(MAP_CONTROLS.map((c) => c.id)).toEqual([...CANONICAL]);
  });

  it("declares each control exactly once", () => {
    // Two controls for one capability is the duplication the audit found
    // across the layer surfaces; the rail must not reintroduce it.
    const ids = MAP_CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = MAP_CONTROLS.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("resolves every canonical id", () => {
    for (const id of CANONICAL) expect(findControl(id), id).toBeDefined();
  });
});

describe("status is honest about what the control can do", () => {
  it("gives every control a status the vocabulary knows", () => {
    for (const control of MAP_CONTROLS) {
      expect(CONTROL_STATUS_LABEL[control.status], control.id).toBeTruthy();
    }
  });

  it("explains every control that is not ready", () => {
    /*
     * "Pending source" alone is not an explanation. An officer opening
     * Weather should learn Seaphore has no meteorological provider — a
     * procurement fact — rather than be left to read it as a fault or a
     * loading state.
     */
    const unexplained = MAP_CONTROLS.filter(
      (c) => c.status !== "ready" && (!c.pendingReason || c.pendingReason.length < 40),
    ).map((c) => c.id);
    expect(unexplained).toEqual([]);
  });

  it("marks as ready only what genuinely acts on the map today", () => {
    // Vessel Filters earns this: its state is read by the update engine
    // when it projects to the renderer. Weather and Density do not.
    expect(readyControls().map((c) => c.id)).toEqual([
      "map-style",
      "layers",
      "vessel-filters",
      "full-screen",
    ]);
  });

  it("keeps watchlists, weather, density and spatial tools pending", () => {
    for (const id of ["watchlists", "weather", "density", "spatial-tools"]) {
      expect(findControl(id)?.status, id).toBe("pending-source");
    }
  });

  it("distinguishes limited from pending", () => {
    /*
     * Replay and Voyage Intelligence both work on what has been
     * observed and lack a historical archive. That is a different answer
     * from Weather, where nothing works at all, and the two must not
     * collapse into one word.
     */
    for (const id of ["replay", "voyage-intelligence"]) {
      expect(findControl(id)?.status, id).toBe("limited");
    }
  });
});

describe("the rail is an instrument, not a status page", () => {
  it("shows no provider diagnostics above the filters", () => {
    for (const forbidden of [
      "answerable",
      "Providers",
      "Avg freshness",
      "Avg confidence",
      "Last update",
      "quotaRemaining",
      "failureRate",
    ]) {
      expect(RAIL, `rail mentions ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("renders no drawer content for a pending control beyond its reason", () => {
    // The honest empty drawer: a reason, and nothing to press.
    expect(RAIL).toContain("UnavailableDrawer");
    expect(RAIL).toContain("control.pendingReason");
  });

  it("writes filters through the shared service rather than local state", () => {
    // No second filter store. The drawer is a view over MapState.
    expect(RAIL).toContain("service.setFilters");
    expect(RAIL).not.toMatch(/useState<MapFilters>/);
  });

  it("offers a reset that returns the standard population", () => {
    expect(RAIL).toContain("EMPTY_FILTERS");
    expect(RAIL).toContain('data-testid="clear-filters"');
  });

  it("names the dimensions it cannot filter on", () => {
    // Absent controls are indistinguishable from controls an officer
    // failed to find. Listing them removes that ambiguity.
    expect(RAIL).toContain("PENDING_FILTER_DIMENSIONS");
  });

  it("labels every control for assistive technology", () => {
    expect(RAIL).toContain("aria-label");
    expect(RAIL).toContain("aria-expanded");
    expect(RAIL).toContain('aria-label="Map controls"');
  });
});
