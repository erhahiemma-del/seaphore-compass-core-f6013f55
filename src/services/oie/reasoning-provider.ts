/**
 * OIE · Reasoning Provider — metadata (client-safe).
 *
 * The Reasoning Provider is the ONLY layer that talks to a model. All
 * other OIE modules are deterministic. Providers are hot-swappable:
 * Gemini (default), OpenAI GPT, and Anthropic Claude (adapter ready,
 * activates once an Anthropic key is provisioned). Adding a new brain
 * is one entry here + one adapter in `provider-runtime.server.ts`.
 *
 * Nothing in this file makes network calls; UI code can import it.
 */
export type ReasoningProviderId = "gemini" | "gpt" | "claude";

export interface ReasoningProviderMeta {
  id: ReasoningProviderId;
  label: string;
  vendor: string;
  gatewayModel?: string;
  available: boolean;
  unavailableReason?: string;
}

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
      "Anthropic key not yet configured. Once added, the Claude adapter activates without further changes.",
  },
]);

export const DEFAULT_PROVIDER_ID: ReasoningProviderId = "gemini";

export function getProviderMeta(id: string | undefined): ReasoningProviderMeta {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
