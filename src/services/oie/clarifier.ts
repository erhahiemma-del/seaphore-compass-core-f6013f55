/**
 * OIE · Clarifier.
 *
 * When the interpreter cannot commit to an operational intent — most
 * commonly a bare entity mention like "Tell me about Ocean Pearl" —
 * the OIE stops and asks the officer to pick a line of enquiry. The
 * options are drawn from the Operational Skills Registry so every
 * clarification pathway leads back into a real skill.
 */
import { SKILLS } from "./skills-registry";
import type { Clarification, EntityMention, InterpretedQuery, OperationalSkill } from "./types";

const CLARIFICATION_ORDER: string[] = [
  "manifest_investigation",
  "cargo_investigation",
  "ownership_investigation",
  "compliance_review",
  "voyage_comparison",
  "revenue_leakage",
  "executive_briefing",
];

function labelFor(skill: OperationalSkill, subject: string | undefined): string {
  if (!subject) return skill.label;
  // "Manifest Investigation" → "Manifest" when addressing an entity.
  return skill.label.replace(/\s+Investigation$/i, "").replace(/\s+Review$/i, " Review");
}

export function needsClarification(interpreted: InterpretedQuery): boolean {
  return interpreted.ambiguous;
}

export function buildClarification(interpreted: InterpretedQuery): Clarification {
  const subjectEntity: EntityMention | undefined =
    interpreted.entities.find((e) => e.type === "vessel" || e.type === "company" || e.type === "imo") ??
    interpreted.anchor;
  const subject = subjectEntity?.value;

  const options: Array<{ id: string; label: string; hint?: string }> = [];
  for (const id of CLARIFICATION_ORDER) {
    const skill = SKILLS.find((s) => s.id === id);
    if (!skill) continue;
    options.push({
      id: skill.id,
      label: labelFor(skill, subject),
      hint: skill.description,
    });
  }

  const question = subject
    ? `What would you like to review on ${subject}?`
    : "What line of enquiry should we open?";

  return { question, options, anchor: subjectEntity };
}
