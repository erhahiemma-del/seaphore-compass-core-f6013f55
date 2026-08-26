/**
 * Intelligence — public API.
 *
 * The orchestration layer over the canonical engines. Import from here
 * rather than reaching into individual modules.
 *
 * This domain contains NO intelligence engine, confidence engine,
 * explainability engine, evidence engine or AIS analyser. Those are
 * `@/services/reasoning`, `@/services/osae`, `@/lib/osint/confidence` and
 * `AISBehaviourAnalyzer`. Everything here composes them.
 */
import { riskModuleRegistry } from "./module-registry";
import { aisIntegrityModule } from "./modules/ais-integrity";

export {
  isValidFinding,
  validateFinding,
  type EvidenceRef,
  type FindingAssessment,
  type FindingDataQuality,
  type FindingKind,
  type FindingProvenance,
  type FindingStatus,
  type FindingSubject,
  type FindingSubjectKind,
  type FindingViolation,
  type FusionSummary,
  type IntelligenceFinding,
  type IpefContributorRef,
  type RiskModuleId,
} from "./types";

export {
  PENDING_RISK_MODULES,
  RiskModuleRegistry,
  RiskModuleRegistryError,
  pendingSourceFinding,
  riskModuleRegistry,
  type FindingContext,
  type RiskModule,
  type RiskModuleStatus,
} from "./module-registry";

export {
  aggregateFindings,
  byPriority,
  collectEvidence,
  type AggregateOptions,
  type FindingSet,
  type ModuleContribution,
} from "./aggregator";

export { aisIntegrityModule };

// Composition point. AIS Integrity registers here rather than in
// module-registry.ts, which it imports — registering there would close an
// import cycle.
//
// This module can be evaluated more than once — Vite hot updates, or a
// client and SSR graph sharing one process. `register` is idempotent by
// definition, so a repeat evaluation is a no-op while a genuinely
// different module under this id still raises a diagnostic error.
//
// The previous `if (!has(id))` guard prevented the crash but could not
// tell those two cases apart: it would silently keep the old module even
// when a conflicting one was registered. Owning the rule in the registry
// means every caller gets it, not just this one.
riskModuleRegistry.register(aisIntegrityModule);
