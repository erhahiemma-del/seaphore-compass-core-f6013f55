/**
 * How a map selection informs the command bar's search mode.
 *
 * The resolver is deliberately partial: it answers only where a selection
 * genuinely implies a search vocabulary, and returns null otherwise so
 * the caller leaves the officer's mode alone.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_MODE, MODE_BY_KEY, modeForSelectionKind } from "@/lib/intelligence-modes";
import type { MapSelectionKind } from "@/services/geospatial/selection";

/* ═══════ Selections that imply a mode ═══════ */

describe("selections with a matching search vocabulary", () => {
  it("resolves a vessel to vessel search", () => {
    expect(modeForSelectionKind("vessel")).toBe("vessel");
  });

  it.each<MapSelectionKind>(["port", "terminal", "berth", "anchorage"])(
    "resolves %s to port search",
    (kind) => {
      // A terminal, berth and anchorage are all inside a port, and port
      // search is the vocabulary that reaches all three.
      expect(modeForSelectionKind(kind)).toBe("port");
    },
  );

  it("only ever returns a real mode key", () => {
    for (const kind of ["vessel", "port", "terminal", "berth", "anchorage"] as MapSelectionKind[]) {
      const mode = modeForSelectionKind(kind);
      expect(mode).not.toBeNull();
      expect(MODE_BY_KEY[mode!]).toBeDefined();
    }
  });
});

/* ═══════ Selections that imply nothing ═══════ */

describe("selections with no search vocabulary return null", () => {
  it.each<MapSelectionKind>([
    "ais-gap",
    "sar-detection",
    "risk-event",
    "incident",
    "investigation",
    "geofence",
    "infrastructure",
    "zone",
  ])("leaves the mode alone for %s", (kind) => {
    // Forcing these onto a near-neighbour would silently retarget the
    // officer's next search at the wrong index.
    expect(modeForSelectionKind(kind)).toBeNull();
  });

  it("returns null for no selection at all", () => {
    expect(modeForSelectionKind(null)).toBeNull();
  });
});

/* ═══════ The precedence rule the bar applies ═══════ */

describe("mode precedence: pinned beats context beats default", () => {
  /** Mirrors the expression in MissionCommandBar. */
  const effective = (pinned: string | null, context: string | null) =>
    pinned ?? context ?? DEFAULT_MODE;

  it("falls back to the default with neither", () => {
    expect(effective(null, null)).toBe(DEFAULT_MODE);
  });

  it("follows context when nothing is pinned", () => {
    expect(effective(null, "vessel")).toBe("vessel");
  });

  it("keeps a deliberate choice over context", () => {
    // Someone who switched to Manifest and then clicked a vessel is still
    // working on manifests.
    expect(effective("manifest", "vessel")).toBe("manifest");
  });

  it("keeps a deliberate choice over an absent context", () => {
    expect(effective("manifest", null)).toBe("manifest");
  });
});
