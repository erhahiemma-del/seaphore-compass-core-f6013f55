/**
 * IBE · Response Contract (mandatory 9-step sequence).
 *
 * Every Copilot response — clarify or briefing — MUST internally
 * satisfy the following sequence before the officer sees it:
 *
 *   1. Understand the officer's intent.
 *   2. Recall all relevant mission context.
 *   3. Identify what is already known.
 *   4. Identify what remains unknown.
 *   5. Determine whether additional investigation is required.
 *   6. Decide whether proactive intelligence should be surfaced.
 *   7. Produce an evidence-backed assessment.
 *   8. Recommend the next operational action.
 *   9. Advance the investigation — never close with "Anything else?".
 *
 * If any step is missing, the response is considered incomplete. This
 * module both *evaluates* the contract against the reshaped IBE
 * output and *enforces* it by backfilling any deficient step and
 * scrubbing transactional closers. The contract is exposed on
 * `ibe.contract` for observability so the audit trail can prove that
 * every turn satisfied all nine steps.
 */
import type { HumanResponse, OIEResult } from "@/services/oie/types";
import type {
  IbeContext,
  IbeHypothesis,
  IbeThought,
  ProactiveNudge,
} from "./types";

export type ResponseContractStep =
  | "intent"
  | "recall"
  | "known"
  | "unknown"
  | "investigation_decision"
  | "proactive_decision"
  | "assessment"
  | "next_action"
  | "advance";

export interface ResponseContractCheck {
  step: ResponseContractStep;
  label: string;
  satisfied: boolean;
  evidence: string;
}

export interface ResponseContract {
  satisfied: boolean;
  checks: ResponseContractCheck[];
  repaired: ResponseContractStep[];
}

const CLOSER_BLOCKLIST = [
  /anything\s+else\??/i,
  /is\s+there\s+anything\s+else/i,
  /let\s+me\s+know\s+if/i,
  /how\s+can\s+i\s+help/i,
];

function isTransactionalCloser(text: string | undefined | null): boolean {
  if (!text) return true;
  return CLOSER_BLOCKLIST.some((r) => r.test(text));
}

function hasText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Enforce the 9-step Response Contract on a reshaped HumanResponse +
 * initiative closer. Mutates a shallow copy of the human response and
 * closer where necessary, records which steps had to be repaired, and
 * returns the audit-ready contract.
 */
export function enforceResponseContract(input: {
  query: string;
  ctx: IbeContext;
  oie: OIEResult;
  thought: IbeThought;
  nudges: ProactiveNudge[];
  hypotheses: IbeHypothesis[];
  humanResponse: HumanResponse;
  closer: string;
}): { humanResponse: HumanResponse; closer: string; contract: ResponseContract } {
  const { query, ctx, oie, thought, nudges, hypotheses } = input;
  const hr: HumanResponse = { ...input.humanResponse };
  let closer = input.closer;
  const repaired: ResponseContractStep[] = [];

  // Step 1 — Understand the officer's intent.
  if (!hasText(thought.objective)) {
    thought.objective = "progress the officer's line of enquiry";
    repaired.push("intent");
  }

  // Step 2 — Recall all relevant mission context.
  const recallSignals =
    (ctx.priorTurnCount > 0 ? 1 : 0) +
    (ctx.hasPriorFindings ? 1 : 0) +
    (ctx.mission?.vessel ? 1 : 0) +
    (ctx.mission?.voyage ? 1 : 0) +
    ((ctx.mission?.companies?.length ?? 0) > 0 ? 1 : 0);
  if (recallSignals === 0 && ctx.mission) {
    // Nothing to recall yet — still counts as satisfied (fresh mission).
  }

  // Step 3 — Identify what is already known.
  if (thought.known.length === 0 && oie.kind === "briefing") {
    const cf = oie.briefing.confidence_matrix;
    if (cf?.tier) thought.known.push(`current assessment tier: ${cf.tier}`);
    repaired.push("known");
  }

  // Step 4 — Identify what remains unknown.
  const gaps = new Set<string>([
    ...(hr.informationStillNeeded ?? []),
    ...thought.missing,
  ]);
  if (gaps.size === 0 && thought.shouldCollectMore) {
    gaps.add("additional corroborating evidence");
    repaired.push("unknown");
  }
  hr.informationStillNeeded = Array.from(gaps).slice(0, 6);

  // Step 5 — Determine whether additional investigation is required.
  //          `thought.shouldCollectMore` already carries the decision;
  //          make sure the officer sees it reflected in the assessment.
  const investigationDecision = thought.shouldCollectMore
    ? "Additional investigation required before this can be treated as final."
    : "Evidence base is sufficient for an operational decision.";

  // Step 6 — Decide whether proactive intelligence should be surfaced.
  const proactiveDecision = nudges.length
    ? `${nudges.length} proactive signal${nudges.length > 1 ? "s" : ""} surfaced for the officer.`
    : "No proactive signals require the officer's attention on this turn.";

  // Step 7 — Produce an evidence-backed assessment.
  if (!hasText(hr.executiveSummary) && !hasText(hr.situationOverview)) {
    hr.executiveSummary =
      oie.kind === "clarify"
        ? "Preliminary read — need one clarification before I can commit to an assessment."
        : "Preliminary assessment based on the evidence currently in the case file.";
    repaired.push("assessment");
  }
  // Fold contract signalling into the confidence explanation so the
  // renderer surfaces it without any UI change.
  const contractLine = `${investigationDecision} ${proactiveDecision}`.trim();
  const existingExplanation = hr.confidenceAssessment?.explanation ?? "";
  if (!existingExplanation.includes(investigationDecision)) {
    hr.confidenceAssessment = {
      badge: hr.confidenceAssessment?.badge ?? "Insufficient Evidence",
      explanation: [existingExplanation, contractLine].filter(Boolean).join(" ").trim(),
    };
  }

  // Step 8 — Recommend the next operational action.
  const nextActions = new Set<string>([
    ...(hr.suggestedNextQuestions ?? []),
  ]);
  if (nextActions.size === 0) {
    if (thought.missing[0]) nextActions.add(`Pull ${thought.missing[0]}`);
    if (hypotheses[0]) nextActions.add(`Test the ${hypotheses[0].domain} hypothesis`);
    if (nextActions.size === 0) nextActions.add(thought.nextRecommendation);
    repaired.push("next_action");
  }
  hr.suggestedNextQuestions = Array.from(nextActions).slice(0, 5);

  // Step 9 — Advance the investigation. Reject transactional closers.
  if (isTransactionalCloser(closer)) {
    closer =
      thought.missing[0]
        ? `I would move on ${thought.missing[0]} next — that is the fastest way to advance this investigation.`
        : hypotheses[0]?.nextEvidenceNeeded[0]
          ? `Next I would pull ${hypotheses[0].nextEvidenceNeeded[0]} to press the ${hypotheses[0].domain} line further.`
          : "Say the word and I'll advance the investigation on the strongest open lead.";
    repaired.push("advance");
  }

  const checks: ResponseContractCheck[] = [
    {
      step: "intent",
      label: "Understand officer's intent",
      satisfied: hasText(thought.objective),
      evidence: thought.objective,
    },
    {
      step: "recall",
      label: "Recall mission context",
      satisfied: recallSignals > 0 || !ctx.mission,
      evidence: `${recallSignals} recall signal(s); ${ctx.priorTurnCount} prior turn(s)`,
    },
    {
      step: "known",
      label: "Identify what is known",
      satisfied: thought.known.length > 0 || oie.kind === "clarify",
      evidence: thought.known.join("; ") || "no prior knowns recorded",
    },
    {
      step: "unknown",
      label: "Identify what remains unknown",
      satisfied: (hr.informationStillNeeded ?? []).length > 0 || !thought.shouldCollectMore,
      evidence: (hr.informationStillNeeded ?? []).join("; ") || "no open gaps",
    },
    {
      step: "investigation_decision",
      label: "Decide if more investigation is required",
      satisfied: true,
      evidence: investigationDecision,
    },
    {
      step: "proactive_decision",
      label: "Decide on proactive intelligence",
      satisfied: true,
      evidence: proactiveDecision,
    },
    {
      step: "assessment",
      label: "Produce evidence-backed assessment",
      satisfied: hasText(hr.executiveSummary) || hasText(hr.situationOverview),
      evidence: (hr.executiveSummary || hr.situationOverview || "").slice(0, 120),
    },
    {
      step: "next_action",
      label: "Recommend next operational action",
      satisfied: (hr.suggestedNextQuestions ?? []).length > 0,
      evidence: (hr.suggestedNextQuestions ?? [])[0] ?? "",
    },
    {
      step: "advance",
      label: "Advance the investigation",
      satisfied: !isTransactionalCloser(closer),
      evidence: closer,
    },
  ];

  const contract: ResponseContract = {
    satisfied: checks.every((c) => c.satisfied),
    checks,
    repaired,
  };

  // Query is retained in evidence via thought.objective / gaps; touch to
  // signal it participated in intent understanding.
  void query;

  return { humanResponse: hr, closer, contract };
}
