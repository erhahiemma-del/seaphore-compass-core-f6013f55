/**
 * AIS Behaviour Analyzer.
 *
 * INTELLIGENCE CONTRACT
 * ─────────────────────
 * The analyser MUST NOT assign risk. It only inspects AIS movement
 * events, detects gaps in transmission, contextualises those gaps
 * (weather, proximity to coast/port, traffic density, historical
 * frequency), and returns an evidence-shaped continuity report.
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

export interface AisDarkEvidence {
  type: "AIS_DARK";
  startAt: string;
  endAt: string;
  durationHours: number;
  weatherContext: "clear" | "moderate" | "severe" | "unknown";
  nearestPort: string | null;
  distanceFromPortNm: number | null;
  distanceFromCoastNm: number | null;
  trafficDensity: "sparse" | "moderate" | "dense" | "unknown";
  historicalFrequency: number;
  /** 0..1 confidence in the *observation*, not in any risk judgement. */
  confidence: number;
  /** Officer-safe narrative — describes evidence, never classifies risk. */
  explanation: string;
}

export interface AisContinuityReport {
  vesselId: string;
  windowStart: string;
  windowEnd: string;
  totalEvents: number;
  gapsDetected: number;
  darkEvents: AisDarkEvidence[];
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
}

const DEFAULT_GAP_HOURS = 6;

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
}

function narrate(gap: {
  hours: number;
  weather: AisDarkEvidence["weatherContext"];
  nearestPort: string | null;
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
  const historyPhrase =
    gap.historicalFrequency > 0
      ? ` Similar interruptions have occurred ${gap.historicalFrequency} time${gap.historicalFrequency === 1 ? "" : "s"} within the previous ninety days.`
      : "";
  return `AIS transmission ceased for ${gap.hours.toFixed(0)} hours ${weatherPhrase} ${locPhrase}.${historyPhrase}`;
}

export const AISBehaviourAnalyzer = {
  /**
   * Analyse a sequence of AIS movement events and return a continuity
   * report. Never throws — bad inputs produce an empty report.
   */
  analyse(input: AnalyseInput): AisContinuityReport {
    const gapThresholdHours = input.gapThresholdHours ?? DEFAULT_GAP_HOURS;
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
      const nearestPort = prev.nearestPort ?? cur.nearestPort ?? null;
      const distanceFromPortNm =
        prev.distanceFromPortNm ?? cur.distanceFromPortNm ?? null;
      const distanceFromCoastNm =
        prev.distanceFromCoastNm ?? cur.distanceFromCoastNm ?? null;
      const trafficDensity = prev.trafficDensity ?? cur.trafficDensity ?? "unknown";
      const historicalFrequency = (input.historicalDarkEvents ?? []).length;
      // Observation-confidence: shorter gaps in dense traffic are more
      // certain observations of a real transmission stop (not a
      // coverage hole). Never used for risk.
      let confidence = 0.6;
      if (trafficDensity === "dense") confidence += 0.2;
      if (weather === "clear") confidence += 0.1;
      if (dur > 24) confidence += 0.05;
      confidence = Math.min(0.95, confidence);

      dark.push({
        type: "AIS_DARK",
        startAt: prev.timestamp,
        endAt: cur.timestamp,
        durationHours: Number(dur.toFixed(2)),
        weatherContext: weather,
        nearestPort,
        distanceFromPortNm,
        distanceFromCoastNm,
        trafficDensity,
        historicalFrequency,
        confidence,
        explanation: narrate({
          hours: dur,
          weather,
          nearestPort,
          distanceFromPortNm,
          historicalFrequency,
        }),
      });
    }

    return {
      vesselId: input.vesselId,
      windowStart: events[0]?.timestamp ?? new Date().toISOString(),
      windowEnd:
        events[events.length - 1]?.timestamp ?? new Date().toISOString(),
      totalEvents: events.length,
      gapsDetected: dark.length,
      darkEvents: dark,
      continuous: dark.length === 0,
      gapThresholdHours,
    };
  },
};
