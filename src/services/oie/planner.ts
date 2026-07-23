/**
 * OIE · Module 4 — Operational Planner.
 *
 * Selects the right operational skills for an interpreted query. The
 * planner is deterministic (rule-based) — reasoning models never decide
 * WHICH skills run, only how to interpret their results. This keeps
 * the Trust Model intact: the same query fires the same skills.
 */
import { SKILLS } from "./skills-registry";
import type { InterpretedQuery, OperationalPlan, OperationalSkill } from "./types";

const DOMAIN_ALWAYS_ON: OperationalSkill[] = [];

export function planSkills(interpreted: InterpretedQuery): OperationalPlan {
  const relevant = SKILLS.filter((s) => interpreted.domains.includes(s.domain));
  const risk = SKILLS.find((s) => s.id === "risk_scoring");
  const evidence = SKILLS.find((s) => s.id === "evidence_search");
  const picked = new Set<OperationalSkill>([...DOMAIN_ALWAYS_ON, ...relevant]);

  // Assessments and investigations always co-run risk scoring + evidence.
  if (interpreted.intent === "assessment" || interpreted.intent === "investigation") {
    if (risk) picked.add(risk);
    if (evidence) picked.add(evidence);
  }

  // Fall back to a generic dossier when nothing matched.
  if (picked.size === 0) {
    const vessel = SKILLS.find((s) => s.id === "vessel_profile");
    if (vessel) picked.add(vessel);
    if (evidence) picked.add(evidence);
  }

  return {
    interpreted,
    skills: Array.from(picked),
    requiresDecisionSupport:
      interpreted.intent === "assessment" || interpreted.intent === "investigation",
  };
}

/** Capabilities the underlying orchestration scheduler should be biased toward. */
export function planCapabilities(plan: OperationalPlan): string[] {
  return Array.from(new Set(plan.skills.flatMap((s) => s.capabilities)));
}
