/**
 * Maritime event classification.
 *
 * Turns detections, correlations and AIS gaps into the five event types
 * an officer acts on.
 *
 * ## The ladder, and what each rung costs to climb
 *
 *   SAR_DETECTION              something is there
 *   UNMATCHED_SAR              + AIS coverage existed and did not explain it
 *   POTENTIAL_DARK_CONTACT     + a known AIS gap could reach that position
 *   HIGH_CONFIDENCE_DARK_CONTACT + the detection is strong and the geometry tight
 *
 * A detection cannot skip a rung. In particular nothing reaches
 * `UNMATCHED_SAR` on `no-ais-coverage`: if we could not see the
 * cooperative picture, an unexplained return is unexplained by *us*, and
 * saying otherwise converts our blind spot into the vessel's guilt.
 *
 * Every event carries `promotionRequires` — what would have to be true to
 * move it up. An officer can then see the ladder rather than a verdict.
 */
import { gapCouldReach } from "./ais-gap";
import type {
  AisGap,
  CorrelationResult,
  MaritimeEvent,
  MaritimeEventType,
  SarDetection,
} from "./types";

/**
 * A detection weaker than this is not promoted past `UNMATCHED_SAR`
 * however good the geometry. A probable false alarm sitting inside a gap
 * is still a probable false alarm.
 */
export const STRONG_DETECTION_CONFIDENCE = 0.8;

/**
 * How tightly the detection must sit inside the reachable area to be
 * called high confidence — expressed as a fraction of the radius.
 *
 * The reachable circle grows quickly: after four hours at 20 kn it is
 * 148 km across, and almost anything falls inside it. Requiring the
 * detection in the inner half keeps the top rung meaningful.
 */
export const TIGHT_GEOMETRY_FRACTION = 0.5;

export interface ClassifyOptions {
  readonly now?: number;
}

function positionOf(detection: SarDetection) {
  return { latitude: detection.position.latitude, longitude: detection.position.longitude };
}

/** How old the observation is, at read time. Never cached. */
export function dataAgeMs(acquiredAt: string, now: number = Date.now()): number {
  const acquired = Date.parse(acquiredAt);
  return Number.isNaN(acquired) ? 0 : Math.max(0, now - acquired);
}

/** Officer-facing age. Sentinel-1 revisit is days, so days are the unit. */
export function describeDataAge(ageMs: number): string {
  const hours = ageMs / 3_600_000;
  if (hours < 1) return `${Math.round(ageMs / 60_000)} min old`;
  if (hours < 48) return `${Math.round(hours)} h old`;
  return `${Math.round(hours / 24)} days old`;
}

/**
 * Classify one detection against its correlation and the known gaps.
 *
 * `gaps` should be every gap for the area and window. Passing none is
 * legitimate — it simply means no gap could corroborate, and the event
 * stops at `UNMATCHED_SAR`.
 */
export function classifyDetection(
  detection: SarDetection,
  correlation: CorrelationResult,
  gaps: readonly AisGap[],
  options: ClassifyOptions = {},
): MaritimeEvent {
  const now = options.now ?? Date.now();
  const acquiredMs = Date.parse(detection.acquiredAt);
  const age = describeDataAge(dataAgeMs(detection.acquiredAt, now));

  const base = {
    id: `event:${detection.id}`,
    occurredAt: detection.acquiredAt,
    position: positionOf(detection),
    detection,
    correlation,
    aisGap: null as AisGap | null,
  };

  /* ── Matched: the cooperative picture explains it ─────────────── */
  if (correlation.status === "matched") {
    const top = correlation.candidates[0];
    return {
      ...base,
      type: "SAR_DETECTION",
      statement: `SAR detection at ${age}, correlating with AIS track ${top.name ?? top.mmsi} at ${top.distanceM} m.`,
      classificationRationale: `Top candidate reached ${top.confidence} correlation confidence, at or above the ${0.75} match threshold. The detection is explained by a cooperative report.`,
      promotionRequires: [],
    };
  }

  /* ── No AIS coverage: we could not see ────────────────────────── */
  if (correlation.status === "no-ais-coverage") {
    return {
      ...base,
      type: "SAR_DETECTION",
      statement: `SAR detection at ${age}. No AIS coverage was available for this area and time, so nothing can be concluded about whether the vessel was transmitting.`,
      classificationRationale:
        "No AIS reports were available to correlate against. This is a gap in Seaphore's collection, not an observation about the vessel, so the detection is not classified as unmatched.",
      promotionRequires: ["AIS coverage for this area and acquisition time, from any provider"],
    };
  }

  /* ── Ambiguous: candidates exist, none strong enough ──────────── */
  if (correlation.status === "ambiguous") {
    const top = correlation.candidates[0];
    return {
      ...base,
      type: "SAR_DETECTION",
      statement: `SAR detection at ${age}, with ${correlation.candidates.length} candidate AIS ${correlation.candidates.length === 1 ? "track" : "tracks"} nearby — none conclusive.`,
      classificationRationale: `Best candidate ${top.name ?? top.mmsi} reached ${top.confidence}, below the ${0.75} match threshold. Candidates are offered as hypotheses; no identity is asserted.`,
      promotionRequires: [
        "A closer AIS report, or one nearer in time to acquisition",
        "Length or heading agreement to separate the candidates",
      ],
    };
  }

  /* ── Unmatched: coverage existed and explained nothing ────────── */
  const reaching = gaps
    .map((gap) => ({ gap, geometry: gapCouldReach(gap, positionOf(detection), acquiredMs) }))
    .filter(
      (entry): entry is { gap: AisGap; geometry: NonNullable<ReturnType<typeof gapCouldReach>> } =>
        entry.geometry !== null && entry.geometry.reachable,
    )
    // Tightest geometry first — the gap that explains the position best.
    .sort(
      (a, b) =>
        a.geometry.distanceM / a.geometry.radiusM - b.geometry.distanceM / b.geometry.radiusM,
    );

  const best = reaching[0];

  if (!best) {
    return {
      ...base,
      type: "UNMATCHED_SAR",
      statement: `Unmatched SAR detection at ${age}. ${correlation.aisReportsConsidered} AIS ${correlation.aisReportsConsidered === 1 ? "track was" : "tracks were"} in range and none corresponds to it.`,
      classificationRationale:
        "AIS coverage existed for this area and time, and no track correlated above the candidate floor. No AIS gap places a known vessel here, so the detection is unattributed.",
      promotionRequires: [
        "An AIS gap whose reachable area covers this position at acquisition time",
      ],
    };
  }

  const tightness = best.geometry.distanceM / best.geometry.radiusM;
  const strongDetection = detection.detectionConfidence >= STRONG_DETECTION_CONFIDENCE;
  const tightGeometry = tightness <= TIGHT_GEOMETRY_FRACTION;

  const gapLabel = best.gap.name ?? best.gap.mmsi;
  const gapHours = Math.round(best.gap.durationSec / 3600);

  if (strongDetection && tightGeometry) {
    return {
      ...base,
      aisGap: best.gap,
      type: "HIGH_CONFIDENCE_DARK_CONTACT",
      statement: `Unmatched SAR detection at ${age}, inside the ${gapHours} h AIS gap of ${gapLabel} and ${Math.round(best.geometry.distanceM / 1000)} km from her last reported position.`,
      classificationRationale: `Detection confidence ${detection.detectionConfidence} is at or above ${STRONG_DETECTION_CONFIDENCE}, and the position sits in the inner ${Math.round(TIGHT_GEOMETRY_FRACTION * 100)}% of the reachable area. This remains a correlation between two observations, not a confirmed identification.`,
      promotionRequires: [],
    };
  }

  const shortfall: string[] = [];
  if (!strongDetection) {
    shortfall.push(
      `Detection confidence ${detection.detectionConfidence} is below ${STRONG_DETECTION_CONFIDENCE} — the return may be a false alarm`,
    );
  }
  if (!tightGeometry) {
    shortfall.push(
      `Position sits at ${Math.round(tightness * 100)}% of the reachable radius, which is wide enough that many vessels could satisfy it`,
    );
  }

  return {
    ...base,
    aisGap: best.gap,
    type: "POTENTIAL_DARK_CONTACT",
    statement: `Unmatched SAR detection at ${age}, potentially within the ${gapHours} h AIS gap of ${gapLabel}.`,
    classificationRationale: `The gap's reachable area covers this position, but the correlation is not strong enough to brief on. ${shortfall.join(". ")}.`,
    promotionRequires: shortfall,
  };
}

/**
 * Build the standalone events for AIS gaps that no detection explained.
 *
 * A gap is intelligence in its own right: a vessel stopped transmitting.
 * That it was not seen by SAR usually means the satellite was not looking
 * — Sentinel-1 revisits an area every few days, so most gaps fall between
 * passes and their absence from imagery means nothing.
 */
export function classifyGaps(
  gaps: readonly AisGap[],
  events: readonly MaritimeEvent[],
): readonly MaritimeEvent[] {
  const explained = new Set(events.map((event) => event.aisGap?.id).filter(Boolean));

  return gaps
    .filter((gap) => !explained.has(gap.id))
    .map((gap) => {
      const hours = Math.round(gap.durationSec / 3600);
      return {
        id: `event:${gap.id}`,
        type: "AIS_GAP" as MaritimeEventType,
        statement: gap.open
          ? `${gap.name ?? gap.mmsi} has not reported for ${hours} h.`
          : `${gap.name ?? gap.mmsi} stopped reporting for ${hours} h.`,
        occurredAt: gap.lastReportAt,
        position: gap.lastPosition,
        detection: null,
        correlation: null,
        aisGap: gap,
        classificationRationale: `AIS silence of ${hours} h from ${gap.source}. No SAR detection has been correlated with this gap; Sentinel-1 revisits an area every few days, so most gaps fall between passes and the absence of imagery is not evidence either way.`,
        promotionRequires: [
          "A SAR acquisition covering the reachable area during the gap",
          "A detection in that acquisition that no AIS track explains",
        ],
      } satisfies MaritimeEvent;
    });
}

/** Rank for triage. Highest-consequence first. */
const EVENT_RANK: Readonly<Record<MaritimeEventType, number>> = {
  HIGH_CONFIDENCE_DARK_CONTACT: 0,
  POTENTIAL_DARK_CONTACT: 1,
  UNMATCHED_SAR: 2,
  AIS_GAP: 3,
  SAR_DETECTION: 4,
};

export function byConsequence(events: readonly MaritimeEvent[]): readonly MaritimeEvent[] {
  return [...events].sort((a, b) => {
    const rank = EVENT_RANK[a.type] - EVENT_RANK[b.type];
    if (rank !== 0) return rank;
    return Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  });
}
