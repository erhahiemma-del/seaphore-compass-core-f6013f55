/**
 * OIE · Reasoning Provider — server-only runtime.
 *
 * Calls the Lovable AI Gateway to humanize an Assessment into
 * operational-language copy. Providers are pluggable: Gemini and GPT
 * both route through the same OpenAI-compatible gateway; Claude is
 * wired here as a stub that returns `degraded=true` until an Anthropic
 * key is provisioned.
 *
 * Rules:
 *   • Never invent facts — the model only rewrites what the engine gave.
 *   • Return DEGRADED (never throw) when the model is unavailable, so
 *     the OIE can still ship a briefing in observed-language mock mode.
 */
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { Briefing } from "@/services/orchestration";
import { getProviderMeta, type ReasoningProviderId } from "./reasoning-provider";

const HumanCopySchema = z.object({
  situationOverview: z.string(),
  verifiedFacts: z.array(z.string()),
  analyticalAssessment: z.string(),
  keyFindings: z.array(
    z.object({
      priority: z.enum(["critical", "high", "monitor"]),
      text: z.string(),
    }),
  ),
  recommendations: z.array(
    z.object({
      action: z.string(),
      confidence: z.enum(["High Confidence", "Medium Confidence", "Low Confidence", "Insufficient Evidence"]),
      rationale: z.string(),
    }),
  ),
  confidenceExplanation: z.string(),
  operationalImpact: z.string(),
  nextQuestions: z.array(z.string()),
});

export type HumanCopy = z.infer<typeof HumanCopySchema>;

const SYSTEM_PROMPT = [
  "You are the Seaphore Operational Response Generator.",
  "You rewrite an internal assessment into an operational briefing for a maritime officer.",
  "",
  "TRUST MODEL — NON-NEGOTIABLE:",
  "• Separate Verified Facts (only items marked VERIFIED/CORROBORATED in the input) from Analytical Assessments.",
  "• Never invent facts, sources, or numbers not present in the input JSON.",
  "• Never use AI, model, prompt, algorithm, or ML terminology. Use maritime operational language.",
  "• Use observed/reported/assessed verbs — never conclusory (fraud, guilty, criminal).",
  "• Every recommendation carries an explicit confidence badge.",
  "• Officer decides. You observe and recommend.",
  "",
  "Return JSON matching the schema exactly. No prose, no markdown.",
].join("\n");

function buildUserPrompt(briefing: Briefing, missionSummary: string): string {
  return [
    "# Officer query",
    briefing.query,
    "",
    "# Mission context",
    missionSummary || "(none provided)",
    "",
    "# Engine output (source of truth — do not invent beyond this)",
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
  ].join("\n");
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
): Promise<ProviderInvocation> {
  const meta = getProviderMeta(providerId);

  if (!meta.available || !meta.gatewayModel) {
    return {
      copy: null,
      degraded: true,
      providerId,
      reason:
        meta.unavailableReason ??
        `${meta.label} is not available on this deployment.`,
    };
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      copy: null,
      degraded: true,
      providerId,
      reason: "AI Gateway key missing — response degraded to observed-language mode.",
    };
  }

  try {
    const gateway = makeGateway(apiKey);
    const model = gateway(meta.gatewayModel);
    const { output } = await generateText({
      model,
      output: Output.object({ schema: HumanCopySchema }),
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(briefing, missionSummary),
    });
    return { copy: output, degraded: false, providerId };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return {
        copy: null,
        degraded: true,
        providerId,
        reason: "Provider returned malformed output — falling back to observed-language mode.",
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
