/**
 * IBE · Mission Awareness (Phase 1).
 *
 * Never treat a message as independent. Before OIE runs and after it
 * returns, IBE reads the persistent Mission Context to know which
 * investigation, vessel, port and companies are already in play and
 * what has already been said.
 */
import type { MissionContext } from "@/stores/mission-context.store";
import type { InvestigationStage, OfficerPersona } from "./types";

const OFFICER_HISTORY_LOOKBACK = 6;

/** Persona inference — coarse, purely behavioural, never gated. */
export function inferPersona(mission: MissionContext | null): OfficerPersona {
  if (!mission) return "operational";
  const convo = mission.conversation ?? [];
  const officerText = convo
    .filter((c) => c.role === "officer")
    .slice(-OFFICER_HISTORY_LOOKBACK)
    .map((c) => c.text.toLowerCase())
    .join(" ");

  if (/\bbrief(ing)?\b/.test(officerText) && /(director|dg|minister)/.test(officerText))
    return "executive";
  if (/\b(evidence|raw|source|dataset|confidence|matrix|hash)\b/.test(officerText))
    return "analyst";
  if (/\b(hypothes|corroborat|contradict|refute|investigat)/.test(officerText))
    return "investigator";
  if (/\b(explain|teach|why|how does|training)\b/.test(officerText)) return "trainer";
  if (/\b(executive|board|leadership|summary)\b/.test(officerText)) return "briefing";
  return "operational";
}

/**
 * Investigation stage — coarse inference from the current mission
 * state. IBE uses this to know whether it should still be collecting
 * or already summarising.
 */
export function inferInvestigationStage(mission: MissionContext | null): InvestigationStage {
  if (!mission) return "planning";
  if ((mission.decisions ?? []).length > 0) return "completed";
  if ((mission.nextActions ?? []).length > 0) return "decision_support";
  const evCount = (mission.evidence ?? []).length;
  const hypoCount = (mission.hypotheses ?? []).length;
  if (hypoCount > 0 && evCount >= 3) return "reviewing";
  if (hypoCount > 0) return "validating";
  if (evCount > 0) return "correlating";
  const convoCount = (mission.conversation ?? []).length;
  if (convoCount > 0) return "collecting";
  return "planning";
}

/** Human-readable label for the current stage (used in coaching copy). */
export const STAGE_LABEL: Record<InvestigationStage, string> = {
  planning: "planning the investigation",
  collecting: "collecting evidence",
  correlating: "correlating what we have",
  validating: "validating the working hypothesis",
  reviewing: "reviewing the case",
  decision_support: "preparing the decision",
  completed: "closed",
};
