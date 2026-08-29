/**
 * Evidence for an arrival rule that does not exist yet.
 *
 * ## Why this stops short of deciding anything
 *
 * A live vessel off Lagos is currently five days past the ETA it declared,
 * sitting with restricted manoeuverability. That looks like an anomaly, and
 * it is very nearly the sort of thing Seaphore exists to notice. It is also
 * exactly the sort of thing that is wrong often enough to matter: crews
 * leave a stale ETA broadcasting for days, a vessel waiting for a berth is
 * behaving normally, and an ETA to a different port entirely is not late at
 * all.
 *
 * So this assembles the facts and computes the arithmetic — which is
 * deterministic and testable — and refuses to draw the conclusion, which is
 * neither. A rule that decides what overdue *means* needs validation
 * against real Nigerian port behaviour, and until it has that, an alert
 * raised here would be a guess wearing an alert's authority.
 *
 * Nothing in this module raises, escalates, or writes an alert. It produces
 * a value a later rule can evaluate.
 */
import type { DeclaredVoyage } from "./vessel-enrichment";

/**
 * How the declared arrival relates to the last observation.
 *
 * Descriptive only. `PAST_DECLARED_ETA` says the clock has passed the time
 * the vessel gave — not that the vessel is late, which is a judgement about
 * cause that this cannot make.
 */
export type ArrivalTiming =
  /** Observation precedes the declared ETA. */
  | "BEFORE_DECLARED_ETA"
  /** Observation is after the declared ETA. Not a finding on its own. */
  | "PAST_DECLARED_ETA"
  /** No ETA declared, or no observation time. Nothing to compare. */
  | "NOT_COMPARABLE";

export interface ArrivalEvidence {
  readonly timing: ArrivalTiming;
  /**
   * Signed milliseconds from declared ETA to observation.
   *
   * Positive means the observation is later than the ETA. Null whenever
   * `timing` is `NOT_COMPARABLE`, so a missing comparison can never be
   * read as a zero-hour difference.
   */
  readonly deltaMs: number | null;
  /** Provider-declared ETA, ISO-8601. Never computed. */
  readonly declaredEta: string | null;
  /** Provider's observation time for the state below. */
  readonly observedAt: string | null;
  readonly navigationStatus: string | null;
  readonly currentDraught: number | null;
  /** Destination as resolved, when it resolved to a real port identifier. */
  readonly destinationUnlocode: string | null;
  /**
   * Whether the destination is a port Seaphore can name.
   *
   * A rule must know this: "past ETA" for an unresolved destination is a
   * far weaker signal than one bound for a known port, because the ETA may
   * belong to a voyage leg Seaphore cannot see.
   */
  readonly destinationResolved: boolean;
}

/**
 * Assemble the facts. Decide nothing.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the arithmetic
 * is testable and so nothing here can quietly substitute the current time
 * for a provider timestamp it was not given.
 */
export function arrivalEvidence(voyage: DeclaredVoyage | null): ArrivalEvidence {
  if (!voyage) {
    return {
      timing: "NOT_COMPARABLE",
      deltaMs: null,
      declaredEta: null,
      observedAt: null,
      navigationStatus: null,
      currentDraught: null,
      destinationUnlocode: null,
      destinationResolved: false,
    };
  }

  const link = voyage.destinationLink;
  const base = {
    declaredEta: voyage.eta,
    observedAt: voyage.observedAt,
    navigationStatus: voyage.navigationStatus,
    currentDraught: voyage.currentDraught,
    destinationUnlocode: link.unlocode,
    destinationResolved: link.state === "VERIFIED",
  };

  const eta = voyage.eta ? Date.parse(voyage.eta) : NaN;
  const observed = voyage.observedAt ? Date.parse(voyage.observedAt) : NaN;

  /*
   * Both times must be real. An unparseable one is not treated as zero:
   * that would place the vessel at the epoch and make every voyage look
   * catastrophically overdue.
   */
  if (!Number.isFinite(eta) || !Number.isFinite(observed)) {
    return { ...base, timing: "NOT_COMPARABLE", deltaMs: null };
  }

  const deltaMs = observed - eta;
  return {
    ...base,
    timing: deltaMs > 0 ? "PAST_DECLARED_ETA" : "BEFORE_DECLARED_ETA",
    deltaMs,
  };
}
