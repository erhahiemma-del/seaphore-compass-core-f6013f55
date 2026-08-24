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
// Guarded: this module can be evaluated more than once (HMR, or separate
// client/SSR module graphs sharing the same process). Re-registration is a
// duplicate evaluation, not a duplicate module, so it is a no-op.
if (!riskModuleRegistry.has(aisIntegrityModule.id)) {
  riskModuleRegistry.register(aisIntegrityModule);
}
