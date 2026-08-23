/**
 * Earth Observation — canonical types for non-cooperative sensing.
 *
 * ## What "non-cooperative" means here, and why it shapes every type
 *
 * AIS is cooperative: the vessel transmits its own identity. SAR is not.
 * Sentinel-1 measures radar backscatter, and a bright return over water
 * means *something metallic is there*. It does not carry a name, an IMO,
 * an MMSI, a flag, or an owner, and no amount of processing recovers
 * them from the pixels.
 *
 * So `SarDetection` has no identity field. Identity is only ever a
 * `CandidateIdentity` — a ranked hypothesis with its own confidence and
 * its own evidence, produced by correlating against AIS. A detection that
 * correlates with nothing stays anonymous, which is the operationally
 * interesting case rather than a failure.
 *
 * ## Sentinel-1 is not a live feed
 *
 * It is a polar-orbiting satellite with a revisit measured in days, not
 * seconds. Every type below carries `acquiredAt`, and every derived view
 * carries the age, because a detection six days old presented without its
 * timestamp is worse than no detection: an officer will read it as now.
 */
import type { OsintConfidenceLevel } from "@/lib/osint/types";

/* ─────────────────────────── Sensor ─────────────────────────── */

/**
 * Sensors that can produce a detection.
 *
 * Open-ended by design — the correlation and gap engines are written
 * against `SarDetection`, not against Sentinel-1, so adding RADARSAT or a
 * commercial SAR provider is a new value here and a new adapter, not a
 * new engine.
 */
export type SensorId = "sentinel-1" | "sentinel-2" | "unknown";

/** Sentinel-1 acquisition modes. IW is the default maritime mode. */
export type Sentinel1Mode = "IW" | "EW" | "SM" | "WV" | "unknown";

/** Polarisation of the scene. Affects what is detectable at sea. */
export type Polarisation = "VV" | "VH" | "HH" | "HV" | "VV+VH" | "HH+HV" | "unknown";

/**
 * One SAR scene as catalogued by the provider.
 *
 * Metadata only. Seaphore never downloads raw imagery — `assetHref` points
 * at the provider's copy so a processing service can fetch it directly,
 * and so provenance stays checkable.
 */
export interface SarScene {
  readonly sceneId: string;
  readonly sensor: SensorId;
  readonly platform: string;
  readonly mode: Sentinel1Mode;
  readonly polarisation: Polarisation;
  /** When the satellite actually observed the surface. Never "now". */
  readonly acquiredAt: string;
  /** Scene footprint as GeoJSON, for intersecting with an area of interest. */
  readonly footprint: GeoJsonPolygon | null;
  readonly bbox: readonly [number, number, number, number] | null;
  /** Ground sample distance in metres, when the provider reports it. */
  readonly groundSampleDistanceM: number | null;
  readonly collection: string;
  /** Where a processor can fetch the pixels. Not fetched by Seaphore. */
  readonly assetHref: string | null;
  readonly license: string | null;
  /** When Seaphore retrieved the catalogue entry. */
  readonly retrievedAt: string;
}

export interface GeoJsonPolygon {
  readonly type: "Polygon";
  readonly coordinates: readonly (readonly (readonly [number, number])[])[];
}

/* ────────────────────────── Detection ───────────────────────── */

/**
 * A single object detected in a SAR scene.
 *
 * Note what is absent: no name, no IMO, no MMSI, no vessel type. A SAR
 * return is a radar signature at a position, and the fields below are the
 * most that can honestly be said about one from the pixels alone.
 */
export interface SarDetection {
  readonly id: string;
  readonly sceneId: string;
  readonly sensor: SensorId;
  /** When the satellite observed this object. The only meaningful "when". */
  readonly acquiredAt: string;

  readonly position: { readonly latitude: number; readonly longitude: number };
  /**
   * Positional uncertainty in metres. SAR geolocation is good but not
   * exact, and the correlation engine needs the error bar to decide what
   * "nearby" means rather than assuming a fixed radius.
   */
  readonly positionUncertaintyM: number;

  /**
   * Estimated length in metres, when the detector reports one.
   *
   * A weak discriminator on its own — many vessels share a length — but
   * strong at excluding candidates, which is how the correlator uses it.
   */
  readonly estimatedLengthM: number | null;
  readonly estimatedWidthM: number | null;
  /**
   * Estimated heading in degrees, with a 180° ambiguity that SAR cannot
   * resolve from a single look. Recorded as reported; the correlator
   * treats it as an axis, not a direction.
   */
  readonly estimatedHeadingDeg: number | null;

  /** Radar cross-section in dBm², when reported. Roughly, how bright. */
  readonly radarCrossSectionDb: number | null;

  /**
   * Detector's confidence that this return is a vessel rather than a
   * false alarm — wind roughening, wave breaking, an offshore structure,
   * or an azimuth ambiguity ghost. 0–1.
   *
   * This is confidence in the DETECTION. It is not confidence in any
   * identity, and the two are never combined.
   */
  readonly detectionConfidence: number;

  /** Which model produced this, so a bad model is traceable. */
  readonly detector: DetectorProvenance;
}

/** Identifies the processing service and model behind a detection. */
export interface DetectorProvenance {
  readonly serviceId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly processedAt: string;
}

/* ───────────────────────── Correlation ──────────────────────── */

/**
 * An AIS report used as correlation input.
 *
 * Deliberately minimal and provider-agnostic: SeaVantage, Datalastic,
 * Spire and GFW all reduce to this, so the correlation engine has one
 * input shape and no provider-specific branches.
 */
export interface AisReport {
  readonly mmsi: string;
  readonly imo: string | null;
  readonly name: string | null;
  /** When the vessel transmitted. The only time that describes the world. */
  readonly reportedAt: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKnots: number | null;
  /**
   * Course over ground — the direction of travel.
   *
   * Distinct from {@link headingDeg}, which is where the hull points. A
   * vessel setting against a current has both, and they differ; the
   * correlator compares SAR's heading axis against the hull, falling back
   * to course only when no heading was transmitted.
   */
  readonly courseDeg: number | null;
  readonly lengthM: number | null;
  /** Connector id, e.g. `"datalastic"`. Carried into evidence. */
  readonly source: string;

  /* ── Optional identity and voyage fields ──────────────────────
   * Added in Phase 7B. Optional so every existing producer keeps
   * compiling: providers differ in what they carry, and a required
   * field would force callers to invent values they do not have.
   */

  /** True heading in degrees — where the hull points. */
  readonly headingDeg?: number | null;
  /** Provider's vessel-type label, verbatim. Never normalised into risk. */
  readonly vesselType?: string | null;
  /** Officer-declared destination. Self-reported, so weak evidence. */
  readonly destination?: string | null;
  readonly callSign?: string | null;
  readonly flag?: string | null;
  readonly widthM?: number | null;
  readonly draughtM?: number | null;
  /**
   * When the provider received the report, as opposed to when the vessel
   * sent it. Satellite AIS can lag transmission by minutes to hours, and
   * conflating the two would make a stale report look current.
   */
  readonly receivedAt?: string | null;
  /** Provider's own record id, for citation back to source. */
  readonly sourceRecordId?: string | null;
}

/** One reason a candidate scored as it did. Shown, never summarised away. */
export interface CorrelationEvidence {
  readonly factor:
    | "spatial-proximity"
    | "temporal-proximity"
    | "length-agreement"
    | "length-conflict"
    | "heading-agreement"
    | "course-consistency"
    | "no-ais-coverage";
  /** Officer-facing sentence. Describes the measurement, not a verdict. */
  readonly detail: string;
  /**
   * Contribution to the score, positive or negative. Signed so an officer
   * can see what argued against a match as well as for it.
   */
  readonly contribution: number;
}

/**
 * A possible identity for a detection. Never an assertion.
 *
 * The platform returns a ranked list of these. Even the top candidate is
 * a hypothesis, and `confidence` says how strong a hypothesis it is.
 */
export interface CandidateIdentity {
  readonly mmsi: string;
  readonly imo: string | null;
  readonly name: string | null;
  /**
   * 0–1 confidence that this AIS track and this SAR return are the same
   * object. Never confidence that the vessel did anything.
   */
  readonly confidence: number;
  /** Evidence grade for the correlation, from the OSINT engine. */
  readonly grade: OsintConfidenceLevel;
  /** Metres between the detection and the AIS position at acquisition. */
  readonly distanceM: number;
  /** Seconds between the AIS report and the acquisition. */
  readonly timeDeltaSec: number;
  /** True when the AIS position had to be extrapolated to acquisition time. */
  readonly positionExtrapolated: boolean;
  readonly evidence: readonly CorrelationEvidence[];
}

/** Whether a detection could be tied to a cooperative report. */
export type AisMatchStatus =
  /** A candidate cleared the match threshold. */
  | "matched"
  /** Candidates exist but none is strong enough to call a match. */
  | "ambiguous"
  /** AIS coverage existed and nothing was near. The interesting case. */
  | "unmatched"
  /** No AIS data was available, so nothing can be concluded either way. */
  | "no-ais-coverage";

/**
 * The result of correlating one detection against available AIS.
 *
 * `status` and `candidates` are separate on purpose: "unmatched" and "no
 * AIS coverage" both produce an empty candidate list, and conflating them
 * would turn a gap in our data into an accusation about a vessel.
 */
export interface CorrelationResult {
  readonly detectionId: string;
  readonly status: AisMatchStatus;
  /** Ranked, most confident first. Empty when nothing was near. */
  readonly candidates: readonly CandidateIdentity[];
  /** How many AIS reports were considered. Zero means no coverage. */
  readonly aisReportsConsidered: number;
  /** Search radius used, derived from the detection's own uncertainty. */
  readonly searchRadiusM: number;
  readonly correlatedAt: string;
}

/* ──────────────────────────── Events ────────────────────────── */

/**
 * Maritime event classification.
 *
 * The ladder from observation to suspicion is explicit, and each rung
 * names what it requires. Nothing reaches the top rung on SAR alone.
 */
export type MaritimeEventType =
  /** A cooperative vessel stopped transmitting. AIS evidence only. */
  | "AIS_GAP"
  /** Something was detected by SAR. No claim about identity or intent. */
  | "SAR_DETECTION"
  /** A detection that AIS coverage existed for and did not explain. */
  | "UNMATCHED_SAR"
  /** An unmatched detection inside a known AIS gap, spatially plausible. */
  | "POTENTIAL_DARK_CONTACT"
  /** The same, with corroboration strong enough to brief on. */
  | "HIGH_CONFIDENCE_DARK_CONTACT";

/**
 * One classified event.
 *
 * `dataAgeMs` is mandatory and recomputed at read time. A Sentinel-1
 * observation presented without its age reads as live, and it never is.
 */
export interface MaritimeEvent {
  readonly id: string;
  readonly type: MaritimeEventType;
  /** Officer-facing statement. Evidence-phrased, never a verdict. */
  readonly statement: string;
  readonly occurredAt: string;
  readonly position: { readonly latitude: number; readonly longitude: number } | null;

  readonly detection: SarDetection | null;
  readonly correlation: CorrelationResult | null;
  readonly aisGap: AisGap | null;

  /**
   * Why this classification and not the one above it. Populated even when
   * the event did reach the top rung, so the reasoning is always legible.
   */
  readonly classificationRationale: string;
  /** What would have to be true to promote it. Empty at the top rung. */
  readonly promotionRequires: readonly string[];
}

/* ─────────────────────────── AIS gaps ───────────────────────── */

/**
 * A period during which a vessel that had been transmitting stopped.
 *
 * Distinct from `AisDarkEvidence` in `AISBehaviourAnalyzer`, which
 * segments gaps for a single vessel's continuity report. This type is
 * area-scoped and exists to be intersected with SAR acquisitions, which
 * is a different question: not "did this vessel go dark?" but "was
 * anything dark here when the satellite looked?".
 */
export interface AisGap {
  readonly id: string;
  readonly mmsi: string;
  readonly imo: string | null;
  readonly name: string | null;
  readonly lastReportAt: string;
  readonly nextReportAt: string | null;
  readonly durationSec: number;
  readonly lastPosition: { readonly latitude: number; readonly longitude: number };
  readonly nextPosition: { readonly latitude: number; readonly longitude: number } | null;
  /** Speed at the last report, used to bound where the vessel could be. */
  readonly lastSpeedKnots: number | null;
  /** True when the gap is still open — no later report exists yet. */
  readonly open: boolean;
  readonly source: string;
}
