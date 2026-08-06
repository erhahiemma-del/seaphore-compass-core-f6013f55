/**
 * GIP — Observation validation.
 *
 * The gate every observation passes through before it reaches the Shared
 * Geospatial Service. Nothing enters the map unclassified.
 *
 * Three verdicts, and the distinction between them is deliberate:
 *
 *   - **accepted** — usable as-is.
 *   - **warning**  — usable, but an officer should know something about it.
 *     Warnings reach SGS. Hiding a usable-but-imperfect observation would
 *     silently shrink the operational picture.
 *   - **rejected** — not usable. Never reaches SGS.
 *
 * Every verdict carries reasons. A rejection without a stated reason is
 * indistinguishable from a bug, so `reasons` is non-empty for anything
 * other than a clean accept.
 *
 * This module is pure and dependency-free: no clock of its own, no I/O, no
 * provider knowledge. That makes the rules independently testable and lets
 * any source reuse them.
 */
import type { Vessel } from "./vessel";

/** Outcome of validating one observation. */
export type ValidationVerdict = "accepted" | "warning" | "rejected";

/** Machine-readable reason codes. Stable — they are asserted in tests. */
export type ValidationCode =
  | "missing-coordinates"
  | "invalid-coordinates"
  | "null-island"
  | "missing-identity"
  | "missing-mmsi"
  | "invalid-timestamp"
  | "future-timestamp"
  | "position-too-old"
  | "duplicate-observation"
  | "confidence-below-threshold"
  | "implausible-speed"
  | "invalid-heading";

/** One finding against an observation. */
export interface ValidationReason {
  readonly code: ValidationCode;
  /** Whether this finding alone rejects the observation. */
  readonly severity: "warning" | "rejection";
  /** Officer-facing explanation. */
  readonly message: string;
}

/** Result of validating one observation. */
export interface ValidationResult {
  readonly verdict: ValidationVerdict;
  readonly reasons: readonly ValidationReason[];
  /** The observation, when the verdict permits it to continue. */
  readonly vessel: Vessel | null;
}

/** Tunable limits. Every threshold is injectable — none are magic numbers. */
export interface ValidationOptions {
  /** Evaluation time in epoch ms. Injectable so rules are deterministic. */
  readonly now?: number;
  /** Reject observations older than this. Default 7 days. */
  readonly maxAgeMs?: number;
  /** Warn (do not reject) beyond this age. Default 1 hour. */
  readonly staleWarningMs?: number;
  /** Reject below this confidence. Default 0 — nothing rejected on confidence. */
  readonly minConfidence?: number;
  /** Warn below this confidence. Default 0.5. */
  readonly warnConfidence?: number;
  /** Warn above this speed in knots. Default 40 — plausible for a fast craft. */
  readonly maxPlausibleSpeedKnots?: number;
  /** Keys already seen in this batch, for duplicate detection. */
  readonly seen?: ReadonlySet<string>;
  /** Tolerance for a clock-skewed future timestamp. Default 5 minutes. */
  readonly futureToleranceMs?: number;
}

const DEFAULTS = {
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  staleWarningMs: 60 * 60 * 1000,
  minConfidence: 0,
  warnConfidence: 0.5,
  maxPlausibleSpeedKnots: 40,
  futureToleranceMs: 5 * 60 * 1000,
} as const;

function reject(code: ValidationCode, message: string): ValidationReason {
  return { code, severity: "rejection", message };
}

function warn(code: ValidationCode, message: string): ValidationReason {
  return { code, severity: "warning", message };
}

/**
 * Validate one observation.
 *
 * Collects *every* applicable finding rather than short-circuiting on the
 * first, so diagnostics can report all of what is wrong with a feed rather
 * than only the first thing noticed.
 */
export function validateObservation(
  vessel: Vessel,
  options: ValidationOptions = {},
): ValidationResult {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULTS.maxAgeMs;
  const staleWarningMs = options.staleWarningMs ?? DEFAULTS.staleWarningMs;
  const minConfidence = options.minConfidence ?? DEFAULTS.minConfidence;
  const warnConfidence = options.warnConfidence ?? DEFAULTS.warnConfidence;
  const maxSpeed = options.maxPlausibleSpeedKnots ?? DEFAULTS.maxPlausibleSpeedKnots;
  const futureTolerance = options.futureToleranceMs ?? DEFAULTS.futureToleranceMs;

  const reasons: ValidationReason[] = [];

  // ── Identity ──
  if (!vessel.identity?.imo) {
    reasons.push(reject("missing-identity", "No IMO, MMSI or provider id — cannot be tracked."));
  }
  if (!vessel.identity?.mmsi) {
    reasons.push(warn("missing-mmsi", "No MMSI — cross-provider matching will be weaker."));
  }

  // ── Coordinates ──
  const { lat, lon } = vessel.position ?? ({} as Vessel["position"]);
  if (typeof lat !== "number" || typeof lon !== "number") {
    reasons.push(reject("missing-coordinates", "Observation carries no position."));
  } else if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    reasons.push(reject("invalid-coordinates", "Position is not a finite coordinate pair."));
  } else if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    reasons.push(reject("invalid-coordinates", `Position out of range (${lat}, ${lon}).`));
  } else if (lat === 0 && lon === 0) {
    // 0,0 is in the Gulf of Guinea's approach — plausible on this map, but far
    // more often an unset default. Warn rather than reject.
    reasons.push(warn("null-island", "Position is exactly 0,0 — often an unset default."));
  }

  // ── Timestamp ──
  const observedAt = Date.parse(vessel.position?.timestamp ?? "");
  if (Number.isNaN(observedAt)) {
    reasons.push(reject("invalid-timestamp", "Observation timestamp is unparseable."));
  } else {
    const age = now - observedAt;
    if (age < -futureTolerance) {
      reasons.push(warn("future-timestamp", "Timestamp is in the future — check provider clock."));
    }
    if (age > maxAgeMs) {
      reasons.push(
        reject("position-too-old", `Position is ${Math.round(age / 86_400_000)} days old.`),
      );
    } else if (age > staleWarningMs) {
      reasons.push(
        warn("position-too-old", `Position is ${Math.round(age / 60_000)} minutes old.`),
      );
    }
  }

  // ── Kinematics ──
  const speed = vessel.position?.speed;
  if (typeof speed === "number" && Number.isFinite(speed) && speed > maxSpeed) {
    reasons.push(warn("implausible-speed", `Reported speed ${speed} kn exceeds ${maxSpeed} kn.`));
  }
  const heading = vessel.position?.heading;
  if (typeof heading === "number" && Number.isFinite(heading) && (heading < 0 || heading >= 360)) {
    reasons.push(warn("invalid-heading", `Heading ${heading}° is outside 0–359.`));
  }

  // ── Duplicate ──
  if (options.seen?.has(vessel.identity?.imo ?? "")) {
    reasons.push(
      reject("duplicate-observation", "A newer observation for this vessel is already present."),
    );
  }

  // ── Confidence ──
  const confidence = vessel.confidence;
  if (typeof confidence === "number") {
    if (confidence < minConfidence) {
      reasons.push(
        reject(
          "confidence-below-threshold",
          `Confidence ${confidence.toFixed(2)} is below the ${minConfidence} floor.`,
        ),
      );
    } else if (confidence < warnConfidence) {
      reasons.push(
        warn(
          "confidence-below-threshold",
          `Confidence ${confidence.toFixed(2)} is below the ${warnConfidence} advisory level.`,
        ),
      );
    }
  }

  const rejected = reasons.some((reason) => reason.severity === "rejection");
  const verdict: ValidationVerdict = rejected
    ? "rejected"
    : reasons.length > 0
      ? "warning"
      : "accepted";

  return { verdict, reasons, vessel: rejected ? null : vessel };
}

/** Aggregate counts across a validated batch. */
export interface ValidationSummary {
  readonly accepted: number;
  readonly warned: number;
  readonly rejected: number;
  /** Rejection counts by code, for the diagnostics surface. */
  readonly rejectionsByCode: Readonly<Record<string, number>>;
  readonly warningsByCode: Readonly<Record<string, number>>;
}

/** Result of validating a whole batch. */
export interface BatchValidationResult {
  /** Observations permitted to reach SGS — accepted plus warned. */
  readonly vessels: readonly Vessel[];
  readonly results: readonly ValidationResult[];
  readonly summary: ValidationSummary;
}

/**
 * Validate a batch, de-duplicating as it goes.
 *
 * Observations are processed newest-first so that when a provider returns
 * the same vessel twice, the *older* copy is the one marked duplicate.
 */
export function validateBatch(
  vessels: readonly Vessel[],
  options: ValidationOptions = {},
): BatchValidationResult {
  const ordered = [...vessels].sort(
    (a, b) => Date.parse(b.position?.timestamp ?? "") - Date.parse(a.position?.timestamp ?? ""),
  );

  const seen = new Set<string>(options.seen ?? []);
  const results: ValidationResult[] = [];
  const vesselsOut: Vessel[] = [];
  const rejectionsByCode: Record<string, number> = {};
  const warningsByCode: Record<string, number> = {};
  let accepted = 0;
  let warned = 0;
  let rejected = 0;

  for (const vessel of ordered) {
    const result = validateObservation(vessel, { ...options, seen });
    results.push(result);

    for (const reason of result.reasons) {
      const bucket = reason.severity === "rejection" ? rejectionsByCode : warningsByCode;
      bucket[reason.code] = (bucket[reason.code] ?? 0) + 1;
    }

    if (result.verdict === "rejected") {
      rejected += 1;
      continue;
    }
    if (result.verdict === "warning") warned += 1;
    else accepted += 1;

    if (vessel.identity?.imo) seen.add(vessel.identity.imo);
    if (result.vessel) vesselsOut.push(result.vessel);
  }

  return {
    vessels: vesselsOut,
    results,
    summary: { accepted, warned, rejected, rejectionsByCode, warningsByCode },
  };
}
