/**
 * Sprint 1G — OSAE Related-Intelligence seam.
 *
 * Aggregates related intelligence for a canonical entity from PIE, NMRSE,
 * Revenue Leakage, and the Investigation Workflows service. OSAE core
 * remains untouched (it is still the sole authority for operational
 * priority); this seam lets Copilot and UI compose the full picture.
 *
 * Operational-Runtime consumer surface: when the caller passes a Canonical
 * UIP id, OSAE resolves the UIP via the client-side `getUip` contract and
 * projects the OSAE assessment carried on that UIP alongside the related
 * intelligence — so every OSAE-facing surface reads through the same
 * `getUip(source_uip_id)` contract every other operational consumer uses.
 */
import { usePieStore } from "@/services/pie";
import { useRevenueLeakageStore, type LeakageFinding } from "@/services/revenue-leakage";
import { useNmrseStore, type NationalRiskScore } from "@/services/nmrse";
import {
  useInvestigationWorkflowStore,
  type InvestigationCase,
} from "@/services/investigations-workflow";
import type { Prediction } from "@/services/pie";
import { getUip } from "@/stores/uip.store";
import type { OsaeAssessment } from "./index";

export interface RelatedIntelligence {
  readonly entityId: string;
  readonly predictions: ReadonlyArray<Prediction>;
  readonly leakageFindings: ReadonlyArray<LeakageFinding>;
  readonly nationalRisk?: NationalRiskScore;
  readonly openCases: ReadonlyArray<InvestigationCase>;
  /** Canonical UIP id the caller sourced this query from, if any. */
  readonly sourceUipId?: string;
  /** OSAE assessment attached to that UIP for this entity, if resolvable. */
  readonly osae?: OsaeAssessment;
}

export function getRelatedIntelligence(
  entityId: string,
  sourceUipId?: string | null,
): RelatedIntelligence {
  const predictions = usePieStore.getState().forEntity(entityId);
  const leakageFindings = useRevenueLeakageStore
    .getState()
    .findings.filter((f) => f.subjectId === entityId);
  const nationalRisk = useNmrseStore.getState().find(entityId);
  const openCases = useInvestigationWorkflowStore
    .getState()
    .cases.filter((c) => c.subject.id === entityId && c.stage !== "closed");

  // Operational-Runtime consumer read: resolve the Canonical UIP and
  // project its per-entity OSAE assessment. No direct connector or raw
  // evidence access.
  const uip = getUip(sourceUipId ?? undefined);
  const osae = uip?.osae.find((o) => o.entityId === entityId)?.assessment;

  return {
    entityId,
    predictions,
    leakageFindings,
    nationalRisk,
    openCases,
    sourceUipId: sourceUipId ?? undefined,
    osae,
  };
}
