/**
 * IBE · Follow-up Intelligence + Initiative (Phases 10, 14, 17).
 *
 * Never close a turn with "Anything else?". Instead propose the next
 * operational move the officer would take.
 */
import type { HumanResponse } from "@/services/oie/types";
import type { IbeContext, IbeHypothesis, IbeThought } from "./types";

export function initiativeCloser(
  ctx: IbeContext,
  thought: IbeThought,
  hypotheses: IbeHypothesis[],
): string {
  if (!thought.canAnswerConfidently && thought.missing.length) {
    return `I would tackle ${thought.missing[0]} next — that closes the biggest gap in this assessment.`;
  }
  const leading = hypotheses.find((h) => h.confidence === "leading" || h.confidence === "credible");
  if (leading && leading.nextEvidenceNeeded[0]) {
    return `On the ${leading.domain} hypothesis, ${leading.nextEvidenceNeeded[0]} is the next piece of evidence I would pull.`;
  }
  if (ctx.stage === "decision_support") {
    return "The case is decision-ready. I can draft the executive briefing whenever you are.";
  }
  if (ctx.stage === "reviewing") {
    return "Ready when you are to walk this through with the director.";
  }
  return "There are a couple of additional investigations worth considering next — say the word and I'll open them.";
}

export function initiativeQuestions(
  ctx: IbeContext,
  thought: IbeThought,
  hypotheses: IbeHypothesis[],
  base: HumanResponse["suggestedNextQuestions"],
): string[] {
  const out: string[] = [];
  if (hypotheses.length) {
    out.push(`Test the ${hypotheses[0].domain} hypothesis against what we have`);
  }
  if (thought.missing[0]) out.push(`Pull ${thought.missing[0]}`);
  if (ctx.stage === "reviewing" || ctx.stage === "decision_support") {
    out.push("Draft the executive briefing");
  }
  for (const q of base ?? []) {
    if (out.length >= 5) break;
    if (!out.includes(q)) out.push(q);
  }
  return out.slice(0, 5);
}
