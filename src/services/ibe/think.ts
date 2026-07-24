/**
 * IBE · Think-before-responding (Phase 2).
 *
 * Runs BEFORE the officer sees any Copilot output. Produces an
 * IbeThought describing what the Copilot believes the officer is
 * trying to accomplish, what is already known, and whether more
 * evidence should be collected. Deterministic; no LLM call.
 */
import type { OIEResult } from "@/services/oie/types";
import type { IbeContext, IbeThought } from "./types";

export function think(
  query: string,
  ctx: IbeContext,
  oie: OIEResult | null,
): IbeThought {
  const mission = ctx.mission;
  const known: string[] = [];
  const missing: string[] = [];

  if (mission?.vessel) known.push("vessel identity");
  if (mission?.voyage) known.push("voyage record");
  if (mission?.port) known.push("port context");
  if ((mission?.companies ?? []).length) known.push("company ownership context");
  if ((mission?.evidence ?? []).length) known.push(`${mission!.evidence.length} evidence records`);

  if (!mission?.vessel && /vessel|imo|mmsi|ship/i.test(query)) missing.push("vessel identity");
  if (/sanction|ofac|un\b|eu\b/i.test(query) && !known.some((k) => k.includes("ownership")))
    missing.push("beneficial ownership");
  if (/revenue|leakage|levy/i.test(query)) missing.push("levy reconciliation");
  if (/ownership|company/i.test(query) && !mission?.companies?.length)
    missing.push("registry ownership chain");

  let canAnswerConfidently = false;
  let mustExplainUncertainty = true;
  let objective = "understand and progress the officer's line of enquiry";

  if (oie?.kind === "briefing") {
    const tier = oie.briefing.confidence_matrix?.tier ?? "low";
    const gaps = oie.humanResponse.informationStillNeeded ?? [];
    canAnswerConfidently = tier === "high" && gaps.length === 0;
    mustExplainUncertainty = tier !== "high" || gaps.length > 0;
    if (oie.plan?.primarySkill?.objective) objective = oie.plan.primarySkill.objective;
    if (gaps.length) missing.push(...gaps);
  } else if (oie?.kind === "clarify") {
    canAnswerConfidently = false;
    mustExplainUncertainty = true;
    objective = "clarify the officer's request before collecting evidence";
  }

  const shouldCollectMore = missing.length > 0 || !canAnswerConfidently;

  const nextRecommendation = shouldCollectMore
    ? missing[0]
      ? `Corroborate ${missing[0]} before treating this as final.`
      : "Continue evidence collection before concluding."
    : "Present the finding and recommend the next officer decision.";

  return {
    objective,
    known: Array.from(new Set(known)),
    missing: Array.from(new Set(missing)),
    shouldCollectMore,
    canAnswerConfidently,
    mustExplainUncertainty,
    nextRecommendation,
  };
}
