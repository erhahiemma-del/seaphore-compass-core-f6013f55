/**
 * Replay must not become an operational alert.
 *
 * The map showing the past is the point of replay. The alert layer
 * reasoning about the past as though it were the present is a
 * falsehood, and it is the kind that reaches an officer as a number
 * they act on rather than as a visible glitch.
 *
 * It happened. `MapCanvas` published `engine.snapshot()` to every
 * consumer, and during replay the engine holds historical frames by
 * design — so the approach engine received two-minute-old positions and
 * the reconciliation stamped the result `assessedAt: now`. Measured in
 * the browser: an alert whose evidence was observed at 16:03:02 carried
 * an assessment time of 16:05:09, a lag of 126 seconds, against a live
 * baseline of 0.25 seconds.
 *
 * These guard both halves of the fix: that evidence carries the
 * observation's own time rather than the assessment's, so the lag is
 * visible at all, and that the wiring hands the alert runner the live
 * fleet rather than the drawn one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { InMemoryAlertRepository, runReconciliationCycle } from "@/services/alerts";
import type { LonLat, Vessel } from "@/services/geospatial";

const RING: readonly LonLat[] = [
  [2.5, 3.0],
  [6.5, 3.0],
  [6.5, 5.5],
  [2.5, 5.5],
  [2.5, 3.0],
];

const NOW = Date.parse("2026-08-28T16:05:00.000Z");

function vesselObservedAt(observedAtMs: number): Vessel {
  return {
    identity: { imo: "SIM-0003", name: "Sapele Horizon" },
    position: {
      lon: 7.2,
      lat: 4.0,
      heading: 270,
      speed: 14,
      timestamp: new Date(observedAtMs).toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  } as Vessel;
}

describe("alert evidence carries the observation's own time", () => {
  it("records when the position was observed, not when it was assessed", async () => {
    const repository = new InMemoryAlertRepository();
    // A frame observed two minutes before the cycle ran — exactly the
    // shape a replayed vessel arrives in.
    const observedAt = NOW - 126_000;

    await runReconciliationCycle({
      vessels: [vesselObservedAt(observedAt)],
      boundaryRing: RING,
      sourceId: "simulated",
      repository,
      now: () => NOW,
    });

    const [alert] = await repository.listActive();
    expect(alert).toBeDefined();
    expect(alert.evidence.observedAt).toBe(new Date(observedAt).toISOString());
    expect(alert.evidence.assessedAt).toBe(new Date(NOW).toISOString());
    /*
     * The two must stay separable. Collapsing them would hide precisely
     * the defect this file exists for: an assessment of stale data would
     * become indistinguishable from an assessment of fresh data.
     */
    expect(alert.evidence.observedAt).not.toBe(alert.evidence.assessedAt);
  });

  it("shows no lag when the observation is current", async () => {
    const repository = new InMemoryAlertRepository();

    await runReconciliationCycle({
      vessels: [vesselObservedAt(NOW)],
      boundaryRing: RING,
      sourceId: "simulated",
      repository,
      now: () => NOW,
    });

    const [alert] = await repository.listActive();
    expect(Date.parse(alert.evidence.assessedAt) - Date.parse(alert.evidence.observedAt)).toBe(0);
  });
});

/*
 * The wiring itself, read from source.
 *
 * The defect was not in any single module — every one behaved correctly
 * in isolation. It was in which list was handed to which consumer, and
 * that is a fact about the composition rather than about a function, so
 * it is asserted the way this repository already asserts its other
 * composition rules.
 */
describe("the alert runner is fed the live fleet, not the drawn one", () => {
  const COMMAND = readFileSync(
    resolve(process.cwd(), "src/features/maritime/MaritimeCommand.tsx"),
    "utf8",
  );
  const CANVAS = readFileSync(
    resolve(process.cwd(), "src/features/maritime/MapCanvas.tsx"),
    "utf8",
  );

  it("passes liveVessels to the approach assessment", () => {
    const call = COMMAND.slice(
      COMMAND.indexOf("useArrivalAlerts({"),
      COMMAND.indexOf("useArrivalAlerts({") + 260,
    );

    expect(call).toContain("vessels: liveVessels");
    // The drawn set must not reach it: during replay that set is
    // historical, and an alert derived from it would describe the past.
    expect(call).not.toMatch(/vessels,\s*$/m);
  });

  it("keeps the drawn set for the map, drawer and search", () => {
    // Both sets exist and are distinct. One of them collapsing back into
    // the other is the regression.
    expect(COMMAND).toContain("const [vessels, setVessels]");
    expect(COMMAND).toContain("const [liveVessels, setLiveVessels]");
  });

  it("publishes the live batch separately while replay owns the display", () => {
    // withheldRef holds what the provider reported but the display is
    // not showing, which is what makes a live answer possible at all
    // while the engine is full of historical frames.
    expect(CANVAS).toContain("withheldRef.current ?? engine.snapshot()");
  });
});
