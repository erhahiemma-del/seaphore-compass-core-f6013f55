/**
 * Lovable AI Gateway provider — server-only.
 *
 * The Copilot engine uses this to call Gemini through the Lovable AI
 * Gateway when LOVABLE_API_KEY is present. When the key is absent the
 * engine falls back to deterministic mock intelligence.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createGateway(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

/** Default chat model for Seaphore Copilot (fast, cheap, capable). */
export const DEFAULT_COPILOT_MODEL = "google/gemini-3.5-flash";
