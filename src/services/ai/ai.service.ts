/**
 * AI Service Layer — client-facing entry point for every model-backed feature.
 *
 * All model calls happen server-side (Lovable AI Gateway, Gemini family) via
 * TanStack Server Functions. This module is the ONLY interface UI code should
 * import for AI capabilities. Concrete providers can be swapped without
 * touching a single feature file.
 */

import { copilotQuery, askCopilot } from "@/services/copilot.service";

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
  /** Confidence tier the model self-reported, mapped to the Confidence Ladder. */
  confidence: "VERIFIED" | "OBSERVED" | "INFERRED" | "UNCONFIRMED";
  citations: Array<{ label: string; ref?: string }>;
  /** Never suppress: HR-1 mandates that unknowns are declared. */
  unknowns: string[];
}

export interface AiService {
  ask(input: AiRequest): Promise<AiResponse>;
}

/**
 * Gemini-backed implementation via the existing Copilot server function.
 * The server function enforces the Honesty Rules and rate limits (HR-2, HR-9,
 * API-3). Swap to another `AiService` implementation to change providers.
 */
class GeminiCopilotService implements AiService {
  async ask(input: AiRequest): Promise<AiResponse> {
    // Prefer the richer copilotQuery contract when available; fall back to askCopilot.
    const raw = (await copilotQuery({
      data: {
        task: input.task,
        prompt: input.prompt,
        context: input.context ?? {},
      },
    }).catch(async () => askCopilot({ data: { prompt: input.prompt } }))) as
      | AiResponse
      | { answer?: string; text?: string; confidence?: AiResponse["confidence"] };

    if (raw && typeof raw === "object" && "text" in raw && typeof raw.text === "string") {
      return {
        text: raw.text,
        confidence: (raw as AiResponse).confidence ?? "INFERRED",
        citations: (raw as AiResponse).citations ?? [],
        unknowns: (raw as AiResponse).unknowns ?? [],
      };
    }

    const answer =
      (raw as { answer?: string; text?: string })?.answer ?? (raw as { text?: string })?.text ?? "";
    return {
      text: answer,
      confidence: "INFERRED",
      citations: [],
      unknowns: answer ? [] : ["The AI service returned no text; treat as UNCONFIRMED."],
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
