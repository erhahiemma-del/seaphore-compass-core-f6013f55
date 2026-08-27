/**
 * Demonstration traffic, and the guards that keep it from passing as real.
 *
 * Synthetic vessels moving coherently along plausible approaches are
 * indistinguishable from the real thing by eye. That is what makes the
 * simulation useful and what makes it dangerous: an officer who mistook
 * it for the live picture would be making operational judgements about
 * ships that do not exist.
 *
 * The protections therefore cannot live in a comment or a reviewer's
 * memory. They are: a source type no status vocabulary maps to "live",
 * identifiers that cannot collide with real ones, and provenance that
 * distinguishes a reporting tick from the silence between two.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SimulatedVesselSource,
  fixOnRoute,
  kindForMoment,
} from "@/services/geospatial/sources/simulated-vessel-source";
import { mayClaimLive } from "@/services/geospatial/vessel-source";
import { isObserved } from "@/services/geospatial/position-provenance";

const EPOCH = Date.parse("2026-01-01T00:00:00Z");

function sourceAt(ms: number, seed = 1234) {
  return new SimulatedVesselSource({ seed, epoch: EPOCH, now: () => EPOCH + ms, fleetSize: 32 });
}

describe("the same seed gives the same fleet", () => {
  it("reproduces identical vessels across constructions", async () => {
    // Reproducibility is what makes "did it teleport" and "does replay
    // redraw the picture" testable rather than observational.
    const a = await sourceAt(0, 42).list();
    const b = await sourceAt(0, 42).list();
    expect(a.map((v) => v.identity.imo)).toEqual(b.map((v) => v.identity.imo));
    expect(a.map((v) => v.position.lon)).toEqual(b.map((v) => v.position.lon));
    expect(a.map((v) => v.position.lat)).toEqual(b.map((v) => v.position.lat));
  });

  it("gives a different fleet for a different seed", async () => {
    const a = await sourceAt(0, 1).list();
    const b = await sourceAt(0, 2).list();
    expect(a.map((v) => v.identity.name)).not.toEqual(b.map((v) => v.identity.name));
  });

  it("builds the fleet the caller asked for", async () => {
    expect(await sourceAt(0).list()).toHaveLength(32);
  });
});

describe("vessels move, and never teleport", () => {
  it("advances continuously between samples", async () => {
    /*
     * A teleport is the artefact a generated fleet most easily produces
     * — a route that loops jumps from its last waypoint back to its
     * first. The route reverses instead, so this holds at the seam too.
     */
    let previous = await sourceAt(0).list();
    for (let step = 1; step <= 40; step++) {
      const current = await sourceAt(step * 30_000).list();
      for (let i = 0; i < current.length; i++) {
        const a = previous[i]!.position;
        const b = current[i]!.position;
        const degrees = Math.hypot(b.lon - a.lon, b.lat - a.lat);
        // 30 s at 18 kn is 0.15 nm — well under a tenth of a degree.
        expect(degrees, `vessel ${i} jumped at step ${step}`).toBeLessThan(0.1);
      }
      previous = current;
    }
  });

  it("actually moves rather than sitting still", async () => {
    const start = await sourceAt(0).list();
    const later = await sourceAt(30 * 60_000).list();
    const moved = start.filter((vessel, i) => {
      const then = later[i]!.position;
      return Math.hypot(then.lon - vessel.position.lon, then.lat - vessel.position.lat) > 0.001;
    });
    expect(moved.length).toBe(start.length);
  });

  it("is a pure function of route and time", () => {
    // No clock read, no randomness, no state.
    const route = {
      id: "t",
      label: "t",
      destination: "X",
      waypoints: [
        [3, 6],
        [4, 6],
      ] as const,
    };
    const first = fixOnRoute(route as never, 10, 600);
    const second = fixOnRoute(route as never, 10, 600);
    expect(first).toEqual(second);
  });
});

describe("provenance is used, not stamped", () => {
  it("reports on the tick and interpolates between", () => {
    /*
     * A real feed reports periodically and is silent in between. Marking
     * every generated point OBSERVED would make the provenance model
     * decorative on the only source that exercises it.
     */
    expect(kindForMoment(0)).toBe("OBSERVED");
    expect(kindForMoment(60_000)).toBe("OBSERVED");
    expect(kindForMoment(30_000)).toBe("DISPLAY_INTERPOLATED");
    expect(kindForMoment(59_999)).toBe("DISPLAY_INTERPOLATED");
  });

  it("marks a between-reports position as not observed", async () => {
    const between = await sourceAt(30_000).list();
    expect(between[0]!.position.kind).toBe("DISPLAY_INTERPOLATED");
    expect(isObserved(between[0]!.position.kind)).toBe(false);
  });

  it("returns only reporting ticks as history", async () => {
    /*
     * The archive an officer would cite. A history containing every
     * instant would claim a continuous record no feed produces.
     */
    const source = sourceAt(6 * 60 * 60 * 1000);
    const history = await source.history("SIM-0001");
    expect(history.status).toBe("available");
    if (history.status !== "available") return;
    expect(history.track.length).toBeGreaterThan(10);
    expect(history.track.every((point) => point.kind === "OBSERVED")).toBe(true);
  });

  it("says so plainly when a vessel is not in the fleet", async () => {
    const history = await sourceAt(0).history("SIM-9999");
    expect(history.status).toBe("unavailable");
    if (history.status !== "unavailable") return;
    // Officer-facing, not a lookup failure.
    expect(history.reason).not.toMatch(/undefined|null|404|error/i);
  });
});

describe("heading honesty survives the simulation", () => {
  it("reports a course only because a route genuinely has one", async () => {
    const vessels = await sourceAt(0).list();
    for (const vessel of vessels) {
      expect(vessel.position.headingReported).toBe(true);
      expect(vessel.position.heading).toBeGreaterThanOrEqual(0);
      expect(vessel.position.heading).toBeLessThan(360);
    }
  });

  it("assesses no risk", async () => {
    /*
     * Fabricating traffic is one thing; fabricating intelligence about
     * it is a different and worse thing. Every simulated vessel is
     * UNKNOWN and unranked.
     */
    const vessels = await sourceAt(0).list();
    for (const vessel of vessels) {
      expect(vessel.riskLevel).toBe("UNKNOWN");
      expect(vessel.attentionScore).toBe(0);
    }
  });
});

describe("it cannot be mistaken for a real feed", () => {
  it("declares a source type that may never claim live", () => {
    expect(mayClaimLive("SIMULATED")).toBe(false);
    for (const real of ["OSINT", "COMMERCIAL", "GOVERNMENT"] as const) {
      expect(mayClaimLive(real), real).toBe(true);
    }
    expect(sourceAt(0).describe().type).toBe("SIMULATED");
  });

  it("carries identifiers that cannot collide with real vessels", async () => {
    /*
     * A real IMO is seven digits and a real MMSI is nine. Prefixing
     * every identity means a synthetic vessel can never be looked up as,
     * confused with, or cited as a real ship.
     */
    const vessels = await sourceAt(0).list();
    for (const vessel of vessels) {
      expect(vessel.identity.imo.startsWith("SIM-")).toBe(true);
      expect(/^\d{7}$/.test(vessel.identity.imo)).toBe(false);
      expect(vessel.identity.mmsi).toBeUndefined();
    }
  });

  it("never describes itself as live, real-time or observed", () => {
    /*
     * The contract the whole feature rests on. Officer-facing text from
     * this source must not contain the vocabulary of a real feed.
     */
    const descriptor = sourceAt(0).describe();
    const report = sourceAt(0).report();
    const officerFacing = [
      descriptor.label,
      descriptor.description,
      descriptor.caveat ?? "",
      report.message ?? "",
    ].join(" ");
    for (const banned of ["live", "real-time", "realtime", "current ais", "observed"]) {
      expect(officerFacing.toLowerCase(), `claims "${banned}"`).not.toContain(banned);
    }
  });

  it("states plainly that the vessels do not exist", () => {
    const descriptor = sourceAt(0).describe();
    expect(descriptor.caveat).toContain("do not exist");
  });

  it("does not switch itself on", () => {
    /*
     * An empty map is the truthful default when nothing is connected. A
     * demonstration that appears unasked is one somebody will eventually
     * mistake for the operational picture.
     */
    expect(sourceAt(0).describe().defaultEnabled).toBe(false);
  });

  it("claims no confidence in a position it invented", () => {
    const report = sourceAt(0).report();
    expect(report.confidence).toBeNull();
    expect(report.confidenceLevel).toBeNull();
  });
});

describe("it reuses the existing provider architecture", () => {
  it("adds no parallel registry or camera path", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/services/geospatial/sources/simulated-vessel-source.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).toContain("registerVesselSource");
    for (const forbidden of ["setCamera", "flyTo(", "navigateTo(", "new Map<"]) {
      expect(source, `simulation reaches for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("uses no uncontrolled randomness during motion", () => {
    /*
     * A position that depends on when you asked cannot be replayed or
     * tested. The seeded generator builds the fleet and is never called
     * again.
     */
    const source = readFileSync(
      resolve(process.cwd(), "src/services/geospatial/sources/simulated-vessel-source.ts"),
      "utf8",
    );
    const motion = source.slice(source.indexOf("export function fixOnRoute"));
    expect(motion).not.toContain("Math.random");
  });
});
