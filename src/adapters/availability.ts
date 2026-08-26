/**
 * Provider availability — one reading of three existing vocabularies.
 *
 * Seaphore already describes provider state in three places, each
 * correct for its own layer and none of them interchangeable:
 *
 *   `SourceStatus`        the data source matrix — ACTIVE, PLANNED, …
 *   `AisProviderStatus`   the AIS registry — CONNECTED, PENDING_CREDENTIALS, …
 *   `SourceHealthReport`  live vessel feeds — connected, latency, freshness
 *
 * A caller that wants to know "can I ask this provider anything right
 * now" currently has to know which of the three it is holding. This
 * module is the translation, and deliberately *only* the translation.
 *
 * ## It is a mapping, not a replacement
 *
 * Every result carries the original status verbatim in `providerStatus`
 * and the reason in `reason`. Nothing here collapses a diagnosis into a
 * traffic light: an officer or a developer must always be able to get
 * from "unavailable" back to "PENDING_CREDENTIALS", because those answer
 * different questions and only the second tells you what to do about it.
 *
 * Adding a fourth enum was the obvious move and the wrong one — it would
 * have made four vocabularies where there were three.
 */
import type { SourceStatus } from "./status";

/**
 * What a caller can actually do with a provider right now.
 *
 * Coarser than any of the source vocabularies on purpose: this answers
 * one question — is it worth issuing a request — and defers every
 * "why" to the fields beside it.
 */
export type ProviderAvailability =
  /** Connected and expected to answer. */
  | "available"
  /** Registered and deliberately not connected yet. */
  | "planned"
  /** Would work, but credentials or configuration are missing. */
  | "credentials-required"
  /** Normally available; currently not answering. */
  | "temporarily-unavailable"
  /** Connected but the data is old enough to state rather than serve silently. */
  | "stale"
  /** Deliberately out of scope. Not a failure. */
  | "unsupported";

export interface AvailabilityReading {
  readonly availability: ProviderAvailability;
  /**
   * Why, in the source's own words.
   *
   * The original status string, so a diagnostic surface can show what
   * the underlying layer actually said rather than this module's
   * summary of it.
   */
  readonly reason: string;
  /** The untranslated status, preserved for diagnostics. */
  readonly providerStatus: string;
  /** Which vocabulary `providerStatus` belongs to. */
  readonly vocabulary: "source-matrix" | "ais-registry" | "feed-health";
}

/** True when it is worth issuing a request to this provider. */
export function isQueryable(reading: AvailabilityReading): boolean {
  // `stale` is queryable: the provider answers, and the age of what it
  // returns is a property of the observation rather than a reason to
  // withhold the request.
  return reading.availability === "available" || reading.availability === "stale";
}

/**
 * Translate a data source matrix status.
 *
 * `INFERRED` maps to `available` because an inferred source genuinely
 * does return data — the fact that it is computed rather than observed
 * is carried by its confidence grade, not by its availability.
 */
export function fromSourceStatus(status: SourceStatus): AvailabilityReading {
  const availability: ProviderAvailability =
    status === "ACTIVE" || status === "PARTIAL" || status === "INFERRED"
      ? "available"
      : status === "PLANNED"
        ? "planned"
        : "unsupported";
  return Object.freeze({
    availability,
    reason: status,
    providerStatus: status,
    vocabulary: "source-matrix" as const,
  });
}

/**
 * Translate an AIS provider registry status.
 *
 * `PENDING_CREDENTIALS` is the interesting case and the reason this
 * function exists: the registry documents it as "not an error", and it
 * must not translate to `temporarily-unavailable`, which would suggest
 * something is broken and might recover on its own.
 */
export function fromAisProviderStatus(status: string): AvailabilityReading {
  const availability: ProviderAvailability =
    status === "CONNECTED"
      ? "available"
      : status === "PENDING_CREDENTIALS" ||
          status === "NOT_CONFIGURED" ||
          status === "AUTH_REQUIRED"
        ? "credentials-required"
        : status === "STALE"
          ? "stale"
          : status === "FAILED" || status === "RATE_LIMITED"
            ? "temporarily-unavailable"
            : "unsupported";
  return Object.freeze({
    availability,
    reason: status,
    providerStatus: status,
    vocabulary: "ais-registry" as const,
  });
}

/**
 * Translate a live feed's health report.
 *
 * Takes the two fields it needs rather than the whole report, so this
 * module does not import the geospatial layer — the dependency would
 * run the wrong way, and `adapters/` is meant to sit below it.
 */
export function fromFeedHealth(input: {
  readonly connected: boolean;
  readonly status: string;
  readonly freshnessMs?: number | null;
  /** Age past which a connected feed is reported stale. */
  readonly staleAfterMs?: number;
}): AvailabilityReading {
  const staleAfter = input.staleAfterMs ?? 600_000;
  const availability: ProviderAvailability = !input.connected
    ? "temporarily-unavailable"
    : input.freshnessMs != null && input.freshnessMs > staleAfter
      ? "stale"
      : "available";
  return Object.freeze({
    availability,
    reason: input.status,
    providerStatus: input.status,
    vocabulary: "feed-health" as const,
  });
}
