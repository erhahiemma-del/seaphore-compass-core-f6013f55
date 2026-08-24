/**
 * Shared, client-safe types for the Global Fishing Watch connector.
 * Contains ZERO secrets and ZERO network code — safe to import in both
 * the browser client proxy and the server-side gateway.
 */
import type {
  AisContinuityReport,
  AisMovementEvent,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import type { IdentityConfidenceResult } from "@/intelligence/matching/identity-confidence";

export interface GfwVesselIdentity {
  vesselId: string;
  imo: string | null;
  mmsi: string | null;
  callSign: string | null;
  flag: string | null;
  name: string | null;
  /** All self-reported/registry names beyond the primary name. */
  aliases?: string[];
  /** Prior names surfaced in the identity graph. */
  historicalNames?: string[];
  /** Upstream provider's own match verdict (GFW `matchFields`). */
  providerMatchFields?: string | null;
}

export interface GfwLastPosition {
  latitude: number;
  longitude: number;
  timestamp: string;
  speedKnots?: number;
  courseDeg?: number;
  destination?: string;
  eta?: string;
}

/**
 * A ranked candidate returned by the server search. Shipped to the
 * client so the officer can review or override the selection when
 * confidence is below threshold or two candidates are tied.
 */
export interface GfwCandidate {
  vessel: GfwVesselIdentity;
  confidence: IdentityConfidenceResult;
}

/**
 * Evidence Package returned by the server-side GFW gateway.
 * Contains NO authentication material. The client receives only
 * evidence, and is responsible for publishing to OSAE.
 */
export interface GfwEvidencePackage {
  vessel: GfwVesselIdentity;
  lastPosition: GfwLastPosition | null;
  movementHistory: AisMovementEvent[];
  continuityReport: AisContinuityReport;
  evidenceUrl: string;
  /** Identity Confidence Score for the selected vessel. */
  identityConfidence: IdentityConfidenceResult;
  /** Ranked list of all considered candidates (top-first). */
  alternates: GfwCandidate[];
  /**
   * True when the top score fell below the auto-select threshold or a
   * runner-up was within the tie band. Consumers MUST prompt the
   * officer instead of publishing evidence to OSAE.
   */
  requiresConfirmation: boolean;
  ambiguityReason: "none" | "below-threshold" | "tied-candidates" | "no-candidates";
}

export interface GfwHealthPayload {
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  message?: string;
}

/* ─────────────────────────────────────────────────────────────────────
 *  AREA / POSITIONS QUERY  (Sprint G5.5.3 · additive)
 *
 *  The search endpoint above answers "tell me about vessel X". These
 *  types support the complementary question the Live Command Map asks:
 *  "which vessels have been active in this area?"
 *
 *  IMPORTANT SEMANTIC LIMIT — Global Fishing Watch does not publish a
 *  live "all vessels currently transmitting" feed. The area query is
 *  built on the events dataset, so it returns vessels that produced an
 *  AIS-derived EVENT inside the box during the requested window, at the
 *  position of that event. It is a recent-activity picture, not a
 *  real-time traffic picture, and must never be presented as one.
 * ───────────────────────────────────────────────────────────────────── */

/** Geographic window for an area query. `[west, south, east, north]`. */
export interface GfwAreaQuery {
  readonly bbox: readonly [number, number, number, number];
  /** ISO-8601 start of the activity window. Defaults to 24 h before now. */
  readonly since?: string;
  /** ISO-8601 end of the activity window. Defaults to now. */
  readonly until?: string;
  /** Upper bound on returned vessels. Clamped server-side. */
  readonly limit?: number;
}

/**
 * One vessel observed in the area, already normalised.
 *
 * Deliberately flat, provider-neutral, and free of raw GFW objects — this
 * is what crosses the RPC boundary, so no upstream response shape ever
 * reaches the client.
 */
export interface GfwAreaVessel {
  /** GFW's stable vessel id. Always present; used as the fallback key. */
  readonly vesselId: string;
  readonly imo: string | null;
  readonly mmsi: string | null;
  readonly name: string | null;
  readonly flag: string | null;
  readonly latitude: number;
  readonly longitude: number;
  /** Speed over ground in knots, when the event carried it. */
  readonly speedKnots: number | null;
  /** Course over ground in degrees, when the event carried it. */
  readonly courseDeg: number | null;
  /** ISO-8601 timestamp of the observation. */
  readonly timestamp: string;
  /** GFW event type that produced this observation, e.g. `"fishing"`. */
  readonly eventType: string | null;
  /** Provenance — constant, but carried explicitly so it survives fusion. */
  readonly source: "global-fishing-watch";
  /** When Seaphore retrieved it, for freshness accounting. */
  readonly retrievedAt: string;
}

/** Outcome states. Never throws for the caller — the map must degrade, not crash. */
export type GfwAreaStatus =
  | "ok"
  | "empty"
  | "credentials-missing"
  | "auth-failed"
  | "upstream-error";

/** Diagnostics for the Live Feed Monitor. Contains no credential material. */
export interface GfwAreaDiagnostics {
  readonly requestedAt: string;
  readonly latencyMs: number;
  /** Raw entries returned upstream, before normalisation. */
  readonly entriesReceived: number;
  /** Entries discarded for want of a usable position or timestamp. */
  readonly entriesDiscarded: number;
  /** Distinct vessels after de-duplication (latest observation wins). */
  readonly vesselsReturned: number;
  /** True when the response was served from the in-process TTL cache. */
  readonly fromCache: boolean;
}

/** Result of an area query. `vessels` is always an array — never null. */
export interface GfwAreaResult {
  readonly status: GfwAreaStatus;
  readonly vessels: readonly GfwAreaVessel[];
  /** Officer-facing explanation. Always populated for non-`ok` states. */
  readonly message: string | null;
  readonly diagnostics: GfwAreaDiagnostics;
}
