/**
 * Sprint 1D-AIS — Voyage-Based AIS Segmentation regression tests.
 *
 * Covers:
 *   • Chronological segmentation into discrete events.
 *   • Per-event start/end time, duration, location, nearest port, confidence.
 *   • Multi-year "gap" is NOT reported as one aggregated interruption.
 *   • Pattern detection (repeated disabling, port approach, boundary
 *     crossing, offshore loitering).
 *   • OSAE per-event assessment + overall priority driven by segmented events.
 *   • Preserves the Sprint 1C `AIS_DARK` / `darkEvents` contract.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  AISBehaviourAnalyzer,
  type AisMovementEvent,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";
import {
  buildAisContinuitySection,
} from "@/lib/copilot/executive-brief/synthesize";

function evt(iso: string, lat: number, lon: number, extras: Partial<AisMovementEvent> = {}): AisMovementEvent {
  return { timestamp: iso, latitude: lat, longitude: lon, ...extras };
}

describe("AIS Voyage-Based Segmentation (Sprint 1D-AIS)", () => {
  beforeEach(() => OSAE.__reset());

  it("segments discrete disabling events with per-event context", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-seg",
      events: [
        evt("2026-01-01T00:00:00Z", 6.4, 3.4, { nearestPort: "Lagos", distanceFromPortNm: 12, weather: "clear" }),
        // 10h dark → disabling near port
        evt("2026-01-01T10:00:00Z", 6.5, 3.5, { nearestPort: "Lagos", distanceFromPortNm: 8 }),
        evt("2026-01-05T00:00:00Z", 4.0, 2.0),
        // 14h dark offshore
        evt("2026-01-05T14:00:00Z", 4.1, 2.1, { distanceFromCoastNm: 180 }),
        evt("2026-01-10T00:00:00Z", 3.9, 1.9, { distanceFromCoastNm: 200 }),
      ],
    });

    // 3 candidate gaps: 10h, 90h (start of second window), 14h, 106h.
    // Only the 4 gaps > 6h qualify.
    expect(report.gapsDetected).toBe(report.darkEvents.length);
    expect(report.totalInterruptions).toBeGreaterThanOrEqual(3);
    expect(report.darkEvents.every((d) => d.kind === "disabling")).toBe(true);

    const first = report.darkEvents[0];
    expect(first.type).toBe("AIS_DARK");
    expect(first.startAt).toBe("2026-01-01T00:00:00Z");
    expect(first.endAt).toBe("2026-01-01T10:00:00Z");
    expect(first.durationHours).toBeCloseTo(10, 1);
    expect(first.startLocation).toEqual({ latitude: 6.4, longitude: 3.4 });
    expect(first.endLocation).toEqual({ latitude: 6.5, longitude: 3.5 });
    expect(first.nearestPort).toBe("Lagos");
    expect(first.confidence).toBeGreaterThan(0);
  });

  it("does NOT report a multi-year single gap as one aggregated interruption", () => {
    // Two data points 3 years apart → coverage-uncertain, NOT a
    // single 3-year disabling event.
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-multiyear",
      events: [
        evt("2023-01-01T00:00:00Z", 0, 0),
        evt("2026-01-01T00:00:00Z", 0, 0),
      ],
    });
    expect(report.darkEvents).toHaveLength(1);
    expect(report.darkEvents[0].kind).toBe("coverage-uncertain");
    expect(report.totalInterruptions).toBe(0);
    expect(report.longestInterruptionHours).toBe(0);
    expect(report.darkEvents[0].explanation.toLowerCase()).toMatch(/coverage is uncertain/);
  });

  it("detects repeated-disabling pattern when ≥3 disabling events occur", () => {
    const events: AisMovementEvent[] = [];
    for (let i = 0; i < 4; i += 1) {
      events.push(evt(`2026-01-0${i + 1}T00:00:00Z`, 5, 5));
      events.push(evt(`2026-01-0${i + 1}T10:00:00Z`, 5, 5)); // 10h dark after each start
    }
    const report = AISBehaviourAnalyzer.analyse({ vesselId: "v-rep", events });
    expect(report.totalInterruptions).toBeGreaterThanOrEqual(3);
    const rep = report.patterns.find((p) => p.code === "repeated-disabling");
    expect(rep).toBeDefined();
    expect(rep!.occurrences).toBeGreaterThanOrEqual(3);
  });

  it("detects port-approach-disabling when ≥2 events start near a port", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-port",
      events: [
        evt("2026-02-01T00:00:00Z", 6.4, 3.4, { nearestPort: "Lagos", distanceFromPortNm: 8 }),
        evt("2026-02-01T09:00:00Z", 6.5, 3.5),
        evt("2026-02-05T00:00:00Z", 6.4, 3.4, { nearestPort: "Lagos", distanceFromPortNm: 12 }),
        evt("2026-02-05T09:00:00Z", 6.5, 3.5),
      ],
    });
    expect(report.patterns.some((p) => p.code === "port-approach-disabling")).toBe(true);
  });

  it("detects boundary-crossing when start and end are >200nm apart", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-bound",
      events: [
        evt("2026-03-01T00:00:00Z", 4, 3),
        evt("2026-03-01T20:00:00Z", 8, 7), // ~ >300nm away
      ],
    });
    expect(report.patterns.some((p) => p.code === "boundary-crossing")).toBe(true);
  });

  it("detects offshore loitering when dark ≥12h and ≥100nm offshore", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-loiter",
      events: [
        evt("2026-04-01T00:00:00Z", 2, 2, { distanceFromCoastNm: 150 }),
        evt("2026-04-01T20:00:00Z", 2.1, 2.1),
      ],
    });
    expect(report.patterns.some((p) => p.code === "offshore-loitering")).toBe(true);
  });

  it("OSAE assesses individual events AND produces overall priority", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-osae",
      events: [
        // Urgent: 30h disabling
        evt("2026-05-01T00:00:00Z", 5, 5),
        evt("2026-05-02T06:00:00Z", 5.1, 5.1),
        // Monitor: 8h disabling
        evt("2026-05-10T00:00:00Z", 5, 5),
        evt("2026-05-10T08:00:00Z", 5, 5),
      ],
    });
    const assessment = OSAE.publishAisContinuity(report);
    expect(assessment.eventAssessments).toHaveLength(report.darkEvents.length);
    // Every disabling event has a priority
    for (const a of assessment.eventAssessments) {
      expect(["watch", "monitor", "act", "urgent"]).toContain(a.priority);
    }
    // Overall lifts to the max per-event priority (urgent from 30h event)
    expect(assessment.priority).toBe("urgent");
    expect(assessment.totalInterruptions).toBe(report.totalInterruptions);
    expect(assessment.longestInterruptionHours).toBe(report.longestInterruptionHours);
    expect(assessment.summary).toMatch(/discrete AIS interruption/i);
  });

  it("OSAE does NOT lift priority above 'watch' when only coverage-uncertain spans exist", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-coverage",
      events: [
        evt("2023-01-01T00:00:00Z", 0, 0),
        evt("2026-01-01T00:00:00Z", 0, 0),
      ],
    });
    const a = OSAE.publishAisContinuity(report);
    expect(a.priority).toBe("watch");
    expect(a.totalInterruptions).toBe(0);
  });

  it("Executive brief AIS section exposes totals, longest, timeline, and patterns", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-brief",
      events: [
        evt("2026-06-01T00:00:00Z", 6.4, 3.4, { nearestPort: "Lagos", distanceFromPortNm: 10 }),
        evt("2026-06-01T30:00:00Z", 6.5, 3.5),
        evt("2026-06-05T00:00:00Z", 6.4, 3.4, { nearestPort: "Lagos", distanceFromPortNm: 12 }),
        evt("2026-06-05T09:00:00Z", 6.5, 3.5),
      ],
    });
    const osae = OSAE.publishAisContinuity(report);
    const section = buildAisContinuitySection(report, osae);
    expect(section.totalInterruptions).toBe(report.totalInterruptions);
    expect(section.longestInterruptionHours).toBe(report.longestInterruptionHours);
    expect(section.timeline).toHaveLength(report.darkEvents.length);
    expect(section.overallPriority).toBe(osae.priority);
    // Per-event OSAE rationale attached to timeline entries
    expect(section.timeline.every((t) => typeof t.priority === "string")).toBe(true);
    expect(section.evidenceCitation.toLowerCase()).toContain("global fishing watch");
  });

  it("preserves Sprint 1C `AIS_DARK` type + darkEvents contract", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v-legacy",
      events: [
        evt("2026-07-01T00:00:00Z", 6.4, 3.4, { weather: "clear", nearestPort: "Lagos", distanceFromPortNm: 43 }),
        evt("2026-07-01T09:00:00Z", 6.5, 3.5),
      ],
    });
    expect(report.gapsDetected).toBe(1);
    expect(report.continuous).toBe(false);
    const d = report.darkEvents[0];
    expect(d.type).toBe("AIS_DARK");
    expect(d.nearestPort).toBe("Lagos");
    expect(d.explanation).toMatch(/AIS transmission ceased/);
    expect(d.explanation.toLowerCase()).not.toMatch(/\b(high|medium|low) risk\b/);
  });
});
