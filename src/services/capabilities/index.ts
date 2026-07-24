/**
 * Capabilities Layer — Sprint 1A.3.
 *
 * Additive facade over the IAL. Each capability module resolves its
 * providers via `ConnectorManager.getByCapability(...)` and returns an
 * EvidencePackage. Orchestration (Mission Planner → ICE → OIE) consumes
 * capabilities; it never names a connector.
 */
export {
  runSanctionsScreening,
  SANCTIONS_FOLLOW_UPS,
  type SanctionsScreeningRequest,
  type SanctionsScreeningResult,
  type SanctionsScreeningTarget,
} from "./sanctions";
