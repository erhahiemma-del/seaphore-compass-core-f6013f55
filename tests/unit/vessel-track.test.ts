/**
 * The path a vessel took, and what that path is worth.
 *
 * Two states, because there are only two honest ones. A line drawn from a
 * destination LOCODE to a current position would be a great-circle guess
 * wearing the visual language of evidence, and no connected source
 * provides geocoded origins or destinations to build a real one from — so
 * there is no estimated-route state until one does.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMPTY_TRACK,
  TRACK_UNAVAILABLE_LABEL,
  resolveVesselTrack,
  toTrackCollection,
  trackProvenanceLabel,
  trackStateLabel,
} from "@/services/geospatial/vessel-track";
import type { VesselHistory, VesselTrackPoint } from "@/services/geospatial/vessel-history";
import { SimulatedVesselSource } from "@/services/geospatial/sources/simulated-vessel-source";
import { registerVesselSource } from "@/services/geospatial/vessel-source";

/*
 * The registry is populated at the composition root, not on import, so a
 * unit run starts empty. Registering here exercises the real lookup
 * rather than stubbing the answer the code is supposed to derive.
 */
registerVesselSource(new SimulatedVesselSource({ seed: 1, fleetSize: 2 }));

function point(lon: number, lat: number, at: string): VesselTrackPoint {
  return { position: [lon, lat], timestamp: at, kind: "OBSERVED" };
}

const HISTORY: VesselHistory = {
  status: "available",
  track: [
    point(3.0, 6.0, "2026-01-01T00:00:00Z"),
    point(3.1, 6.1, "2026-01-01T01:00:00Z"),
    point(3.2, 6.2, "2026-01-01T02:00:00Z"),
  ],
  events: [],
  from: "2026-01-01T00:00:00Z",
  to: "2026-01-01T02:00:00Z",
};

describe("capability and data are different answers", () => {
  it("says the source keeps no archive when there is none", () => {
    /*
     * A limit of what Seaphore is connected to, not a fact about the
     * vessel. Collapsing the two would tell an officer the ship sat
     * still when the truth is that nobody was recording.
     */
    const track = resolveVesselTrack(null, null);
    expect(track.state).toBe("UNAVAILABLE");
    if (track.state !== "UNAVAILABLE") return;
    expect(track.reason).toBe("SOURCE_HAS_NO_HISTORY");
  });

  it("says the archive holds nothing for this hull", () => {
    const track = resolveVesselTrack({ status: "unavailable", reason: "none" }, "simulated");
    expect(track.state).toBe("UNAVAILABLE");
    if (track.state !== "UNAVAILABLE") return;
    expect(track.reason).toBe("NO_RECORDS_FOR_VESSEL");
  });

  it("gives each reason its own sentence", () => {
    const reasons = Object.values(TRACK_UNAVAILABLE_LABEL);
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const label of reasons) expect(label.length).toBeGreaterThan(20);
  });

  it("treats a single position as no track", () => {
    /*
     * One position is where the vessel was once. Drawing it as a path
     * would imply a journey between a point and itself.
     */
    const single: VesselHistory = { ...HISTORY, track: [HISTORY.track[0]!] };
    expect(resolveVesselTrack(single, "simulated").state).toBe("UNAVAILABLE");
  });
});

describe("a recorded track is the points, untouched", () => {
  it("passes reported positions straight through", () => {
    // Nothing resampled, smoothed or padded: the shape of the data is
    // part of what the officer is reading.
    const track = resolveVesselTrack(HISTORY, "simulated");
    expect(track.state).toBe("RECORDED_TRACK");
    if (track.state !== "RECORDED_TRACK") return;
    expect(track.points).toHaveLength(3);
    expect(track.points[0]!.position).toEqual([3.0, 6.0]);
    expect(track.from).toBe(HISTORY.from);
  });

  it("draws one line, not a feature per point", () => {
    /*
     * The track is one claim about one vessel. A feature per reported
     * point would put thousands of objects on the map to say what a
     * single line says.
     */
    const collection = toTrackCollection(resolveVesselTrack(HISTORY, "simulated"));
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]!.geometry.type).toBe("LineString");
    expect(collection.features[0]!.geometry.coordinates).toHaveLength(3);
  });

  it("clears the line when there is no track", () => {
    // An empty collection is how deselecting removes the history —
    // one code path, not two.
    expect(toTrackCollection(resolveVesselTrack(null, null))).toEqual(EMPTY_TRACK);
  });
});

describe("wording comes from the source, never a vessel id", () => {
  it("never calls simulated movement recorded or observed", () => {
    const track = resolveVesselTrack(HISTORY, "simulated");
    if (track.state !== "RECORDED_TRACK") throw new Error("expected a track");
    expect(track.simulated).toBe(true);
    expect(trackStateLabel(track)).toBe("Simulated track");
    const sentence = trackProvenanceLabel(track).toLowerCase();
    expect(sentence).toContain("simulated");
    expect(sentence).not.toContain("observed");
    expect(sentence).not.toContain("recorded");
    expect(sentence).not.toContain("reported by");
  });

  it("keys off the declared source type, not the vessel", () => {
    const module = readFileSync(
      resolve(process.cwd(), "src/services/geospatial/vessel-track.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(module).toContain('descriptor?.type === "SIMULATED"');
    expect(module).not.toMatch(/SIM-\d/);
  });

  it("offers no estimated-route state at all", () => {
    /*
     * Deferred deliberately until a source supplies geocoded origin and
     * destination. Its absence from the type is what stops it being
     * added by accident.
     */
    const module = readFileSync(
      resolve(process.cwd(), "src/services/geospatial/vessel-track.ts"),
      "utf8",
    );
    expect(module).not.toContain("ESTIMATED_ROUTE");
    expect(module).not.toContain("greatCircle");
  });
});

describe("the map draws it beneath the vessel", () => {
  const renderer = readFileSync(
    resolve(process.cwd(), "src/services/geospatial/renderers/maplibre-renderer.ts"),
    "utf8",
  );

  it("installs the track source before the vessels", () => {
    // A vessel must never be covered by its own history.
    const track = renderer.indexOf("SOURCE_IDS.vesselTrack");
    const vessels = renderer.indexOf("map.addSource(SOURCE_IDS.vessels");
    expect(track).toBeGreaterThan(-1);
    expect(track).toBeLessThan(vessels);
  });

  it("draws it dashed and subordinate", () => {
    /*
     * A solid line at full strength would read as a continuously
     * observed path and compete with the vessel it belongs to.
     */
    const layer = renderer.slice(renderer.indexOf("id: LAYER_IDS.vesselTrack"));
    expect(layer.slice(0, 1400)).toContain('"line-dasharray"');
    expect(layer.slice(0, 1400)).toContain('"line-opacity"');
  });

  it("holds the line thin at depth", () => {
    // Without a ceiling the track thickens with zoom until it covers the
    // vessel at the moment the officer is inspecting it.
    const layer = renderer.slice(renderer.indexOf("id: LAYER_IDS.vesselTrack"));
    expect(layer.slice(0, 1400)).toContain("MAX_CAMERA_ZOOM");
  });
});
