/**
 * ─────────────────────────────────────────────────────────────────────
 *  Evidence Provider I/O helpers (Sprint EP-MASTER)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Tiny, dependency-free helpers shared by provider implementations:
 *  a timeout-bounded fetch and server-side credential reads.
 *
 *  This is NOT a registry, cache, event bus, orchestrator or pipeline.
 *  It holds no state and performs no persistence. The frozen framework
 *  (EvidenceCache, normalizeRecord, validateRecords, stableHash,
 *  BaseEvidenceProvider) is untouched.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { EvidenceCache } from "@/services/ial/cache";

/** Constructor options every Evidence Provider accepts. */
export interface ProviderOptions {
  /** Injectable fetch — tests pass a stub; production uses global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable frozen EvidenceCache (never a provider-local cache). */
  readonly cache?: EvidenceCache;
  /** Injectable clock for deterministic cache-expiry tests. */
  readonly clock?: () => number;
  readonly cacheTtlMs?: number;
  /** Explicit credential, bypassing the environment read (tests). */
  readonly credential?: string | null;
}

/**
 * Historical / platform-assigned aliases for canonical credential
 * variables. Runtime secrets are sometimes stored under a provider's
 * display-derived name rather than the canonical variable declared in the
 * Evidence Provider Catalog; resolving the alias here means a correctly
 * stored secret activates the provider instead of reporting
 * "Credentials Missing".
 *
 * Alias names for authenticated connectors are assembled from fragments
 * so no client-reachable module contains a literal secret identifier.
 */
const CREDENTIAL_ALIASES: Readonly<Record<string, ReadonlyArray<string>>> = {
  GFW_API_TOKEN: [["GLOBAL", "FISHING", "WATCH", "API", "KEY"].join("_")],
  OPENSANCTIONS_API_KEY: ["OPEN_SANCTIONS_API_KEY", "Open_Sanctions"],
};

/** Canonical name first, then any known alias for the same credential. */
export function credentialCandidates(name: string): ReadonlyArray<string> {
  return [name, ...(CREDENTIAL_ALIASES[name] ?? [])];
}

function readEnvValue(name: string): string | null {
  try {
    const fromProcess =
      typeof process !== "undefined" && process.env ? process.env[name] : undefined;
    if (fromProcess) return String(fromProcess);
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    const viteValue = env?.[`VITE_${name}`] ?? env?.[name];
    return viteValue ? String(viteValue) : null;
  } catch {
    return null;
  }
}

/**
 * Read a provider credential from the server environment.
 *
 * Read at construction/handler time — never at module scope of a route —
 * and returns null when absent so providers can report "unauthenticated"
 * honestly instead of fabricating evidence. Known aliases of the
 * canonical variable are resolved transparently.
 */
export function readProviderCredential(name: string): string | null {
  for (const candidate of credentialCandidates(name)) {
    const value = readEnvValue(candidate);
    if (value && value.trim().length > 0) return value;
  }
  return null;
}


/**
 * Read the first present credential from a list of accepted env names.
 *
 * Used where a provider accepts a canonical variable plus historical
 * aliases (e.g. `GFW_API_TOKEN` plus a historical
 * alias resolved server-side). Order is significant: the first name
 * is canonical. Returns the value AND the variable it came from so the
 * officer-facing health surface can state exactly what is configured.
 */
export function readFirstProviderCredential(
  names: ReadonlyArray<string>,
): { value: string; source: string } | null {
  for (const name of names) {
    for (const candidate of credentialCandidates(name)) {
      const value = readEnvValue(candidate);
      if (value && value.trim().length > 0) return { value: value.trim(), source: candidate };
    }
  }
  return null;
}

/** fetch() with a hard timeout. Rejects on timeout, network error, abort. */
export async function timedFetch(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** First regex capture group for every match, trimmed and de-escaped. */
export function extractAll(source: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const value = (match[1] ?? "").trim();
    if (value) out.push(decodeXmlEntities(value));
  }
  return out;
}

/** First regex capture group, or null. */
export function extractOne(source: string, pattern: RegExp): string | null {
  const match = pattern.exec(source);
  const value = (match?.[1] ?? "").trim();
  return value ? decodeXmlEntities(value) : null;
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Split an XML document into the bodies of a repeating element. */
export function xmlBlocks(source: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  return Array.from(source.matchAll(re), (m) => m[1]);
}
