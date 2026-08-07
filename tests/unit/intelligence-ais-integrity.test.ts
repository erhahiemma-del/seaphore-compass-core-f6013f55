import { afterEach, describe, expect, it } from "vitest";

import {
  AISBehaviourAnalyzer,
  type AisMovementEvent,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";
import { bandOf, propagate, anchorFromEvidence } from "@/services/reasoning";
import {
  aggregateFindings,
  aisIntegrityModule,
  isValidFinding,
  RiskModuleRegistry,
  validateFinding,
} from "@/services/intelligence";

const NOW = Date.parse("2026-08-06T12:00:00.000Z");
const VESSEL = "9411765";

function hoursAgo(h: number): string {
  return new Date(NOW - h * 3_600_000).toISOString();
}

/** Two long disabling events near a port, in clear weather and dense traffic. */
function interruptedTrack(): AisMovementEvent[] {
  const base = { weather: "clear", trafficDensity: "dense", nearestPort: "Lagos" } as const;
  return [
    { timestamp: hoursAgo(120), latitude: 6.4, longitude: 3.4, distanceFromPortNm: 10, ...base },
    { timestamp: hoursAgo(90), latitude: 6.5, longitude: 3.5, distanceFromPortNm: 12, ...base },
    { timestamp: hoursAgo(60), latitude: 6.6, longitude: 3.6, distanceFromPortNm: 14, ...base },
    { timestamp: hoursAgo(10), latitude: 6.7, longitude: 3.7, distanceFromPortNm: 16, ...base },
  ];
}

function publish(events: AisMovementEvent[]) {
  const report = AISBehaviourAnalyzer.analyse({ vesselId: VESSEL, events });
  return { report, assessment: OSAE.publishAisContinuity(report) };
}

const context = { subjectId: VESSEL, displayName: "MV Test", now: NOW };

afterEach(() => {
  OSAE.__reset();
});

describe("AIS Integrity module", () => {
  it("is registered ready — its source is connected", () => {
    expect(aisIntegrityModule.status).toBe("ready");
    expect(aisIntegrityModule.pendingReason).toBeUndefined();
  });

  it("reports insufficient evidence when OSAE holds no assessment", async () => {
    // Silence here would render identically to a clean vessel.
    const [finding] = await aisIntegrityModule.evaluate(context);

    expect(finding.status).toBe("insufficient-evidence");
    expect(finding.unavailableReason).toMatch(/has been published to OSAE/);
    expect(finding.priority).toBeNull();
    expect(isValidFinding(finding)).toBe(true);
  });

  it("marks a continuously-transmitting vessel not-applicable, not clean", async () => {
    publish([
      { timestamp: hoursAgo(4), latitude: 6.4, longitude: 3.4 },
      { timestamp: hoursAgo(2), latitude: 6.5, longitude: 3.5 },
    ]);

    const [finding] = await aisIntegrityModule.evaluate(context);

    expect(finding.status).toBe("not-applicable");
    expect(finding.evidence).toEqual([]);
    expect(finding.priority).toBeNull();
    expect(isValidFinding(finding)).toBe(true);
  });

  it("produces a supported finding with one evidence ref per interruption", async () => {
    const { report } = publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate(context);

    expect(finding.status).toBe("supported");
    expect(finding.evidence).toHaveLength(report.darkEvents.length);
    expect(finding.evidence[0].type).toBe("AIS_DARK");
    expect(isValidFinding(finding)).toBe(true);
  });

  it("copies OSAE's priority rather than deriving one", async () => {
    const { assessment } = publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate(context);

    expect(finding.priority).toBe(assessment.priority);
    expect(finding.statement).toBe(assessment.summary);
    expect(finding.priorityRationale).toBeTruthy();
  });

  it("uses reasoning's ladder verbatim", async () => {
    const { report } = publish(interruptedTrack());
    const expected = propagate(anchorFromEvidence(report.darkEvents));

    const [finding] = await aisIntegrityModule.evaluate(context);

    expect(finding.assessment?.propagation).toEqual(expected);
    expect(finding.assessment?.confidence).toBe(expected.assessment);
    expect(finding.assessment?.band).toBe(bandOf(expected.assessment));
  });

  it("grades evidence with the OSINT engine, not the assessment band", async () => {
    publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate(context);

    // Six-value evidence vocabulary, never the four-value band vocabulary.
    expect(["AUDITED", "VERIFIED", "CORROBORATED", "INFERRED", "DECLARED", "OBSERVED"]).toContain(
      finding.evidence[0].grade,
    );
  });

  it("states a counter-hypothesis whenever the band demands one", async () => {
    publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate(context);
    const band = finding.assessment!.band;

    if (band === "high" || band === "medium") {
      expect(finding.assessment?.counterHypothesis?.statement).toMatch(/equipment failure/);
    } else {
      expect(finding.assessment?.counterHypothesis).toBeNull();
    }
    expect(validateFinding(finding)).toEqual([]);
  });

  it("carries a why-chain that ends at OSAE's summary", async () => {
    const { assessment } = publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate(context);
    const chain = finding.assessment!.whyChain;

    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0].step).toBe(1);
    expect(chain[chain.length - 1].statement).toBe(assessment.summary);
  });

  it("attributes evidence to the caller's source when one is supplied", async () => {
    publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate({
      ...context,
      sources: [
        {
          source: "global-fishing-watch",
          provider: "Global Fishing Watch",
          retrievedAt: new Date(NOW).toISOString(),
          observedAt: hoursAgo(10),
        },
      ],
    });

    expect(finding.evidence[0].provenance.source).toBe("global-fishing-watch");
  });

  it("says so plainly when no provenance was supplied", async () => {
    publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate(context);

    expect(finding.evidence[0].provenance.source).toBe("unattributed");
  });

  it("names the gaps in what it can see", async () => {
    publish(interruptedTrack());

    const [finding] = await aisIntegrityModule.evaluate(context);

    expect(finding.dataQuality.gaps).toContain("no distance from coast for some interruptions");
  });

  it("aggregates alongside the pending modules", async () => {
    publish(interruptedTrack());
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);

    const set = await aggregateFindings(VESSEL, "MV Test", { registry, now: NOW });

    expect(set.counts.supported).toBe(1);
    expect(set.violations).toEqual([]);
    expect(set.contributions[0].status).toBe("ready");
  });
});
