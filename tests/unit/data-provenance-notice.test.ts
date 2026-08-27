/**
 * Whether the officer is told what kind of data is on the map.
 *
 * The simulation can be switched on and thirty-two vessels appear moving
 * along plausible approaches. By eye that is indistinguishable from the
 * operational picture, and an officer who mistook it for one would be
 * making judgements about ships that do not exist.
 *
 * The notice that prevents this has to survive refactors, so these tests
 * hold the two properties that make it durable: it is derived from
 * source state rather than declared, and it names no provider.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const NOTICE = readFileSync(
  resolve(process.cwd(), "src/features/maritime/DataProvenanceNotice.tsx"),
  "utf8",
);
const SHELL = readFileSync(
  resolve(process.cwd(), "src/features/maritime/MaritimeCommand.tsx"),
  "utf8",
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const CODE = stripComments(NOTICE);

describe("the notice is derived, not declared", () => {
  it("reads the enabled sources and asks them their type", () => {
    /*
     * The property that makes it disappear on its own when a real
     * provider is connected: the condition that produced it stops being
     * true, rather than somebody remembering to remove it.
     */
    expect(CODE).toContain("enabledSources");
    expect(CODE).toContain("getVesselSource");
    expect(CODE).toContain("describe().type");
  });

  it("carries no demo flag and names no provider", () => {
    /*
     * An `isDemo` boolean gets dropped in a mapping function. A hardcoded
     * provider name in officer-facing UI is the thing the source
     * descriptor model exists to prevent.
     */
    for (const forbidden of [
      "isDemo",
      "simulated-vessel-source",
      "SimulatedVesselSource",
      "Datalastic",
      "global-fishing-watch",
    ]) {
      expect(CODE, `notice hardcodes ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keys its copy by source type so a new kind gets a statement", () => {
    expect(CODE).toContain("Partial<Record<SourceType");
    expect(CODE).toContain("SIMULATED");
  });

  it("says nothing for the unremarkable case", () => {
    /*
     * A notice that appears always carries no information. Government
     * and commercial feeds are the expected case and get no entry, so
     * the component returns null for them.
     */
    expect(CODE).toContain("if (!notice) return null");
    expect(CODE).not.toContain("GOVERNMENT:");
    expect(CODE).not.toContain("COMMERCIAL:");
  });
});

describe("what it says", () => {
  it("states demonstration data plainly", () => {
    expect(NOTICE).toContain("Demonstration data");
    expect(NOTICE).toContain("Simulated vessel activity for system preview.");
  });

  it("never uses the vocabulary of a real feed", () => {
    const copy = CODE.slice(CODE.indexOf("const NOTICE"), CODE.indexOf("export function"));
    for (const banned of ["live", "real-time", "current ais", "observed"]) {
      expect(copy.toLowerCase(), `notice claims "${banned}"`).not.toContain(banned);
    }
  });

  it("describes a mixed picture by its weakest data", () => {
    /*
     * One simulated source among real ones still raises the notice. If
     * any part of what is drawn is invented, the officer needs to know
     * before trusting any of it.
     */
    expect(CODE).toContain('types.includes("SIMULATED")');
  });
});

describe("it costs no new position on the map", () => {
  it("mounts inside the zone that already owns picture explanations", () => {
    // No new anchor means no new collision surface.
    expect(SHELL).toContain("<DataProvenanceNotice />");
    const column = SHELL.slice(SHELL.indexOf("MAP_ZONE.LEFT_CONTEXT"));
    expect(column.slice(0, 900)).toContain("DataProvenanceNotice");
  });

  it("does not re-render on every camera move", () => {
    /*
     * `enabledSources` is a new array on every state write, so selecting
     * it directly would re-render this on every pan and zoom.
     */
    expect(CODE).toContain('state.enabledSources.join(",")');
  });
});
