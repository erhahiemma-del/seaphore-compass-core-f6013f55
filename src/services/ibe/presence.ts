/**
 * IBE · Conversational Presence + Natural Dialogue (Phases 4, 5, 12, 13).
 *
 * Turns the OIE HumanResponse into copy that reads like a senior
 * intelligence officer speaking to a colleague. No percentages, no
 * "pipeline", "connector", "capability", "confidence 20%".
 */
import type { HumanResponse } from "@/services/oie/types";
import type { IbeContext, IbeThought } from "./types";
import { STAGE_LABEL } from "./mission-awareness";

const BADGE_PHRASE: Record<HumanResponse["confidenceAssessment"]["badge"], string> = {
  "High Confidence": "I'm confident in this",
  "Medium Confidence": "I'd treat this as a working assessment, not a final one",
  "Low Confidence": "I'd treat this as preliminary until we corroborate further",
  "Insufficient Evidence": "I don't have enough to commit to a position yet",
};

export function acknowledgement(ctx: IbeContext, thought: IbeThought): string | null {
  if (ctx.priorTurnCount === 0) return null;
  const bits: string[] = [];
  if (ctx.hasPriorFindings) bits.push("Picking up from what we already established");
  else bits.push("Continuing from where we left off");
  if (ctx.stage !== "planning") bits.push(`we're currently ${STAGE_LABEL[ctx.stage]}`);
  if (thought.known.length) bits.push(`with ${thought.known.slice(0, 2).join(" and ")} in hand`);
  return bits.join(", ") + ".";
}

/** Replace percentage-heavy confidence text with an operational sentence. */
export function naturaliseConfidence(hr: HumanResponse, thought: IbeThought): string {
  const badge = hr.confidenceAssessment?.badge ?? "Insufficient Evidence";
  const lead = BADGE_PHRASE[badge];
  const parts: string[] = [`${lead}.`];
  if (thought.missing.length > 0) {
    parts.push(`What's still open: ${thought.missing.slice(0, 3).join(", ")}.`);
  }
  if (thought.mustExplainUncertainty && !thought.canAnswerConfidently) {
    parts.push(
      thought.missing.length
        ? "Closing those gaps would let me commit to a firmer view."
        : "Additional corroboration would let me commit to a firmer view.",
    );
  }
  return parts.join(" ");
}

/**
 * Coaching lines injected as monitor-priority key findings. Behave like
 * a mentor rather than a data reporter (Phase 9).
 */
export function coachingLines(ctx: IbeContext, thought: IbeThought): string[] {
  const out: string[] = [];
  if (thought.missing.includes("beneficial ownership")) {
    out.push(
      "I'd want beneficial ownership confirmed before signing off on a sanctions clearance — layered ownership is where exposure usually hides.",
    );
  }
  if (thought.missing.includes("levy reconciliation")) {
    out.push(
      "For revenue questions, reconcile the declared levy against the observed cargo before treating any leakage estimate as final.",
    );
  }
  if (ctx.stage === "collecting" && thought.shouldCollectMore) {
    out.push(
      "We're still in evidence collection — treat working conclusions as directional, not decisions.",
    );
  }
  if (ctx.stage === "reviewing" && thought.canAnswerConfidently) {
    out.push(
      "The case looks ready for decision review — I'd walk the director through this rather than gather more.",
    );
  }
  return out;
}
