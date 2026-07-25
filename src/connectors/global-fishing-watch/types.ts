/**
 * Shared, client-safe types for the Global Fishing Watch connector.
 * Contains ZERO secrets and ZERO network code — safe to import in both
 * the browser client proxy and the server-side gateway.
 */
import type {
  AisContinuityReport,
  AisMovementEvent,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";

export interface GfwVesselIdentity {
  vesselId: string;
  imo: string | null;
  mmsi: string | null;
  callSign: string | null;
  flag: string | null;
  name: string | null;
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
}

export interface GfwHealthPayload {
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  message?: string;
}
