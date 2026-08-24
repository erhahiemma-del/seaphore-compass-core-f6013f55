/**
 * AI Service Layer — client-facing entry point for every model-backed feature.
 *
 * All model calls happen server-side (Lovable AI Gateway) via TanStack
 * Server Functions. This module is the ONLY interface UI code should import
 * for AI capabilities. Concrete providers can be swapped without touching a
 * single feature file.
 */

import { askCopilot } from "@/lib/ai/copilot.functions";

export type AiTaskKind =
  | "summarize"
  | "explain-signal"
  | "recommend-action"
  | "draft-briefing"
  | "extract-entities";

export interface AiRequest {
  task: AiTaskKind;
  prompt: string;
  context?: Record<string, unknown>;
}

export interface AiResponse {
  text: string;
  /** Confidence tier mapped to the Confidence Ladder. */
  confidence: "VERIFIED" | "OBSERVED" | "INFERRED" | "UNCONFIRMED";
  citations: Array<{ label: string; ref?: string }>;
  /** Never suppress: HR-1 mandates that unknowns are declared. */
  unknowns: string[];
}

export interface AiService {
  ask(input: AiRequest): Promise<AiResponse>;
}

/** Lovable AI Gateway implementation via the Copilot server function. */
class GeminiCopilotService implements AiService {
  async ask(input: AiRequest): Promise<AiResponse> {
    const raw = (await askCopilot({ data: { prompt: input.prompt } })) as unknown as {
      answer?: string;
      text?: string;
      confidence?: string;
      citations?: AiResponse["citations"];
      unknowns?: string[];
    };
    const answer = raw?.answer ?? raw?.text ?? "";
    const confMap: Record<string, AiResponse["confidence"]> = {
      verified: "VERIFIED",
      observed: "OBSERVED",
      inferred: "INFERRED",
      unconfirmed: "UNCONFIRMED",
      VERIFIED: "VERIFIED",
      OBSERVED: "OBSERVED",
      INFERRED: "INFERRED",
      UNCONFIRMED: "UNCONFIRMED",
    };
    return {
      text: answer,
      confidence: confMap[raw?.confidence ?? ""] ?? "INFERRED",
      citations: raw?.citations ?? [],
      unknowns:
        raw?.unknowns ?? (answer ? [] : ["The AI service returned no text; treat as UNCONFIRMED."]),
    };
  }
}

let activeService: AiService = new GeminiCopilotService();

export function getAiService(): AiService {
  return activeService;
}

/** Swap the active AI service (tests, feature flags, alternate model families). */
export function setAiService(next: AiService): void {
  activeService = next;
}
