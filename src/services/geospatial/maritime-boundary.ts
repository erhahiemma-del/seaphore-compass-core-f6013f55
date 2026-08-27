/**
 * Where Nigerian waters are, how sure we are, and how long a vessel has.
 *
 * The map already draws the Nigerian EEZ, and the file it draws from says
 * this about itself:
 *
 *   "Simplified outline for operational display only. NOT a legal or
 *    navigational boundary. […] does not encode negotiated tri-point
 *    boundaries with Benin, Cameroon, Equatorial Guinea, or Sao Tome and
 *    Principe."
 *
 * Twenty vertices, and honest about being twenty vertices. That was fine
 * while the polygon was scenery. It stops being fine the moment something
 * computes "this vessel has entered Nigerian waters" from it, because a
 * containment test turns a display outline into a finding — and near the
 * western and eastern approaches, which is exactly where inbound traffic
 * runs, the simplification is wrong by miles.
 *
 * So every answer this module gives carries how it was reached, and the
 * word "entered" never appears without the qualifier. An officer may act
 * on "inside the displayed outline"; nobody may cite it as a boundary
 * determination. Replacing the geometry with the VLIZ or Nigerian
 * Hydrographic Office polygon the file itself names would change the
 * accuracy grade here and nothing else — which is the point of grading it
 * rather than assuming it.
 *
 * ## One boundary, not several
 *
 * The polygon is served from `/geojson/nigeria-eez.geojson` and the
 * renderer already draws it. `NIGERIA_EEZ_BBOX` exists for cheap
 * rejection. Both are reused here; nothing in this module introduces a
 * second definition of where Nigeria's waters are, and no caller should
 * need one.
 */
import { NIGERIA_EEZ_BBOX } from "./constants";
import type { LonLat } from "./types";

/**
 * How much authority a boundary answer carries.
 *
 * Not decoration. The geometry in use is explicitly not a legal boundary,
 * so a containment result is an observation about a drawing, and callers
 * that present it otherwise are making a claim the data cannot support.
 */
export type BoundaryAccuracy =
  /** A published, survey-grade maritime boundary. Nothing here is this yet. */
  | "AUTHORITATIVE"
  /** A simplified outline for display. What the project currently holds. */
  | "APPROXIMATE";

/** The accuracy of the boundary actually in use, from the file's own metadata. */
export const NIGERIAN_WATERS_ACCURACY: BoundaryAccuracy = "APPROXIMATE";

/**
 * What an officer is told about the boundary's authority.
 *
 * Carried with every result so the caveat cannot be lost between here and
 * the screen — the same rule the source descriptor model applies to
 * providers.
 */
export const NIGERIAN_WATERS_CAVEAT =
  "Simplified outline for operational display. Not a legal or navigational boundary, and it does not encode negotiated boundaries with neighbouring states.";

/**
 * Where a vessel stands relative to the displayed boundary.
 *
 * `INSIDE_DISPLAYED_BOUNDARY` rather than "inside Nigerian waters"
 * deliberately: the longer name is what the geometry can actually
 * support, and a shorter one would be quoted back as a determination.
 */
export type BoundaryRelation =
  | "OUTSIDE"
  | "APPROACHING"
  | "ENTERING_SOON"
  | "INSIDE_DISPLAYED_BOUNDARY";

/**
 * Approach thresholds, in hours.
 *
 * Declared once because they govern classification, escalation, the alert
 * centre's grouping and the officer's sense of urgency all at once. Buried
 * as literals in a map component they would drift apart, and the officer
 * would meet two different definitions of "within 48 hours".
 */
export interface ApproachThresholds {
  readonly watch: number;
  readonly attention: number;
  readonly imminent: number;
}

export const DEFAULT_APPROACH_THRESHOLDS: ApproachThresholds = {
  watch: 72,
  attention: 48,
  imminent: 24,
};

/**
 * How an arrival time was arrived at.
 *
 * A provider-reported ETA and a number this application worked out from a
 * heading are different kinds of claim, and the difference is the whole
 * reason an officer can trust the first. They must never render alike.
 */
export type ArrivalBasis =
  /** The source reported it. */
  | "REPORTED"
  /** Computed here from position, speed and course. */
  | "ESTIMATED"
  /** No usable basis. Speed unknown, stopped, or heading away. */
  | "UNAVAILABLE";

export interface BoundaryAssessment {
  readonly relation: BoundaryRelation;
  /** Hours until the boundary. Null when there is no honest figure. */
  readonly hoursToBoundary: number | null;
  readonly basis: ArrivalBasis;
  /** Great-circle distance to the boundary in nautical miles, when computed. */
  readonly distanceNm: number | null;
  readonly accuracy: BoundaryAccuracy;
  /**
   * Why this assessment says what it says, in one line an officer reads.
   *
   * Every assessment carries one. An arrival figure with no account of
   * where it came from is the thing this module exists to prevent.
   */
  readonly rationale: string;
}

/** Nautical miles per degree of latitude. */
const NM_PER_DEGREE = 60;

/**
 * Ray casting against the boundary ring.
 *
 * Standard even-odd containment. The polygon is small enough that nothing
 * cleverer is warranted, and a spatial index over twenty vertices would be
 * more code than it saves.
 */
export function pointInRing(point: LonLat, ring: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const straddles = yi > point[1] !== yj > point[1];
    if (!straddles) continue;
    const x = ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (point[0] < x) inside = !inside;
  }
  return inside;
}

/**
 * Cheap rejection before the ring test.
 *
 * Most vessels on a global picture are nowhere near Nigeria, and the
 * bounding box answers those without touching the polygon.
 */
export function insideBoundingBox([lon, lat]: LonLat): boolean {
  return (
    lon >= NIGERIA_EEZ_BBOX.minLon &&
    lon <= NIGERIA_EEZ_BBOX.maxLon &&
    lat >= NIGERIA_EEZ_BBOX.minLat &&
    lat <= NIGERIA_EEZ_BBOX.maxLat
  );
}

/** Distance in nautical miles, flat-earth at this scale. */
export function distanceNm(a: LonLat, b: LonLat): number {
  const dLat = b[1] - a[1];
  const dLon = (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLon) * NM_PER_DEGREE;
}

/** Nearest distance from a point to a ring's edges, in nautical miles. */
export function distanceToRingNm(point: LonLat, ring: readonly LonLat[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    // Project onto the segment, clamped to its ends.
    const abLon = b[0] - a[0];
    const abLat = b[1] - a[1];
    const lengthSq = abLon * abLon + abLat * abLat;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point[0] - a[0]) * abLon + (point[1] - a[1]) * abLat) / lengthSq),
          );
    nearest = Math.min(nearest, distanceNm(point, [a[0] + abLon * t, a[1] + abLat * t]));
  }
  return nearest;
}

export interface VesselApproachInput {
  readonly position: LonLat;
  /** Knots. */
  readonly speed: number;
  /** Course over ground, degrees true. */
  readonly heading: number;
  /** Whether a source actually reported that course. */
  readonly headingReported?: boolean;
  /** Hours to destination, when the source reported one. */
  readonly reportedEtaHours?: number | null;
}

/**
 * Whether the vessel is closing on the boundary at all.
 *
 * A ship at anchor and a ship steaming away are both "not approaching",
 * and neither should be given an arrival time. Producing one by dividing
 * distance by a speed the vessel is not making toward Nigeria would be an
 * invented number wearing a unit.
 */
function closingSpeedKnots(input: VesselApproachInput, toward: LonLat): number | null {
  if (!(input.speed > 0.5)) return null;
  if (input.headingReported === false) return null;

  const bearingToTarget =
    (Math.atan2(
      (toward[0] - input.position[0]) *
        Math.cos((((input.position[1] + toward[1]) / 2) * Math.PI) / 180),
      toward[1] - input.position[1],
    ) *
      180) /
      Math.PI +
    360;
  const difference = Math.abs(((bearingToTarget - input.heading + 540) % 360) - 180);
  // Beyond a right angle the vessel is opening the range, not closing it.
  if (difference >= 90) return null;
  return input.speed * Math.cos((difference * Math.PI) / 180);
}

/**
 * Assess a vessel against the boundary.
 *
 * Pure, and takes the ring as an argument rather than fetching it, so the
 * arithmetic can be tested without a network and the caller keeps
 * ownership of the one boundary definition.
 */
export function assessApproach(
  input: VesselApproachInput,
  ring: readonly LonLat[],
  thresholds: ApproachThresholds = DEFAULT_APPROACH_THRESHOLDS,
): BoundaryAssessment {
  const base = {
    accuracy: NIGERIAN_WATERS_ACCURACY,
  } as const;

  if (pointInRing(input.position, ring)) {
    return {
      ...base,
      relation: "INSIDE_DISPLAYED_BOUNDARY",
      hoursToBoundary: 0,
      basis: "REPORTED",
      distanceNm: 0,
      rationale: "Position falls inside the displayed Nigerian EEZ outline.",
    };
  }

  const distance = distanceToRingNm(input.position, ring);

  /*
   * A reported ETA outranks anything computed here.
   *
   * The source knows the voyage plan; this module knows a heading and a
   * speed. Preferring the report is not deference, it is that the two
   * answer different questions — where the vessel intends to be, against
   * where its present course would take it.
   */
  if (typeof input.reportedEtaHours === "number" && input.reportedEtaHours >= 0) {
    return {
      ...base,
      relation: relationFor(input.reportedEtaHours, thresholds),
      hoursToBoundary: input.reportedEtaHours,
      basis: "REPORTED",
      distanceNm: distance,
      rationale: "Arrival time reported by the vessel's source.",
    };
  }

  // Nearest point on the ring, as the target the vessel is judged against.
  const nearest = nearestRingPoint(input.position, ring);
  const closing = closingSpeedKnots(input, nearest);

  if (closing === null) {
    return {
      ...base,
      relation: "OUTSIDE",
      hoursToBoundary: null,
      basis: "UNAVAILABLE",
      distanceNm: distance,
      rationale:
        input.speed > 0.5
          ? "No arrival time: the vessel's present course does not close on Nigerian waters."
          : "No arrival time: the vessel is not making way.",
    };
  }

  const hours = distance / closing;
  return {
    ...base,
    relation: relationFor(hours, thresholds),
    hoursToBoundary: hours,
    basis: "ESTIMATED",
    rationale: "Estimated from present position, speed and course. Not a reported arrival time.",
  } as BoundaryAssessment & { distanceNm: number };
}

/** The nearest point on the ring to a position. */
export function nearestRingPoint(point: LonLat, ring: readonly LonLat[]): LonLat {
  let best: LonLat = ring[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    const abLon = b[0] - a[0];
    const abLat = b[1] - a[1];
    const lengthSq = abLon * abLon + abLat * abLat;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point[0] - a[0]) * abLon + (point[1] - a[1]) * abLat) / lengthSq),
          );
    const candidate: LonLat = [a[0] + abLon * t, a[1] + abLat * t];
    const distance = distanceNm(point, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Band an arrival time falls into. */
export function relationFor(hours: number, thresholds: ApproachThresholds): BoundaryRelation {
  if (hours <= thresholds.imminent) return "ENTERING_SOON";
  if (hours <= thresholds.watch) return "APPROACHING";
  return "OUTSIDE";
}

/**
 * How an arrival figure is labelled beside the number.
 *
 * A reported ETA and an estimate must never render alike, and the label
 * is what carries that. Nothing here reads "ETA" on its own.
 */
export const ARRIVAL_BASIS_LABEL: Readonly<Record<ArrivalBasis, string>> = {
  REPORTED: "Reported by source",
  ESTIMATED: "Estimated from course and speed",
  UNAVAILABLE: "No arrival estimate available",
};
