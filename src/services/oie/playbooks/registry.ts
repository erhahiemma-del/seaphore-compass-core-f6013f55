/**
 * OIE · Playbook Registry.
 *
 * Extensibility: adding a new Operational Skill playbook is a single
 * import + entry here. No changes to the OIE pipeline are required.
 */
import { manifestInvestigationPlaybook } from "./manifest-investigation";
import { cargoInvestigationPlaybook } from "./cargo-investigation";
import { vesselRiskAssessmentPlaybook } from "./vessel-risk-assessment";
import { revenueLeakagePlaybook } from "./revenue-leakage";
import { ownershipInvestigationPlaybook } from "./ownership-investigation";
import { complianceReviewPlaybook } from "./compliance-review";
import { voyageComparisonPlaybook } from "./voyage-comparison";
import { portIntelligencePlaybook } from "./port-intelligence";
import { executiveBriefingPlaybook } from "./executive-briefing";
import type { Playbook } from "./types";

export const PLAYBOOKS: readonly Playbook[] = Object.freeze([
  manifestInvestigationPlaybook,
  cargoInvestigationPlaybook,
  vesselRiskAssessmentPlaybook,
  revenueLeakagePlaybook,
  ownershipInvestigationPlaybook,
  complianceReviewPlaybook,
  voyageComparisonPlaybook,
  portIntelligencePlaybook,
  executiveBriefingPlaybook,
]);

const BY_ID = new Map(PLAYBOOKS.map((p) => [p.skillId, p]));

export function findPlaybook(skillId: string | undefined): Playbook | undefined {
  if (!skillId) return undefined;
  return BY_ID.get(skillId);
}

export function listPlaybooks(): readonly Playbook[] {
  return PLAYBOOKS;
}
