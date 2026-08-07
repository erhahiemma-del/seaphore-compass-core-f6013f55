/**
 * Intelligence — canonical finding model.
 *
 * Implements `docs/intelligence/INTELLIGENCE_FINDING_CONTRACT.md`.
 *
 * ## This module computes nothing
 *
 * An `IntelligenceFinding` composes the existing pipeline and owns almost
 * nothing. Of its fields, only seven are authoritative here — and none of
 * those is a score. Every number and every judgement is *copied* from the
 * engine that owns it:
 *
 *   confidence / band / whyChain / counterHypothesis  ← `@/services/reasoning`
 *   priority                                          ← `@/services/osae` ONLY
 *   evidence grade                                    ← `@/lib/osint/confidence`
 *   validation                                        ← `@/services/geospatial/validation`
 *   freshness                                         ← `@/services/geospatial/freshness`
 *   source provenance                                 ← `VesselProvenance`
 *   pipeline provenance                               ← IPEF
 *
 * There is no confidence engine, evidence engine, explainability engine or
 * AIS analyser here. Adding one would duplicate a canonical module.
 */
import type { OperationalPriority } from "@/services/osae";
import type {
  ConfidenceBand,
  ConfidencePropagation,
  CounterHypothesis,
  WhyChainStep,
} from "@/services/reasoning/types";
import type { OsintConfidenceLevel } from "@/lib/osint/types";
import type {
  FreshnessBand,
  ValidationReason,
  ValidationVerdict,
  VesselProvenance,
} from "@/services/geospatial";

/** What a finding is about. */
export type FindingSubjectKind = "vessel" | "company" | "area";

export interface FindingSubject {
  readonly kind: FindingSubjectKind;
  /** Canonical id — IMO for a vessel, registry id for a company. */
  readonly id: string;
  readonly displayName: string;
}

/** Registered risk module ids. Extending this is how a module is added. */
export type RiskModuleId =
  | "ais-integrity"
  | "navigation"
  | "ownership"
  | "sanctions"
  | "compliance"
  | "cargo"
  | "revenue"
  | "environmental"
  | "company-intelligence";

/** Taxonomy of finding kinds. Open by design — modules declare their own. */
export type FindingKind = string;

/**
 * Lifecycle state.
 *
 * The distinction between these four is what stops the platform asserting
 * things it cannot support. A module that has no data returns
 * `pending-source` with a reason — never a fabricated score, and never
 * silence.
 */
export type FindingStatus =
  "supported" | "insufficient-evidence" | "pending-source" | "not-applicable";

/**
 * A reference to evidence held by its producing engine.
 *
 * Held by reference, never copied wholesale: the analyzer owns the full
 * record, and duplicating it here would create a second version that could
 * drift from the original.
 */
export interface EvidenceRef {
  readonly id: string;
  /** Evidence type, e.g. `"AIS_DARK"`. */
  readonly type: string;
  /**
   * EVIDENCE GRADE — how trustworthy the *source or observation* is.
   * Owned by the OSINT confidence engine. Distinct from
   * {@link FindingAssessment.band}, which grades the *conclusion*.
   */
  readonly grade: OsintConfidenceLevel;
  /**
   * 0–1 confidence in the OBSERVATION, from the producing analyzer.
   * Never confidence in a risk judgement.
   */
  readonly observationConfidence: number;
  /** The analyzer's officer-safe explanation. Describes, never classifies. */
  readonly summary: string;
  readonly observedAt: string;
  readonly provenance: VesselProvenance;
  /** Pointer to the full record in its owning engine. */
  readonly payloadRef: string;
}

/**
 * The inference layer, produced entirely by `@/services/reasoning`.
 *
 * `confidence` is the value at the *assessment* rung of
 * `reasoning.propagate` — not the evidence confidence. The full ladder is
 * carried so the Evidence Viewer can show how confidence decayed from
 * evidence to recommendation.
 */
export interface FindingAssessment {
  readonly statement: string;
  readonly confidence: number;
  readonly band: ConfidenceBand;
  readonly propagation: ConfidencePropagation;
  readonly whyChain: readonly WhyChainStep[];
  /**
   * Required when `band` is `high` or `medium`, per
   * `reasoning.requiresCounterHypothesis`. A confident claim must state
   * what would refute it. Enforced by {@link isValidFinding}.
   */
  readonly counterHypothesis: CounterHypothesis | null;
}

/** Quality of the data behind a finding. */
export interface FindingDataQuality {
  readonly validation: ValidationVerdict;
  readonly validationReasons: readonly ValidationReason[];
  /** Recomputed at render — age changes with the clock. */
  readonly freshness: FreshnessBand;
  readonly ageMs: number | null;
  /** Absent fields, stated plainly, e.g. "no course reported". */
  readonly gaps: readonly string[];
}

/** One IPEF pipeline stage that contributed. */
export interface IpefContributorRef {
  readonly contributorId: string;
  readonly stage: string;
  readonly recordedAt: string;
}

/** Cross-provider agreement, from `fusion.ts`. */
export interface FusionSummary {
  readonly sourceCount: number;
  readonly sourceIds: readonly string[];
  readonly conflictFields: readonly string[];
}

export interface FindingProvenance {
  /** Where the data came from. */
  readonly sources: readonly VesselProvenance[];
  /** Which pipeline stages produced it. */
  readonly pipeline: readonly IpefContributorRef[];
  readonly corroboration: FusionSummary | null;
}

/**
 * The canonical intelligence object.
 *
 * Consumed by the Vessel Intelligence Card, Evidence Viewer, Copilot,
 * Fleet Dashboard, Timeline, and every future provider surface.
 */
export interface IntelligenceFinding {
  readonly id: string;
  readonly subject: FindingSubject;
  readonly module: RiskModuleId;
  readonly kind: FindingKind;

  /** Officer-facing claim. Evidence-phrased — never "High Risk". */
  readonly statement: string;
  readonly producedAt: string;
  readonly observedAt: string | null;

  readonly evidence: readonly EvidenceRef[];
  readonly assessment: FindingAssessment | null;

  /** Copied from OSAE. Nothing else may set this. */
  readonly priority: OperationalPriority | null;
  readonly priorityRationale: string | null;

  readonly dataQuality: FindingDataQuality;
  readonly provenance: FindingProvenance;

  readonly status: FindingStatus;
  /** Required unless `status` is `supported`. */
  readonly unavailableReason: string | null;
}

/** A contract violation found by {@link isValidFinding}. */
export interface FindingViolation {
  readonly code:
    | "unsupported-statement"
    | "missing-unavailable-reason"
    | "missing-counter-hypothesis"
    | "priority-without-evidence";
  readonly message: string;
}

/**
 * Enforce the contract's prohibitions structurally.
 *
 * These are not style rules. Each one prevents the platform asserting
 * something it cannot support, which is the failure mode the whole
 * architecture exists to avoid.
 */
export function validateFinding(finding: IntelligenceFinding): readonly FindingViolation[] {
  const violations: FindingViolation[] = [];

  if (finding.status === "supported" && finding.evidence.length === 0) {
    violations.push({
      code: "unsupported-statement",
      message: "A supported finding must cite at least one piece of evidence.",
    });
  }

  if (finding.status !== "supported" && !finding.unavailableReason) {
    violations.push({
      code: "missing-unavailable-reason",
      message: `status "${finding.status}" requires an unavailableReason.`,
    });
  }

  const band = finding.assessment?.band;
  if ((band === "high" || band === "medium") && !finding.assessment?.counterHypothesis) {
    violations.push({
      code: "missing-counter-hypothesis",
      message: `A "${band}" assessment must state what would refute it.`,
    });
  }

  if (finding.priority !== null && finding.evidence.length === 0) {
    violations.push({
      code: "priority-without-evidence",
      message: "An operational priority cannot be assigned without evidence.",
    });
  }

  return violations;
}

/** True when the finding satisfies every contract prohibition. */
export function isValidFinding(finding: IntelligenceFinding): boolean {
  return validateFinding(finding).length === 0;
}
