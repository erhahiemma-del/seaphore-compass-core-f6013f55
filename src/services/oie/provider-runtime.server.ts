/**
 * OIE · Reasoning Provider — server-only runtime.
 *
 * Calls the Lovable AI Gateway to humanize an Assessment into the
 * mandated 8-section operational response. Providers are pluggable:
 * Gemini and GPT both route through the same OpenAI-compatible
 * gateway; Claude is wired here as a stub that surfaces
 * `degraded=true` until an Anthropic key is provisioned.
 *
 * Rules:
 *   • Never invent facts. Rewrite only what the engine gave.
 *   • Return DEGRADED (never throw) when the model is unavailable —
 *     the OIE always ships a briefing, using the deterministic fallback.
 */
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { Briefing } from "@/services/orchestration";
import type { OperationalPlan } from "./types";
import { getProviderMeta, type ReasoningProviderId } from "./reasoning-provider";

import type { HumanCopyShape } from "./response-generator";

const HumanCopySchema = z.object({
  executiveSummary: z.string(),
  situationOverview: z.string(),
  keyFindings: z.array(
    z.object({
      priority: z.enum(["critical", "high", "monitor"]),
      text: z.string(),
      /** Evidence IDs from the engine output. Must be present so officers
       *  can trace each Key Finding back to the exact supporting record. */
      citationIds: z.array(z.string()).default([]),
    }),
  ),
  operationalImpact: z.string(),
  recommendedActions: z.array(
    z.object({
      action: z.string(),
      confidence: z.enum([
        "High Confidence",
        "Medium Confidence",
        "Low Confidence",
        "Insufficient Evidence",
      ]),
      rationale: z.string(),
    }),
  ),
  informationStillNeeded: z.array(z.string()),
  suggestedNextQuestions: z.array(z.string()),
  confidenceExplanation: z.string(),
});

/** Runtime shape must match the client-safe HumanCopyShape exactly. */
export type HumanCopy = HumanCopyShape;
// Compile-time cross-check — the schema output must extend the shared shape.
type _AssertHumanCopy = z.infer<typeof HumanCopySchema> extends HumanCopyShape ? true : never;
const _assertHumanCopy: _AssertHumanCopy = true;
void _assertHumanCopy;

const SYSTEM_PROMPT = [
  "You are the Seaphore Operational Response Generator, writing on behalf of a Nigerian Maritime Administration and Safety Agency (NIMASA) intelligence officer.",
  "You do NOT introduce yourself. You are the voice of the operational team.",
  "",
  "TONE — non-negotiable:",
  "  Use: 'Our assessment indicates…', 'The available evidence shows…', 'We recommend…', 'This requires further verification…'.",
  "  Never use: 'Based on my analysis…', 'I think…', 'The AI model suggests…', 'As a large language model…'.",
  "  Never mention AI, model, prompt, algorithm, ML, temperature, tokens.",
  "  Never expose JSON, code, or internal reasoning to the officer.",
  "",
  "TRUST MODEL — non-negotiable:",
  "  • Separate verified facts (VERIFIED or CORROBORATED evidence only) from analytical assessments.",
  "  • Never invent facts, numbers, sources, or entity names not present in the engine output.",
  "  • Never use conclusory or criminal language (fraud, guilty, criminal).",
  "  • Every recommendation carries an explicit confidence badge from the allowed set.",
  "  • Officer decides. We observe and recommend.",
  "",
  "STRUCTURE — the response ALWAYS has these 8 sections:",
  "  1. Executive Summary — 2–3 crisp sentences that a director can read alone.",
  "  2. Situation Overview — what we are looking at and why it matters.",
  "  3. Key Findings — priority-ordered bullets. Each finding MUST include `citationIds` — one or more evidence `id` values copied verbatim from the engine output's `critical_findings[].citations[].id`. Never invent an id. If no evidence supports a claim, omit the claim.",
  "  4. Operational Impact — what happens if we act / do not act.",
  "  5. Recommended Actions — each with a confidence badge and rationale.",
  "  6. Information Still Needed — intelligence gaps we cannot close from current evidence.",
  "  7. Suggested Next Questions — 3–4 operational follow-ups.",
  "  8. Confidence Explanation — plain-language reason for the overall confidence.",
  "",
  "Return the JSON matching the schema exactly. Do not include markdown or prose outside the JSON.",
].join("\n");

function buildUserPrompt(
  briefing: Briefing,
  missionSummary: string,
  plan: OperationalPlan,
): string {
  return [
    "# Officer query",
    briefing.query,
    "",
    "# Investigation type",
    `${plan.primarySkill.label} — ${plan.primarySkill.objective}`,
    plan.supportingSkills.length > 0
      ? `Supporting lines of enquiry: ${plan.supportingSkills.map((s) => s.label).join(", ")}.`
      : "",
    "",
    "# Adaptive follow-ups the officer will likely want next",
    ...plan.followUps.map((f) => `- ${f}`),
    "",
    "# Mission context",
    missionSummary || "(none provided)",
    "",
    "# Engine output (source of truth — do NOT invent beyond this)",
    JSON.stringify({
      mode: briefing.mode,
      classification: briefing.classification,
      sections: briefing.sections,
      sources: {
        queried: briefing.sources_queried,
        responded: briefing.sources_responded,
        corroborated: briefing.sources_corroborated,
      },
      confidence: briefing.confidence_matrix,
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ProviderInvocation {
  copy: HumanCopy | null;
  degraded: boolean;
  providerId: ReasoningProviderId;
  reason?: string;
}

function makeGateway(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: true,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export async function invokeReasoningProvider(
  providerId: ReasoningProviderId,
  briefing: Briefing,
  missionSummary: string,
  plan: OperationalPlan,
): Promise<ProviderInvocation> {
  const meta = getProviderMeta(providerId);

  if (!meta.available || !meta.gatewayModel) {
    return {
      copy: null,
      degraded: true,
      providerId,
      reason: meta.unavailableReason ?? `${meta.label} is not available on this deployment.`,
    };
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      copy: null,
      degraded: true,
      providerId,
      reason: "Intelligence gateway offline — response using cached evidence only.",
    };
  }

  try {
    const gateway = makeGateway(apiKey);
    const model = gateway(meta.gatewayModel);
    const { output } = await generateText({
      model,
      output: Output.object({ schema: HumanCopySchema }),
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(briefing, missionSummary, plan),
    });
    return { copy: output, degraded: false, providerId };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return {
        copy: null,
        degraded: true,
        providerId,
        reason: "Response degraded — falling back to structured briefing.",
      };
    }
    return {
      copy: null,
      degraded: true,
      providerId,
      reason: err instanceof Error ? err.message : "Unknown provider error.",
    };
  }
}
