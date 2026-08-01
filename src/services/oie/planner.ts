/**
 * OIE · Module 4 — Operational Planner.
 *
 * Deterministic. Given an interpreted query, chooses exactly ONE
 * primary skill (the line of enquiry) plus a small set of supporting
 * skills that provide corroborating evidence. Reasoning providers
 * never decide which skills run — that keeps the Trust Model intact.
 */
import { SKILLS, skillForIntent, findSkill } from "./skills-registry";
import type { InterpretedQuery, OperationalPlan, OperationalSkill } from "./types";

/**
 * Supporting-skill lookup — what other lines of enquiry naturally
 * corroborate the primary one. Keeps the plan focused (≤3 skills).
 */
const SUPPORTING: Record<string, string[]> = {
  manifest_investigation: ["cargo_investigation", "revenue_leakage"],
  cargo_investigation: ["manifest_investigation"],
  vessel_investigation: ["ownership_investigation", "compliance_review"],
  ownership_investigation: ["compliance_review"],
  revenue_leakage: ["manifest_investigation"],
  compliance_review: ["ownership_investigation"],
  voyage_comparison: ["manifest_investigation"],
  executive_briefing: ["vessel_investigation", "revenue_leakage", "compliance_review"],
};

export function planSkills(interpreted: InterpretedQuery): OperationalPlan {
  const primary: OperationalSkill =
    skillForIntent(interpreted.intent) ?? findSkill("executive_briefing") ?? SKILLS[0];

  const supportingIds = SUPPORTING[primary.id] ?? [];
  const supportingSkills = supportingIds
    .map((id) => findSkill(id))
    .filter((s): s is OperationalSkill => Boolean(s))
    .slice(0, 2);

  const capabilities = Array.from(
    new Set([...primary.capabilities, ...supportingSkills.flatMap((s) => s.capabilities)]),
  );

  return {
    interpreted,
    primarySkill: primary,
    supportingSkills,
    capabilities,
    followUps: primary.followUps.slice(0, 4),
  };
}

export function planCapabilities(plan: OperationalPlan): string[] {
  return plan.capabilities;
}
