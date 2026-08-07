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
