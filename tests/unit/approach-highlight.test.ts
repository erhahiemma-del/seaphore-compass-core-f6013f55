/**
 * Showing the officer which vessels an answer is about.
 *
 * A count without a picture is a number an officer has to take on
 * trust. The highlight is how the answer reaches the map — and because
 * it reaches the map, it has to obey the same rule as everything else
 * drawn there: it may present what was assessed, and must not present
 * an unanswered question as a result.
 */
import { describe, expect, it } from "vitest";

import { executeCopilotAction } from "@/services/copilot/copilot-actions";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";
import { vesselOpacity } from "@/services/geospatial/vessel";
import type { LonLat, Vessel } from "@/services/geospatial";

/** The synthetic boundary the other approach tests use. */
const RING: readonly LonLat[] = [
  [3, 4],
  [7, 4],
  [7, 6],
  [3, 6],
];

const vessel = (imo: string, over: Partial<Vessel["position"]> = {}): Vessel =>
  ({
    identity: { imo, name: `Vessel ${imo}` },
    position: {
      lon: 2.0,
      lat: 5.0,
      heading: 90,
      speed: 14,
      timestamp: new Date().toISOString(),
      ...over,
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  }) as Vessel;

const run = (fleet: readonly Vessel[], thresholdHours: number) => {
  const service = new SharedGeospatialService();
  const result = executeCopilotAction(
    { type: "SHOW_APPROACHING_VESSELS", thresholdHours },
    { service, fleet, boundaryRing: RING },
  );
  return { service, result };
};

describe("the answer reaches the map", () => {
  it("highlights the vessels the assessment returned", () => {
    const { service, result } = run([vessel("A"), vessel("B")], 72);
    expect(result.ok).toBe(true);
    const highlighted = service.get().approachHighlight;
    expect(highlighted.length).toBe(result.approach?.approaching.length);
    expect(highlighted.length).toBeGreaterThan(0);
  });

  it("never highlights a vessel it could not assess", () => {
    /*
     * A stopped vessel has no arrival time. Highlighting it would show
     * an unanswered question as part of the answer — the officer would
     * count it among the vessels arriving.
     */
    const { service, result } = run([vessel("MOVING"), vessel("STOPPED", { speed: 0 })], 72);
    expect(result.approach?.unassessable.map((e) => e.vessel.identity.imo)).toContain("STOPPED");
    expect(service.get().approachHighlight).not.toContain("STOPPED");
  });

  it("carries the assessment, not only the sentence", () => {
    /*
     * A surface must be able to render distance, basis and provenance
     * without parsing them back out of prose.
     */
    const { result } = run([vessel("A")], 72);
    const entry = result.approach?.approaching[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.vessel.identity.imo).toBe("A");
    expect(entry.assessment.relation).toBeTruthy();
    expect(entry.assessment.basis).toBeTruthy();
    expect(entry.assessment.rationale.length).toBeGreaterThan(10);
    expect(result.approach?.boundaryAccuracy).toBe("APPROXIMATE");
    expect(typeof entry.positionAgeMs).toBe("number");
  });

  it("replaces the previous answer rather than accumulating", () => {
    const service = new SharedGeospatialService();
    const opts = { service, boundaryRing: RING };
    executeCopilotAction(
      { type: "SHOW_APPROACHING_VESSELS", thresholdHours: 72 },
      {
        ...opts,
        fleet: [vessel("A"), vessel("B")],
      },
    );
    const first = service.get().approachHighlight.length;
    executeCopilotAction(
      { type: "SHOW_APPROACHING_VESSELS", thresholdHours: 72 },
      {
        ...opts,
        fleet: [vessel("A")],
      },
    );
    // The second answer is the answer; the first is not still on screen.
    expect(service.get().approachHighlight.length).toBeLessThan(first);
  });

  it("clears the fleet answer when one vessel is chosen", () => {
    const { service } = run([vessel("A"), vessel("B")], 72);
    expect(service.get().approachHighlight.length).toBeGreaterThan(0);
    executeCopilotAction({ type: "SELECT_VESSEL", imo: "A" }, { service });
    // Otherwise the map stays dimmed around an unrelated selection.
    expect(service.get().approachHighlight).toEqual([]);
  });

  it("refuses rather than answering with an empty highlight", () => {
    const service = new SharedGeospatialService();
    const noFleet = executeCopilotAction(
      { type: "SHOW_APPROACHING_VESSELS", thresholdHours: 24 },
      { service, fleet: [], boundaryRing: RING },
    );
    expect(noFleet.ok).toBe(false);
    expect(service.get().approachHighlight).toEqual([]);

    const noRing = executeCopilotAction(
      { type: "SHOW_APPROACHING_VESSELS", thresholdHours: 24 },
      { service, fleet: [vessel("A")], boundaryRing: [] },
    );
    expect(noRing.ok).toBe(false);
    expect(noRing.reason).toMatch(/boundary/i);
  });
});

describe("highlighting dims, it does not hide", () => {
  it("dims a vessel outside the answer", () => {
    /*
     * Removed from the map, a vessel looks like one the source stopped
     * reporting. Dimmed, it looks like what it is: still there, not part
     * of this answer.
     */
    const inside = vesselOpacity(vessel("A"), { highlightedImos: new Set(["A"]) });
    const outside = vesselOpacity(vessel("B"), { highlightedImos: new Set(["A"]) });
    expect(outside).toBeLessThan(inside);
    expect(outside).toBeGreaterThan(0);
  });

  it("leaves every vessel alone when no answer is on screen", () => {
    const normal = vesselOpacity(vessel("A"), {});
    const highlighted = vesselOpacity(vessel("A"), { highlightedImos: new Set(["A"]) });
    expect(normal).toBe(highlighted);
  });

  it("keeps the selected vessel fully drawn even outside the answer", () => {
    // The officer's own choice outranks a fleet answer.
    const selected = vesselOpacity(vessel("B"), {
      selectedImo: "B",
      highlightedImos: new Set(["A"]),
    });
    expect(selected).toBe(vesselOpacity(vessel("A"), {}));
  });
});
