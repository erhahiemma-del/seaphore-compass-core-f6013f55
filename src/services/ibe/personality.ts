/**
 * IBE · Adaptive Personality (Phase 8).
 *
 * Reshapes the tone of the executive block without changing the
 * evidence. Never invents facts; it only chooses which parts of the
 * existing HumanResponse to lead with.
 */
import type { HumanResponse } from "@/services/oie/types";
import type { OfficerPersona } from "./types";

export function personaLead(persona: OfficerPersona, hr: HumanResponse): string {
  const exec = hr.executiveSummary?.trim() ?? "";
  const impact = hr.operationalImpact?.trim() ?? "";
  const topFinding = hr.keyFindings?.[0]?.text?.trim() ?? "";
  const topAction = hr.recommendedActions?.[0]?.action?.trim() ?? "";

  switch (persona) {
    case "executive":
      return [exec, topAction && `Recommendation: ${topAction}.`].filter(Boolean).join(" ");
    case "briefing":
      return [exec, impact].filter(Boolean).join(" ");
    case "analyst":
      return [topFinding, impact].filter(Boolean).join(" ");
    case "investigator":
      return [topFinding, hr.confidenceAssessment?.explanation ?? ""].filter(Boolean).join(" ");
    case "trainer":
      return [
        exec,
        "Here's how I got there: I compared what the sources say, weighed corroboration, and flagged what's still open.",
      ]
        .filter(Boolean)
        .join(" ");
    case "operational":
    default:
      return [exec, topFinding && `Key point: ${topFinding}.`].filter(Boolean).join(" ");
  }
}
