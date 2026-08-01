/**
 * Sprint 8 · Reasoning Engine — orchestrator.
 *
 *   request → build prompts → call model (with retries + tier fallback)
 *           → validate JSON → propagate confidence → enforce Layer 2.3
 *           → freeze + return ReasoningResponse
 *
 * The engine has NO database access and NO retrieval logic; it consumes only
 * the FusedEvidenceBundle passed in (Sprint 7).
 */
import type { FusedEvidenceBundle, ScoredEvidence } from "@/services/fusion";
import { LlmResponseSchema, ReasoningResponseSchema, type LlmResponse } from "./contract";
import { anchorFromEvidence, bandOf, propagate, requiresCounterHypothesis } from "./confidence";
import { fallbackChain, type ModelRegistry } from "./model-registry";
import { SYSTEM_PROMPT } from "./system-prompt";
import type {
  CounterHypothesis,
  ModelClient,
  ModelTier,
  ReasoningRequest,
  ReasoningResponse,
} from "./types";
import { workspaceOverlay } from "./workspace-prompts";

const OFFICER_NOTICE =
  "Evidence first. Explainable always. Officer decides. This assessment is advisory; the human officer holds authority for any operational action.";

export interface EngineOptions {
  /** Total attempts per model client (validation retries). Default 3. */
  readonly maxRetries?: number;
  /** How many top evidence items to embed in the user prompt. Default 15. */
  readonly topK?: number;
  /** Optional abort signal. */
  readonly signal?: AbortSignal;
}

/** Extract a top-K evidence view + a compact anchor block for the LLM. */
function buildEvidencePayload(bundle: FusedEvidenceBundle, topK: number) {
  const ranked = bundle.ranked.slice(0, topK).map((e: ScoredEvidence) => ({
    id: e.id,
    agent: e.agent,
    sourceSystem: e.sourceSystem,
    attribute: e.attribute,
    value: e.value,
    unit: e.unit,
    grade: e.grade,
    confidence: e.confidence,
    conflictsWith: e.conflictsWith,
  }));
  const conflicts = bundle.conflicts.map((c) => ({
    attribute: c.attribute,
    entityId: c.entityId,
    a: { id: c.a.id, source: c.a.sourceSystem, value: c.a.value },
    b: { id: c.b.id, source: c.b.sourceSystem, value: c.b.value },
  }));
  return {
    ranked,
    conflicts,
    anchor: anchorFromEvidence(bundle.ranked),
    counts: { total: bundle.ranked.length, shown: ranked.length, conflicts: conflicts.length },
  };
}

function buildUserPrompt(req: ReasoningRequest, topK: number): string {
  const payload = buildEvidencePayload(req.evidence, topK);
  return [
    workspaceOverlay(req.workspace),
    "",
    `Officer query: ${req.query}`,
    req.context?.entityFocus?.length ? `Entity focus: ${req.context.entityFocus.join(", ")}` : "",
    "",
    "Ranked evidence bundle follows. Reason ONLY over these items.",
    "Return a single JSON object matching the Response Contract. No markdown, no prose.",
    "",
    "<evidence>",
    JSON.stringify(payload),
    "</evidence>",
  ]
    .filter(Boolean)
    .join("\n");
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

async function tryParse(text: string): Promise<LlmResponse | null> {
  try {
    const raw = JSON.parse(stripJsonFences(text));
    const parsed = LlmResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Ensure Layer 2.3 counter-hypothesis rule holds — inject a stub if the model skipped it. */
function enforceCounterHypotheses(
  parsed: LlmResponse,
  assessmentConfidence: number,
  bundle: FusedEvidenceBundle,
): readonly CounterHypothesis[] {
  const band = bandOf(assessmentConfidence);
  if (!requiresCounterHypothesis(band)) return parsed.counterHypotheses ?? [];
  if ((parsed.counterHypotheses?.length ?? 0) > 0) return parsed.counterHypotheses;
  const refuters = bundle.ranked
    .slice(0, 3)
    .map((e) => e.id)
    .filter(Boolean);
  return [
    {
      statement:
        "Alternative reading: the observed pattern may reflect benign operational variance rather than the primary assessment.",
      likelihood: 0.3,
      refutingEvidenceIds: refuters,
    },
  ];
}

async function runOnce(
  client: ModelClient,
  system: string,
  user: string,
  signal?: AbortSignal,
  maxRetries = 3,
): Promise<{ parsed: LlmResponse; retries: number }> {
  let lastText = "";
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { text } = await client.complete({ system, user, signal });
    lastText = text;
    const parsed = await tryParse(text);
    if (parsed) return { parsed, retries: attempt };
  }
  throw new Error(
    `Reasoning engine: model ${client.id} produced invalid JSON after ${maxRetries} attempts. Last: ${lastText.slice(0, 200)}`,
  );
}

export async function reason(
  request: ReasoningRequest,
  registry: ModelRegistry,
  opts: EngineOptions = {},
): Promise<ReasoningResponse> {
  const started = Date.now();
  const startTier: ModelTier = request.tier ?? "tier1";
  const chain = fallbackChain(registry, startTier);
  if (chain.length === 0) {
    throw new Error("Reasoning engine: no model clients registered.");
  }

  const topK = opts.topK ?? 15;
  const user = buildUserPrompt(request, topK);
  const maxRetries = opts.maxRetries ?? 3;

  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const client = chain[i];
    try {
      const { parsed, retries } = await runOnce(
        client,
        SYSTEM_PROMPT,
        user,
        opts.signal,
        maxRetries,
      );
      const anchor = anchorFromEvidence(request.evidence.ranked);
      const propagation = propagate(anchor);

      // Clamp/normalise assessment confidence to propagation ladder.
      const rawAssessmentConf = Math.max(0, Math.min(1, parsed.assessment.confidence));
      const boundedAssessment = Math.min(rawAssessmentConf, propagation.assessment);
      const boundedRecommendation = Math.min(
        Math.max(0, Math.min(1, parsed.recommendation.confidence)),
        propagation.recommendation,
      );
      const band = bandOf(boundedAssessment);
      const counters = enforceCounterHypotheses(parsed, boundedAssessment, request.evidence);
      const citations = Array.from(
        new Set([...(parsed.citations ?? []), ...parsed.whyChain.flatMap((s) => s.evidenceIds)]),
      );

      const response: ReasoningResponse = {
        workspace: request.workspace,
        assessment: {
          statement: parsed.assessment.statement,
          confidence: boundedAssessment,
          band,
        },
        recommendation: {
          action: parsed.recommendation.action,
          confidence: boundedRecommendation,
          rationale: parsed.recommendation.rationale,
        },
        whyChain: parsed.whyChain.map((s) => Object.freeze({ ...s })),
        counterHypotheses: counters.map((c) => Object.freeze({ ...c })),
        propagation,
        citations,
        officerNotice: OFFICER_NOTICE,
        model: {
          modelId: client.id,
          tier: client.tier,
          retries,
          durationMs: Date.now() - started,
          usedFallback: i > 0,
        },
      };

      // Final structural check — throws only on our own bug, not model output.
      ReasoningResponseSchema.parse(response);
      return Object.freeze(response);
    } catch (err) {
      lastError = err;
      if (opts.signal?.aborted) throw err;
      // fall through to next tier
    }
  }
  throw new Error(
    `Reasoning engine exhausted all tiers. Last error: ${(lastError as Error)?.message ?? "unknown"}`,
  );
}
