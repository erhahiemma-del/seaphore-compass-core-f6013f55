/**
 * Shared, client-safe types for the Global Fishing Watch connector.
 * Contains ZERO secrets and ZERO network code — safe to import in both
 * the browser client proxy and the server-side gateway.
 */
import type {
  AisContinuityReport,
  AisMovementEvent,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import type {
  IdentityConfidenceResult,
} from "@/intelligence/matching/identity-confidence";

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

