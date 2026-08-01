/**
 * Sprint 8 · Model registry — model-agnostic (Layer 6.1).
 *
 * Three tiers are declared. The Reasoning Engine calls the chosen tier and
 * falls back down the ladder on retryable failures. Concrete adapters are
 * injected at construction time (see `LovableGatewayModel` in
 * `provider-lovable.server.ts`), so the engine itself has no coupling to
 * any provider SDK. Tests inject `MockModelClient`.
 */
import type { ModelClient, ModelTier } from "./types";

export interface ModelRegistry {
  readonly tier1?: ModelClient;
  readonly tier2?: ModelClient;
  readonly tier3?: ModelClient;
}

export function selectTier(registry: ModelRegistry, tier: ModelTier): ModelClient | undefined {
  return registry[tier];
}

/** Fallback order: tier1 → tier2 → tier3 → whichever is defined. */
export function fallbackChain(registry: ModelRegistry, startAt: ModelTier): readonly ModelClient[] {
  const order: ModelTier[] = ["tier1", "tier2", "tier3"];
  const startIdx = order.indexOf(startAt);
  const rotated = [...order.slice(startIdx), ...order.slice(0, startIdx)];
  return rotated.map((t) => registry[t]).filter((c): c is ModelClient => Boolean(c));
}
