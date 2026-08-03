/**
 * AIS Behaviour Analyzer — Voyage-Based Event Segmentation (Sprint 1D-AIS).
 *
 * INTELLIGENCE CONTRACT
 * ─────────────────────
 * The analyser MUST NOT assign risk. It only inspects AIS movement
 * events, segments transmission interruptions into DISCRETE events
 * (never a single aggregated multi-year duration), contextualises
 * each event (weather, proximity to coast/port, traffic density,
 * historical frequency), detects recurring patterns, and returns an
 * evidence-shaped continuity report.
 *
 * Risk scoring belongs exclusively to OSAE. This module never uses
 * the words "high risk", "medium risk", or "low risk".
 */

export interface AisMovementEvent {
  /** Position timestamp (ISO 8601). */
  timestamp: string;
  latitude: number;
  longitude: number;
  speedKnots?: number;
  courseDeg?: number;
  /** Optional per-event context. */
  weather?: "clear" | "moderate" | "severe";
  distanceFromCoastNm?: number;
  nearestPort?: string;
  distanceFromPortNm?: number;
  trafficDensity?: "sparse" | "moderate" | "dense";
}

/** Geographic point captured at gap boundaries. */
export interface AisGeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Kind of interruption:
 *   • `disabling`        — plausible AIS-off event (bounded duration).
 *   • `coverage-uncertain` — gap so long it cannot be attributed to a
 *     single disabling event without additional evidence. Reported
 *     for transparency but excluded from totals/patterns.
 */
export type AisInterruptionKind = "disabling" | "coverage-uncertain";

export interface AisDarkEvidence {
  type: "AIS_DARK";
  kind: AisInterruptionKind;
  startAt: string;
  endAt: string;
  durationHours: number;
  startLocation: AisGeoPoint | null;
  endLocation: AisGeoPoint | null;
  weatherContext: "clear" | "moderate" | "severe" | "unknown";
  nearestPort: string | null;
  nearestPortEnd: string | null;
  distanceFromPortNm: number | null;
  distanceFromCoastNm: number | null;
  trafficDensity: "sparse" | "moderate" | "dense" | "unknown";
  historicalFrequency: number;
  /** 0..1 confidence in the *observation*, not in any risk judgement. */
  confidence: number;
  /** Officer-safe narrative — describes evidence, never classifies risk. */
  explanation: string;
}

export type AisPatternCode =
  "repeated-disabling" | "port-approach-disabling" | "boundary-crossing" | "offshore-loitering";

export interface AisPattern {
  code: AisPatternCode;
  label: string;
  description: string;
  occurrences: number;
  /** Indices into `darkEvents` (disabling only) supporting this pattern. */
  evidenceIndices: number[];
  /** 0..1 observation confidence. Never a risk score. */
  confidence: number;
}

export interface AisContinuityReport {
  vesselId: string;
  windowStart: string;
  windowEnd: string;
  totalEvents: number;
  gapsDetected: number;
  /** All discrete interruption events (disabling + coverage-uncertain). */
  darkEvents: AisDarkEvidence[];
  /** Count of `kind === "disabling"` events. Sprint 1D-AIS metric. */
  totalInterruptions: number;
  /** Longest disabling event duration in hours (0 when none). */
  longestInterruptionHours: number;
  /** Recurring behavioural patterns detected across disabling events. */
  patterns: AisPattern[];
  /** True when zero gaps > `gapThresholdHours` were found. */
  continuous: boolean;
  gapThresholdHours: number;
}

export interface AnalyseInput {
  vesselId: string;
  events: AisMovementEvent[];
  /** Prior dark events observed in the last 90 days, if any. */
  historicalDarkEvents?: AisDarkEvidence[];
  /** Gap threshold — default 6 hours per Sprint 1C spec. */
  gapThresholdHours?: number;
  /**
   * Above this duration, a single "gap" is treated as
   * `coverage-uncertain` rather than a plausible single disabling
   * event. Default 720h (30 days) — beyond this, attributing the full
   * duration to one AIS-off event is not defensible without more data.
   */
  coverageUncertaintyHours?: number;
}

const DEFAULT_GAP_HOURS = 6;
const DEFAULT_COVERAGE_UNCERTAINTY_HOURS = 720; // 30 days

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
}

/** Great-circle distance in nautical miles. */
function haversineNm(a: AisGeoPoint, b: AisGeoPoint): number {
  const R_KM = 6371;
  const KM_TO_NM = 0.539957;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h))) * KM_TO_NM;
}

function narrate(gap: {
  hours: number;
  kind: AisInterruptionKind;
  weather: AisDarkEvidence["weatherContext"];
  nearestPort: string | null;
  nearestPortEnd: string | null;
  distanceFromPortNm: number | null;
  historicalFrequency: number;
}): string {
  const weatherPhrase =
    gap.weather === "clear"
      ? "in clear weather"
      : gap.weather === "moderate"
        ? "in moderate weather"
        : gap.weather === "severe"
          ? "during severe weather"
          : "with no weather context available";
  const locPhrase =
    gap.nearestPort && typeof gap.distanceFromPortNm === "number"
      ? `approximately ${Math.round(gap.distanceFromPortNm)} nautical miles from ${gap.nearestPort}`
      : "in open water";
  const portShift =
    gap.nearestPort && gap.nearestPortEnd && gap.nearestPortEnd !== gap.nearestPort
      ? ` Transmission resumed near ${gap.nearestPortEnd}.`
      : "";
  const historyPhrase =
    gap.historicalFrequency > 0
      ? ` Similar interruptions have occurred ${gap.historicalFrequency} time${gap.historicalFrequency === 1 ? "" : "s"} within the previous ninety days.`
      : "";
  if (gap.kind === "coverage-uncertain") {
    const days = Math.round(gap.hours / 24);
    return `AIS coverage is uncertain across a ${days}-day window ${locPhrase}. This span cannot be attributed to a single disabling event without additional evidence.`;
  }
  return `AIS transmission ceased for ${gap.hours.toFixed(0)} hours ${weatherPhrase} ${locPhrase}.${portShift}${historyPhrase}`;
}

function detectPatterns(events: AisDarkEvidence[]): AisPattern[] {
  const disabling = events.map((e, i) => ({ e, i })).filter((x) => x.e.kind === "disabling");
  const patterns: AisPattern[] = [];

  // 1) Repeated disabling — ≥3 total OR ≥2 within any 30-day window.
  if (disabling.length >= 2) {
    const sorted = [...disabling].sort(
      (a, b) => new Date(a.e.startAt).getTime() - new Date(b.e.startAt).getTime(),
    );
    let cluster: typeof sorted = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const cur = sorted[i];
      cluster = cluster.filter((c) => hoursBetween(c.e.startAt, cur.e.startAt) <= 24 * 30);
      cluster.push(cur);
    }
    if (disabling.length >= 3 || cluster.length >= 2) {
      patterns.push({
        code: "repeated-disabling",
        label: "Repeated AIS disabling",
        description: `${disabling.length} discrete disabling events observed across the window.`,
        occurrences: disabling.length,
        evidenceIndices: disabling.map((x) => x.i),
        confidence: Math.min(0.9, 0.55 + 0.1 * disabling.length),
      });
    }
  }

  // 2) Port-approach disabling — start within 25nm of any port on ≥2 events.
  const nearPort = disabling.filter(
    (x) =>
      x.e.nearestPort !== null &&
      typeof x.e.distanceFromPortNm === "number" &&
      (x.e.distanceFromPortNm as number) <= 25,
  );
  if (nearPort.length >= 2) {
    patterns.push({
      code: "port-approach-disabling",
      label: "Disabling near port approaches",
      description: `${nearPort.length} disabling events began within 25nm of a known port.`,
      occurrences: nearPort.length,
      evidenceIndices: nearPort.map((x) => x.i),
      confidence: 0.75,
    });
  }

  // 3) Boundary-crossing — start & end coords > 200nm apart AND duration ≥ 12h.
  const boundary = disabling.filter((x) => {
    if (!x.e.startLocation || !x.e.endLocation) return false;
    if (x.e.durationHours < 12) return false;
    return haversineNm(x.e.startLocation, x.e.endLocation) >= 200;
  });
  if (boundary.length >= 1) {
    patterns.push({
      code: "boundary-crossing",
      label: "Boundary-crossing during dark period",
      description: `${boundary.length} disabling event${boundary.length === 1 ? "" : "s"} spanned ≥200nm — consistent with crossing a maritime boundary while dark.`,
      occurrences: boundary.length,
      evidenceIndices: boundary.map((x) => x.i),
      confidence: 0.7,
    });
  }

  // 4) Offshore loitering — ≥100nm from coast (or port when coast unknown) AND ≥12h.
  const offshore = disabling.filter((x) => {
    if (x.e.durationHours < 12) return false;
    const coast = x.e.distanceFromCoastNm;
    const port = x.e.distanceFromPortNm;
    if (typeof coast === "number") return coast >= 100;
    if (typeof port === "number") return port >= 100;
    return false;
  });
  if (offshore.length >= 1) {
    patterns.push({
      code: "offshore-loitering",
      label: "Offshore loitering while dark",
      description: `${offshore.length} disabling event${offshore.length === 1 ? "" : "s"} occurred ≥100nm offshore for ≥12h.`,
      occurrences: offshore.length,
      evidenceIndices: offshore.map((x) => x.i),
      confidence: 0.72,
    });
  }

  return patterns;
}

export const AISBehaviourAnalyzer = {
  /**
   * Analyse a sequence of AIS movement events and return a continuity
   * report. Never throws — bad inputs produce an empty report.
   *
   * Segments discrete interruption events chronologically. Any single
   * "gap" longer than `coverageUncertaintyHours` is emitted as
   * `kind: "coverage-uncertain"` (excluded from totals) rather than
   * being reported as one aggregated multi-year interruption.
   */
  analyse(input: AnalyseInput): AisContinuityReport {
    const gapThresholdHours = input.gapThresholdHours ?? DEFAULT_GAP_HOURS;
    const coverageUncertaintyHours =
      input.coverageUncertaintyHours ?? DEFAULT_COVERAGE_UNCERTAINTY_HOURS;
    const events = [...(input.events ?? [])]
      .filter((e) => e && typeof e.timestamp === "string")
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const dark: AisDarkEvidence[] = [];
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1];
      const cur = events[i];
      const dur = hoursBetween(prev.timestamp, cur.timestamp);
      if (dur <= gapThresholdHours) continue;
      const weather = prev.weather ?? cur.weather ?? "unknown";
      const nearestPort = prev.nearestPort ?? null;
      const nearestPortEnd = cur.nearestPort ?? null;
      const distanceFromPortNm = prev.distanceFromPortNm ?? cur.distanceFromPortNm ?? null;
      const distanceFromCoastNm = prev.distanceFromCoastNm ?? cur.distanceFromCoastNm ?? null;
      const trafficDensity = prev.trafficDensity ?? cur.trafficDensity ?? "unknown";
      const historicalFrequency = (input.historicalDarkEvents ?? []).length;
      const kind: AisInterruptionKind =
        dur > coverageUncertaintyHours ? "coverage-uncertain" : "disabling";

      // Observation-confidence: shorter, well-contextualised gaps in
      // dense traffic are more certain observations of a real
      // transmission stop (not a coverage hole). Coverage-uncertain
      // events carry lower confidence by construction.
      let confidence = kind === "coverage-uncertain" ? 0.3 : 0.6;
      if (kind === "disabling") {
        if (trafficDensity === "dense") confidence += 0.2;
        if (weather === "clear") confidence += 0.1;
        if (dur > 24) confidence += 0.05;
      }
      confidence = Math.min(0.95, confidence);

      dark.push({
        type: "AIS_DARK",
        kind,
        startAt: prev.timestamp,
        endAt: cur.timestamp,
        durationHours: Number(dur.toFixed(2)),
        startLocation: { latitude: prev.latitude, longitude: prev.longitude },
        endLocation: { latitude: cur.latitude, longitude: cur.longitude },
        weatherContext: weather,
        nearestPort,
        nearestPortEnd,
        distanceFromPortNm,
        distanceFromCoastNm,
        trafficDensity,
        historicalFrequency,
        confidence,
        explanation: narrate({
          hours: dur,
          kind,
          weather,
          nearestPort,
          nearestPortEnd,
          distanceFromPortNm,
          historicalFrequency,
        }),
      });
    }

    const disablingEvents = dark.filter((d) => d.kind === "disabling");
    const longestInterruptionHours = disablingEvents.reduce(
      (m, d) => Math.max(m, d.durationHours),
      0,
    );
    const patterns = detectPatterns(dark);

    return {
      vesselId: input.vesselId,
      windowStart: events[0]?.timestamp ?? new Date().toISOString(),
      windowEnd: events[events.length - 1]?.timestamp ?? new Date().toISOString(),
      totalEvents: events.length,
      gapsDetected: dark.length,
      darkEvents: dark,
      totalInterruptions: disablingEvents.length,
      longestInterruptionHours: Number(longestInterruptionHours.toFixed(2)),
      patterns,
      continuous: dark.length === 0,
      gapThresholdHours,
    };
  },
};
