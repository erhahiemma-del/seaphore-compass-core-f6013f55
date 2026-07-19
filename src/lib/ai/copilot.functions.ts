/**
 * Copilot ask server function.
 *
 * Executes a natural-language Copilot query end-to-end:
 *   1) Classifies the mode (SEARCH / RETRIEVE / INTERPRET / ADVISE)
 *   2) Retrieves mock intelligence context for the instance
 *   3) Asks Gemini (via Lovable AI Gateway) to produce a summary in
 *      observed language, when LOVABLE_API_KEY is present
 *   4) Falls back to deterministic mock intelligence otherwise
 *   5) Always returns a CopilotResponse with confidence + evidence
 *
 * Honesty rules enforced in the system prompt (COP-1..7, HR-3, HR-11):
 *   • Observed language only — never conclusive
 *   • Every response carries a confidence tier
 *   • Insufficient evidence must be stated, never guessed
 *   • Never claim fraud, guilt, or criminal intent
 */
import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { COPILOT_REGISTRY, type CopilotInstance } from "./copilots";
import { classifyMode, extractEntities } from "./nlq";
import { MOCK_INTELLIGENCE } from "./mock-intelligence";
import { createGateway, DEFAULT_COPILOT_MODEL } from "./ai-gateway.server";
import type { AskCopilotInput, CopilotMode, CopilotResponse } from "./types";

const InputSchema = z.object({
  instance: z.enum([
    "seaphore",
    "manifest",
    "cargo",
    "revenue",
    "memory",
    "vessel",
    "ports",
    "ownership",
    "compliance",
    "evidence",
    "alerts",
    "administration",
  ]),
  query: z.string().min(1).max(500),
  mode: z.enum(["SEARCH", "RETRIEVE", "INTERPRET", "ADVISE"]).optional(),
  context: z.record(z.string(), z.string()).optional(),
}) satisfies z.ZodType<AskCopilotInput>;

/** Constraint-free schema — limits stated in the prompt, clamped in code. */
const ModelOutput = z.object({
  summary: z.string(),
  confidence: z.enum(["verified", "observed", "inferred", "unconfirmed"]),
  insufficientEvidence: z.boolean(),
  followUps: z.array(z.string()),
});

function buildSystemPrompt(inst: CopilotInstance, mode: CopilotMode): string {
  return [
    `You are ${inst.name}, a Seaphore Copilot for ${inst.domain}.`,
    inst.scope,
    "",
    "SEAPHORE HONESTY RULES — NON-NEGOTIABLE:",
    "• Use observed language: 'Spike observed in ...', not 'X increased'. You observe; the officer concludes.",
    "• Never say you 'found fraud', 'confirmed guilt', or use any conclusory / criminal language.",
    "• Every response carries a confidence tier: verified | observed | inferred | unconfirmed.",
    "• When evidence is insufficient, set insufficientEvidence=true and say so plainly. Do NOT guess.",
    "• Never take an action autonomously. Surface, explain, route.",
    "",
    `Active mode: ${mode}. Answer the officer's question in one short paragraph (max 3 sentences).`,
    "Return followUps as 2-4 short next-question chips (max 60 chars each).",
  ].join("\n");
}

function buildContextBlock(instance: CopilotInstance, query: string): string {
  const bundle = MOCK_INTELLIGENCE[instance.key];
  const lines = [
    `# Officer query`,
    query,
    "",
    `# Observed intelligence (mock retrieval)`,
    ...bundle.observations.map((o) => `- (${o.confidence.toUpperCase()}) ${o.text}`),
    "",
    `# Historical similarities`,
    ...bundle.historical.map(
      (h) => `- ${h.caseRef} (${h.matchPct}% match): ${h.summary} — ${h.outcome}`,
    ),
  ];
  return lines.join("\n");
}

const emptyResult = (
  input: AskCopilotInput,
  mode: CopilotMode,
  started: number,
): CopilotResponse => {
  const bundle = MOCK_INTELLIGENCE[input.instance];
  return {
    instance: input.instance,
    mode,
    query: input.query,
    summary:
      "Insufficient evidence observed to answer this reliably. Refine the question or route to the relevant workspace.",
    confidence: "unconfirmed",
    insufficientEvidence: true,
    observations: bundle.observations,
    recommendations: bundle.recommendations,
    historical: bundle.historical,
    related: bundle.related,
    followUps: [
      "Narrow to a vessel or company",
      "Show today's alerts",
      "Explain today's revenue at risk",
    ],
    served: "mock",
    latencyMs: Date.now() - started,
  };
};

const clamp = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

export const askCopilot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<CopilotResponse> => {
    const started = Date.now();
    const inst = COPILOT_REGISTRY[data.instance];
    const mode = data.mode ?? classifyMode(data.query);
    const bundle = MOCK_INTELLIGENCE[data.instance];
    // Entity extraction is available for future retrieval routing.
    extractEntities(data.query);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      // Mock-only fallback (still honesty-compliant).
      return {
        instance: data.instance,
        mode,
        query: data.query,
        summary: `Observed ${bundle.observations.length} signal${bundle.observations.length === 1 ? "" : "s"} relevant to your question in ${inst.domain}. Review the evidence below; the decision remains yours.`,
        confidence: bundle.observations[0]?.confidence ?? "unconfirmed",
        insufficientEvidence: bundle.observations.length === 0,
        observations: bundle.observations,
        recommendations: bundle.recommendations,
        historical: bundle.historical,
        related: bundle.related,
        followUps: inst.exampleQueries.slice(0, 3),
        served: "mock",
        latencyMs: Date.now() - started,
      };
    }

    try {
      const gateway = createGateway(key);
      const model = gateway(DEFAULT_COPILOT_MODEL);
      const { output } = await generateText({
        model,
        output: Output.object({ schema: ModelOutput }),
        system: buildSystemPrompt(inst, mode),
        prompt: buildContextBlock(inst, data.query),
      });
      const followUps = (output.followUps ?? []).slice(0, 4).map((f) => clamp(f, 60));
      return {
        instance: data.instance,
        mode,
        query: data.query,
        summary: clamp(output.summary, 600),
        confidence: output.confidence,
        insufficientEvidence: output.insufficientEvidence,
        observations: bundle.observations,
        recommendations: bundle.recommendations,
        historical: bundle.historical,
        related: bundle.related,
        followUps: followUps.length > 0 ? followUps : inst.exampleQueries.slice(0, 3),
        served: "gemini",
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      // Degrade rather than crash the server function.
      if (NoObjectGeneratedError.isInstance(error)) {
        return emptyResult(data, mode, started);
      }
      console.error("askCopilot failed:", error);
      return emptyResult(data, mode, started);
    }
  });
