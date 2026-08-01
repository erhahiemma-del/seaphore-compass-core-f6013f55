/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-01A — Provider Metadata
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Every Evidence Provider (connector) may declare provider metadata.
 *  Metadata is DESCRIPTIVE only — it never executes anything. The
 *  Provider Resolver (`./resolver.ts`) is the single component that
 *  turns metadata into an activation decision.
 *
 *  This file adds no registry, no manager, and no pipeline. It only
 *  describes providers so that exactly one can be selected per
 *  capability.
 * ─────────────────────────────────────────────────────────────────────
 */

/** What kind of provider this is. */
export type ProviderType = "LIVE" | "SIMULATOR" | "MOCK" | "TEST";

/** Which runtime environment a provider is allowed to serve. */
export type ProviderEnvironment = "development" | "production" | "both";

export interface ProviderMetadata {
  /** LIVE | SIMULATOR | MOCK | TEST */
  readonly providerType: ProviderType;
  /** Higher wins when several providers are eligible. Default 0. */
  readonly priority: number;
  /** Environment this provider may serve. Default "both". */
  readonly environment: ProviderEnvironment;
  /** Operator kill-switch. Disabled providers are never resolved. */
  readonly enabled: boolean;
}

export const DEFAULT_PROVIDER_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  priority: 0,
  environment: "both",
  enabled: true,
};

/** Normalise partial metadata declared by a connector. */
export function providerMetadata(partial?: Partial<ProviderMetadata>): ProviderMetadata {
  return { ...DEFAULT_PROVIDER_METADATA, ...(partial ?? {}) };
}

export type RuntimeEnvironment = "development" | "production";

/**
 * Resolve the runtime environment for provider selection.
 *
 * Precedence: explicit override → VITE_PROVIDER_ENV / PROVIDER_ENV →
 * MODE / NODE_ENV → "development".
 */
export function resolveRuntimeEnvironment(override?: RuntimeEnvironment): RuntimeEnvironment {
  if (override) return override;
  const env =
    (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env) ||
    undefined;
  const raw =
    env?.VITE_PROVIDER_ENV ||
    (typeof process !== "undefined" ? process.env?.PROVIDER_ENV : undefined) ||
    env?.MODE ||
    (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined) ||
    "development";
  return String(raw).toLowerCase() === "production" ? "production" : "development";
}

/**
 * Hybrid execution (several providers for one capability) is DISABLED
 * by default and only enabled by explicit configuration.
 */
export function hybridExecutionEnabled(): boolean {
  const env =
    (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env) ||
    undefined;
  const raw =
    env?.VITE_PROVIDER_HYBRID ||
    (typeof process !== "undefined" ? process.env?.PROVIDER_HYBRID : undefined);
  return String(raw ?? "").toLowerCase() === "true";
}

/**
 * Explicit per-capability provider override, e.g.
 * `VITE_PROVIDER_OVERRIDE_SANCTIONS=open-sanctions`.
 */
export function providerOverrideFor(capability: string): string | undefined {
  const key = `PROVIDER_OVERRIDE_${capability.toUpperCase()}`;
  const env =
    (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env) ||
    undefined;
  const raw =
    env?.[`VITE_${key}`] || (typeof process !== "undefined" ? process.env?.[key] : undefined);
  return raw ? String(raw) : undefined;
}
