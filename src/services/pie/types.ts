/**
 * Predictive Intelligence Engine (PIE) — types.
 *
 * Golden Rule: Predict early. Explain every prediction. Learn continuously.
 * Never make a prediction without evidence.
 */
import type { EvidenceGrade } from "@/lib/data-model/oc-001";
import type { NormalizedEvidence } from "@/services/ial/types";
import type { CanonicalEntityRef } from "@/services/ial/types";

export type PredictionHorizon = "immediate" | "short" | "medium" | "long";

export type PredictionCategory =
  | "ais-behaviour"
  | "route-deviation"
  | "ownership-churn"
  | "sanctions-proximity"
  | "cargo-anomaly"
  | "compliance-recurrence"
  | "revenue-anomaly";

export type PredictionSeverity = "info" | "watch" | "elevated" | "critical";

export interface PredictionEvidenceCitation {
  readonly evidenceId: string;
  readonly source: string;
  readonly sourceName: string;
  readonly grade: EvidenceGrade;
  readonly observedAt: string;
  readonly excerpt?: string;
}

export interface PredictionFactor {
  /** Human-readable contributing factor (e.g. "3 AIS gaps > 12h in 30d"). */
  readonly label: string;
  /** Signed contribution to probability, in [-1, 1]. */
  readonly weight: number;
  /** Evidence ids that back this factor. */
  readonly evidenceIds: ReadonlyArray<string>;
}

export interface AlternativeHypothesis {
  readonly label: string;
  /** Prior probability that this alternative explains the pattern. */
  readonly probability: number;
  readonly rationale: string;
}

export interface Prediction {
  readonly id: string;
  readonly subject: CanonicalEntityRef;
  readonly category: PredictionCategory;
  /** One-line operational headline. */
  readonly headline: string;
  /** Full explanation the officer can read verbatim. */
  readonly explanation: string;

  /** Model probability that the predicted event materialises. 0..1. */
  readonly probability: number;
  /** Evidence-backed confidence grade (OC-001). */
  readonly confidence: EvidenceGrade;
  readonly severity: PredictionSeverity;
  readonly horizon: PredictionHorizon;

  readonly factors: ReadonlyArray<PredictionFactor>;
  readonly alternatives: ReadonlyArray<AlternativeHypothesis>;
  readonly citations: ReadonlyArray<PredictionEvidenceCitation>;

  /** Baseline snapshot that shaped this prediction (mean/stddev/n). */
  readonly baseline?: {
    readonly metric: string;
    readonly mean: number;
    readonly stddev: number;
    readonly n: number;
    readonly observed: number;
    readonly zScore: number;
  };

  /** True when this prediction crossed the alerting threshold. */
  readonly alert: boolean;
  readonly generatedAt: string;
  /** Revision counter — bumped every time the engine reprocesses. */
  readonly revision: number;
}

export interface PredictionCycle {
  readonly cycleId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly evidenceConsidered: number;
  readonly predictions: ReadonlyArray<Prediction>;
  readonly alerts: ReadonlyArray<Prediction>;
}

export interface DetectorContext {
  readonly now: Date;
  readonly evidence: ReadonlyArray<NormalizedEvidence>;
  readonly evidenceByEntity: ReadonlyMap<string, ReadonlyArray<NormalizedEvidence>>;
  readonly baselines: BaselineStore;
  readonly revision: number;
}

export interface Detector {
  readonly id: PredictionCategory;
  readonly label: string;
  detect(ctx: DetectorContext): ReadonlyArray<Prediction>;
}

export interface BaselineSnapshot {
  readonly mean: number;
  readonly stddev: number;
  readonly n: number;
  readonly min: number;
  readonly max: number;
  readonly lastObserved?: number;
}

export interface BaselineStore {
  observe(key: string, value: number): void;
  snapshot(key: string): BaselineSnapshot | undefined;
  keys(): ReadonlyArray<string>;
}
