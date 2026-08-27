/**
 * Map overlays occupy declared zones, not invented positions.
 *
 * Every floating widget used to place itself with its own absolute
 * offsets, and two of them chose the same one: the control rail and the
 * scope block were both `left-3 top-3`, stacked on each other and told
 * apart only by a z-index. Nothing caught it, because nothing was
 * comparing — the collision was visible in a screenshot and invisible to
 * the suite.
 *
 * Declaring anchors in one table makes overlap something a test can
 * check. These assert the table is coherent and that the map surface
 * actually uses it rather than reaching for offsets of its own.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAP_ZONE, anchorOf, type MapZone } from "@/features/maritime/map-zones";
import { resolveTheme } from "@/stores/theme.store";

const COMMAND = readFileSync(
  resolve(process.cwd(), "src/features/maritime/MaritimeCommand.tsx"),
  "utf8",
);

const ZONES = Object.keys(MAP_ZONE) as MapZone[];

describe("the zone table is coherent", () => {
  it("gives every zone a distinct anchor", () => {
    // The collision, stated as a rule. Two widgets may share a stacking
    // level; sharing an anchor is what puts one on top of the other.
    const anchors = ZONES.map(anchorOf);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("positions every zone absolutely", () => {
    for (const zone of ZONES) {
      expect(MAP_ZONE[zone], zone).toContain("absolute");
    }
  });

  it("keeps the left gutter for the rail alone", () => {
    /*
     * The rail is 44px of buttons at `left-3`, so it occupies roughly
     * 12–56px. Anything else on the left starts clear of it rather than
     * tucked against it.
     */
    expect(MAP_ZONE.LEFT_RAIL).toContain("left-3");
    for (const zone of ZONES) {
      if (zone === "LEFT_RAIL") continue;
      expect(MAP_ZONE[zone], `${zone} intrudes on the rail`).not.toMatch(/\bleft-3\b/);
    }
  });

  it("puts the rail above the panels it opens", () => {
    // A drawer covering its own control would leave an officer unable to
    // close it.
    const level = (zone: MapZone) => Number(/z-(\d+)/.exec(MAP_ZONE[zone])?.[1] ?? "0");
    for (const zone of ZONES) {
      if (zone === "LEFT_RAIL") continue;
      expect(level("LEFT_RAIL")).toBeGreaterThan(level(zone));
    }
  });
});

describe("the map surface uses the table", () => {
  it("places the rail and the context block by zone", () => {
    expect(COMMAND).toContain("MAP_ZONE.LEFT_RAIL");
    expect(COMMAND).toContain("MAP_ZONE.LEFT_CONTEXT");
    expect(COMMAND).toContain("MAP_ZONE.BOTTOM_RIGHT");
  });

  it("invents no absolute offsets of its own", () => {
    /*
     * The rule that keeps the table honest. A widget that reaches for
     * `absolute left-… top-…` directly is outside the system, and the
     * next collision will be as invisible as the last one.
     */
    const code = COMMAND.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const offsets = code.match(/absolute\s+(?:left|right|top|bottom)-[\w[\]./]+/g) ?? [];
    expect(offsets).toEqual([]);
  });
});

describe("the shell is lit the same way as the map", () => {
  it("takes its mode from the presentation mode", () => {
    /*
     * Presentation mode was a map-only decision, which produced two
     * disconnected products on one screen — a light institutional map
     * under dark application chrome. An officer choosing Institutional is
     * choosing how Maritime Command looks, not how its basemap looks.
     */
    expect(COMMAND).toContain('presentationMode === "institutional" ? "light" : "dark"');
  });

  it("still lets the officer's own theme choice win", () => {
    /*
     * The precedence lives in the theme store, not in the shell: the
     * shell passes an environment default and `resolveTheme` prefers the
     * officer's own choice when they have made one. Asserting here
     * rather than in the shell keeps the test pointed at the mechanism
     * instead of at a component that merely supplies an input.
     */
    expect(resolveTheme({ theme: "dark", preferenceSet: true, environmentDefault: "light" })).toBe(
      "dark",
    );
    expect(resolveTheme({ theme: "dark", preferenceSet: false, environmentDefault: "light" })).toBe(
      "light",
    );
  });
});
