/**
 * OIE · Module 6 — Reasoning Provider (model-agnostic).
 *
 * The Reasoning Provider is the ONLY layer that talks to a model. Every
 * other OIE module is deterministic. Providers are hot-swappable:
 * Gemini (default), OpenAI GPT (via Lovable AI Gateway), and Anthropic
 * Claude (stub — requires ANTHROPIC_API_KEY once wired). Adding a new
 * brain is a new file plus one entry in `providers`.
 *
 * A provider is asked to REPHRASE the assessment produced by the
 * existing Reasoning Engine into operational language. It never decides
 * what evidence to trust — evidence weighting is fixed upstream.
 */
export type ReasoningProviderId = "gemini" | "gpt" | "claude";

export interface ReasoningProviderMeta {
  id: ReasoningProviderId;
  label: string;
  vendor: string;
  /** Which chat model id the Lovable AI Gateway should route to. */
  gatewayModel?: string;
  /** True when the provider is available in this deployment. */
  available: boolean;
  /** Human-readable reason when `available === false`. */
  unavailableReason?: string;
}

/**
 * Static registry — actual server-side dispatch lives in
 * `provider-runtime.server.ts`. UI code only needs the metadata.
 */
export const PROVIDERS: readonly ReasoningProviderMeta[] = Object.freeze([
  {
    id: "gemini",
    label: "Gemini (default)",
    vendor: "Google",
    gatewayModel: "google/gemini-3.6-flash",
    available: true,
  },
  {
    id: "gpt",
    label: "ChatGPT",
    vendor: "OpenAI",
    gatewayModel: "openai/gpt-5.4-mini",
    available: true,
  },
  {
    id: "claude",
    label: "Claude",
    vendor: "Anthropic",
    available: false,
    unavailableReason:
      "Anthropic key not configured on this deployment. Once added, the Claude adapter activates without further changes.",
  },
]);

export const DEFAULT_PROVIDER_ID: ReasoningProviderId = "gemini";

export function getProviderMeta(id: string | undefined): ReasoningProviderMeta {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
