/**
 * An operational attention item raised by an approach assessment.
 *
 * Distinct from an investigation, deliberately and permanently. An alert
 * says *something needs looking at*; a case says *someone is looking at
 * it*. Merging them would mean every moment of attention had to become a
 * case file, and an officer glancing at a vessel would be opening
 * records with their name on them.
 *
 * An alert may one day escalate into a case. It must never require one.
 *
 * ## Severity is not risk
 *
 * A vessel arriving within a day is not dangerous; it is *soon*. The
 * scale here measures how promptly an officer should look, and nothing
 * about the vessel's conduct. Mapping a 24-hour arrival to "high risk"
 * would put a judgement on a hull whose behaviour nobody has assessed —
 * and `riskLevel` remains `UNKNOWN` for every vessel in this deployment,
 * which is the honest state.
 *
 * ## The triggering assessment is frozen
 *
 * The evidence carried here is a snapshot taken when the alert was
 * raised, never recomputed from today's position. An officer reviewing
 * why an alert exists must see what was true at the time, not a
 * reconstruction from data that has since moved.
 */
import type {
  ArrivalBasis,
  BoundaryAccuracy,
  BoundaryRelation,
} from "@/services/geospatial/maritime-boundary";

/* ── What raised it ──────────────────────────────────────────────────── */

/**
 * Conditions the current data can actually establish.
 *
 * Approach and boundary state only. `MANIFEST_CHECK_REQUIRED`,
 * `COMPLIANCE_BREACH` and `SANCTIONS_RISK` are absent because no
 * provider or policy engine in this deployment can establish them, and
 * an alert whose stated reason is invented is worse than no alert.
 */
export type AlertCondition =
  | "APPROACHING_72H"
  | "APPROACHING_48H"
  | "APPROACHING_24H"
  | "ENTERING"
  | "INSIDE_BOUNDARY";

/**
 * How promptly an officer should look. Never a statement about the
 * vessel.
 */
export type AttentionSeverity =
  /** Worth knowing about. */
  | "WATCH"
  /** Worth reviewing. */
  | "ATTENTION"
  /** Worth reviewing now. */
  | "URGENT";

/**
 * Condition to severity.
 *
 * Configurable by replacing this table, which is the point of it being a
 * table: the mapping is an operational policy decision, not a property
 * of the geometry.
 */
export const SEVERITY_FOR_CONDITION: Readonly<Record<AlertCondition, AttentionSeverity>> = {
  APPROACHING_72H: "WATCH",
  APPROACHING_48H: "ATTENTION",
  APPROACHING_24H: "URGENT",
  ENTERING: "URGENT",
  INSIDE_BOUNDARY: "ATTENTION",
};

/** How urgent each condition is relative to the others, for escalation. */
const CONDITION_RANK: Readonly<Record<AlertCondition, number>> = {
  APPROACHING_72H: 1,
  APPROACHING_48H: 2,
  INSIDE_BOUNDARY: 3,
  APPROACHING_24H: 4,
  ENTERING: 5,
};

export function isMoreUrgent(next: AlertCondition, current: AlertCondition): boolean {
  return CONDITION_RANK[next] > CONDITION_RANK[current];
}

/**
 * The condition an assessment establishes, if any.
 *
 * Returns null when the assessment cannot support one — an arrival that
 * could not be computed is not a quiet all-clear, and must not become an
 * alert claiming a horizon nobody derived.
 */
export function conditionFor(
  relation: BoundaryRelation,
  hoursToBoundary: number | null,
): AlertCondition | null {
  if (relation === "INSIDE_DISPLAYED_BOUNDARY") return "INSIDE_BOUNDARY";
  if (relation === "ENTERING_SOON") return "ENTERING";
  if (hoursToBoundary == null) return null;
  if (hoursToBoundary <= 24) return "APPROACHING_24H";
  if (hoursToBoundary <= 48) return "APPROACHING_48H";
  if (hoursToBoundary <= 72) return "APPROACHING_72H";
  return null;
}

/* ── Who it is about ─────────────────────────────────────────────────── */

/**
 * Enough to identify the vessel unambiguously, later.
 *
 * Keyed on IMO rather than name: a renamed vessel is the same hull, and
 * an alert that lost its subject because the source published a new name
 * would be an orphaned record about nobody.
 */
export interface AlertVesselRef {
  readonly imo: string;
  readonly mmsi?: string;
  readonly name?: string;
}

/* ── Why it was raised ───────────────────────────────────────────────── */

/**
 * The assessment as it stood when the alert was raised.
 *
 * Frozen. Every field is optional exactly where the underlying engine
 * may legitimately have none: an arrival that could not be derived
 * carries `hoursToBoundary: null` and `arrivalBasis: "UNAVAILABLE"`,
 * never a plausible number.
 */
export interface AlertEvidence {
  readonly relation: BoundaryRelation;
  /** The horizon the officer's query was assessed against. */
  readonly thresholdHours: number;
  readonly hoursToBoundary: number | null;
  readonly distanceNm: number | null;
  readonly arrivalBasis: ArrivalBasis;
  readonly boundaryAccuracy: BoundaryAccuracy;
  /** The engine's own account of why it said this. */
  readonly rationale: string;
  /** Which provider supplied the position behind the assessment. */
  readonly sourceId: string;
  /** The provider's timestamp for that position. */
  readonly observedAt: string;
  /** Age of that position when the alert was raised. */
  readonly positionAgeMs: number;
  /** When Seaphore performed the assessment. */
  readonly assessedAt: string;
}

/**
 * Whether the evidence is still worth acting on.
 *
 * An alert built on a position that has since gone stale must not keep
 * presenting "18 hours to the boundary" as though it were current. The
 * alert stays visible; the arrival figure stops being an assertion.
 */
export function evidenceIsStale(evidence: AlertEvidence, maxAgeMs: number): boolean {
  return evidence.positionAgeMs > maxAgeMs;
}
