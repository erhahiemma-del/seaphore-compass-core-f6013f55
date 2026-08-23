/**
 * One engine, two presentation modes.
 *
 * These assert the control matrix and the absence of fabricated vessel
 * data in the Mission Control production path. They deliberately test the
 * contract rather than the rendered DOM: mounting MapLibre needs a WebGL
 * context jsdom does not provide, and a test that stubs the renderer to
 * assert on the renderer proves nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const MISSION_CONTROL = "src/features/mission-control/MissionControl.tsx";
const MAP_CANVAS = "src/features/maritime/MapCanvas.tsx";
const MARITIME_COMMAND = "src/features/maritime/MaritimeCommand.tsx";
const MISSION_DATA = "src/lib/mission-control-data.ts";

/* ═══════ Presentation modes ═══════ */

describe("MapCanvas exposes two modes over one renderer", () => {
  const source = read(MAP_CANVAS);

  it("declares exactly the two modes", () => {
    expect(source).toContain('export type MapCanvasMode = "command" | "overview"');
  });

  it("overview suppresses command-only chrome but keeps zoom", () => {
    const table = /const MODE_CONTROLS[\s\S]*?\n};/.exec(source)?.[0] ?? "";
    expect(table).toMatch(/command:\s*\{\s*navigation:\s*true,\s*compass:\s*true,\s*scale:\s*true/);
    // Zoom stays — an overview the officer cannot zoom is a picture.
    expect(table).toMatch(
      /overview:\s*\{\s*navigation:\s*true,\s*compass:\s*false,\s*scale:\s*false/,
    );
  });

  it("defaults to command, so existing callers are unchanged", () => {
    expect(source).toContain('mode = "command"');
  });

  it("mounts one renderer, not one per mode", () => {
    // The whole point: modes are a props difference, not a fork.
    expect(source.match(/new MapLibreRenderer|MapLibreRenderer\(/g)?.length ?? 0).toBeLessThan(2);
  });
});

/* ═══════ Mode assignment per surface ═══════ */

describe("each surface uses its intended mode", () => {
  it("Mission Control is the overview", () => {
    expect(read(MISSION_CONTROL)).toContain('mode="overview"');
  });

  it("Maritime Command keeps the full command surface", () => {
    const source = read(MARITIME_COMMAND);
    // Either explicit or the default — what matters is it is not overview.
    expect(source).not.toContain('mode="overview"');
  });
});

/* ═══════ Legacy SVG map is gone from the production path ═══════ */

describe("the hand-drawn SVG map no longer serves Mission Control", () => {
  it("Mission Control does not import it", () => {
    const source = read(MISSION_CONTROL);
    expect(source).not.toContain("GulfOfGuineaMap");
    expect(source).not.toContain("gulf-of-guinea-map");
  });

  it("Mission Control mounts the canonical MapLibre canvas instead", () => {
    expect(read(MISSION_CONTROL)).toContain("<MapCanvas");
  });
});

/* ═══════ No fabricated vessel intelligence ═══════ */

describe("fabricated vessel fixtures cannot reach production", () => {
  const data = read(MISSION_DATA);

  it("MAP_VESSELS no longer exists", () => {
    expect(data).not.toContain("MAP_VESSELS");
  });

  it("the invented map vessels are gone", () => {
    // These 16 had fabricated IMO numbers and percentage-based x/y screen
    // coordinates — never positions, presented under a LIVE badge.
    // Only names unique to the removed map fixture. Others ("Blue Horizon
    // Shipping", "Crimson Endeavour Ltd") are companies in the separate
    // dashboard feed fixtures, which this sprint did not touch.
    for (const name of [
      "Bonny Trader",
      "Gulf Sentinel",
      "Star of Lagos",
      "Delta Nomad",
      "Onne Voyager",
      "Escravos Reach",
      "Kaduna Voyager",
    ]) {
      expect(data).not.toContain(name);
    }
  });

  it("no fixture carries screen-space coordinates posing as positions", () => {
    // The tell for the original defect: `x`/`y` percentages rendered as
    // vessel locations. Real positions are lat/lon and come from a feed.
    expect(data).not.toMatch(/\bx:\s*\d+,\s*y:\s*\d+/);
  });

  it("Mission Control renders no hardcoded vessel array", () => {
    const source = read(MISSION_CONTROL);
    expect(source).not.toMatch(/vessels=\{\s*\[/);
  });
});

/* ═══════ The LIVE claim ═══════ */

describe("Mission Control never hardcodes the LIVE claim", () => {
  const source = read(MISSION_CONTROL);

  it("has no literal live={true}", () => {
    expect(source).not.toMatch(/live=\{true\}/);
    expect(source).not.toMatch(/live\s*=\s*"true"/);
  });

  it("derives the state from the feed via the shared resolver", () => {
    expect(source).toContain("resolveMapDataState");
  });

  it("binds the pulse to the resolved state rather than asserting it", () => {
    // The animation is a claim about currency. It must be conditional.
    const pulse = /animate-pulse/.test(source);
    if (pulse) expect(source).toMatch(/isLive|state === "LIVE"|dataState/);
  });
});
