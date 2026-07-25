/**
 * Sprint 1G — OSAE Related-Intelligence seam.
 *
 * Aggregates related intelligence for a canonical entity from PIE, NMRSE,
 * Revenue Leakage, and the Investigation Workflows service. OSAE core
 * remains untouched (it is still the sole authority for operational
 * priority); this seam lets Copilot and UI compose the full picture.
 */
import { usePieStore } from "@/services/pie";
import { useRevenueLeakageStore, type LeakageFinding } from "@/services/revenue-leakage";
import { useNmrseStore, type NationalRiskScore } from "@/services/nmrse";
import {
  useInvestigationWorkflowStore,
  type InvestigationCase,
} from "@/services/investigations-workflow";
import type { Prediction } from "@/services/pie";

export interface RelatedIntelligence {
  readonly entityId: string;
  readonly predictions: ReadonlyArray<Prediction>;
  readonly leakageFindings: ReadonlyArray<LeakageFinding>;
  readonly nationalRisk?: NationalRiskScore;
  readonly openCases: ReadonlyArray<InvestigationCase>;
}

export function getRelatedIntelligence(entityId: string): RelatedIntelligence {
  const predictions = usePieStore.getState().forEntity(entityId);
  const leakageFindings = useRevenueLeakageStore
    .getState()
    .findings.filter((f) => f.subjectId === entityId);
  const nationalRisk = useNmrseStore.getState().find(entityId);
  const openCases = useInvestigationWorkflowStore
    .getState()
    .cases.filter((c) => c.subject.id === entityId && c.stage !== "closed");

  return { entityId, predictions, leakageFindings, nationalRisk, openCases };
}
