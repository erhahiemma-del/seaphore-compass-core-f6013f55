/**
 * ─────────────────────────────────────────────────────────────────────
 *  OpenSanctions — server-only credential + screening bridge
 * ─────────────────────────────────────────────────────────────────────
 *
 *  The API key NEVER leaves this boundary. Nothing here is importable
 *  from client bundles (`*.server.ts` is blocked), no value is logged,
 *  returned, or partially echoed.
 *
 *  Endpoint usage follows the provider contract:
 *    • POST /match/{dataset}    → screening (ranked candidates)
 *    • GET  /search/{dataset}   → user-facing free-text search
 *    • GET  /entities/{id}      → candidate detail
 *
 *  Credential resolution order:
 *    1. platform secret  (OPENSANCTIONS_API_KEY, plus legacy alias)
 *    2. server-side credential store (public.provider_credentials)
 *  The store is unreachable from any browser role (RLS deny-all, no
 *  grants); only admin-gated server functions touch it.
 * ─────────────────────────────────────────────────────────────────────
 */
import { readFirstProviderCredential } from "@/connectors/implementations/shared/provider-io";
import {
  deriveMatchState,
  type SanctionsCandidate,
  type SanctionsScreeningFinding,
} from "@/lib/sanctions/match-state";
import type {
  CredentialSource,
  CredentialStatus,
  ValidationOutcome,
} from "@/lib/sanctions/credential-types";

const API_BASE = "https://api.opensanctions.org";
const DEFAULT_DATASET = "sanctions";
const PROVIDER_NAME = "OpenSanctions";
const PROVIDER_KEY = "opensanctions";
const TIMEOUT_MS = 8_000;

export type {
  CredentialSource,
  CredentialStatus,
  ValidationOutcome,
} from "@/lib/sanctions/credential-types";

async function readStoredSecret(): Promise<{
  secret: string;
  rotatedAt: string | null;
  lastValidatedAt: string | null;
} | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("provider_credentials")
      .select("secret, rotated_at, last_validated_at")
      .eq("provider", PROVIDER_KEY)
      .maybeSingle();
    if (!data?.secret) return null;
    return {
      secret: String(data.secret),
      rotatedAt: (data.rotated_at as string | null) ?? null,
      lastValidatedAt: (data.last_validated_at as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Resolve the active credential. The value never leaves this module. */
async function resolveSecret(): Promise<{ value: string; source: CredentialSource } | null> {
  const fromEnv = readFirstProviderCredential(["OPENSANCTIONS_API_KEY"]);
  if (fromEnv) return { value: fromEnv.value, source: "platform-secret" };
  const stored = await readStoredSecret();
  if (stored) return { value: stored.secret, source: "credential-store" };
  return null;
}

/** Officer-facing credential status — presence only, never the value. */
export async function getCredentialStatus(): Promise<CredentialStatus> {
  const fromEnv = readFirstProviderCredential(["OPENSANCTIONS_API_KEY"]);
  if (fromEnv) {
    const stored = await readStoredSecret();
    return {
      configured: true,
      source: "platform-secret",
      rotatedAt: stored?.rotatedAt ?? null,
      lastValidatedAt: stored?.lastValidatedAt ?? null,
    };
  }
  const stored = await readStoredSecret();
  if (stored) {
    return {
      configured: true,
      source: "credential-store",
      rotatedAt: stored.rotatedAt,
      lastValidatedAt: stored.lastValidatedAt,
    };
  }
  return { configured: false, source: "none", rotatedAt: null, lastValidatedAt: null };
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(secret: string): Record<string, string> {
  return { Authorization: `ApiKey ${secret}`, Accept: "application/json" };
}

/** Validate an explicit candidate key, or the currently active credential. */
export async function validateCredential(candidate?: string): Promise<ValidationOutcome> {
  const checkedAt = new Date().toISOString();
  const secret = candidate?.trim() || (await resolveSecret())?.value;
  if (!secret) {
    return {
      authenticated: false,
      checkedAt,
      httpStatus: null,
      error: "No OpenSanctions credential is configured.",
    };
  }
  try {
    const url = `${API_BASE}/search/${DEFAULT_DATASET}?q=test&limit=1`;
    const res = await timedFetch(url, { method: "GET", headers: authHeaders(secret) });
    if (res.status === 200) {
      return { authenticated: true, checkedAt, httpStatus: 200, error: null };
    }
    const error =
      res.status === 401 || res.status === 403
        ? "Credential rejected by OpenSanctions (authentication failed)."
        : res.status === 429
          ? "OpenSanctions rate limit reached — try again shortly."
          : `OpenSanctions returned HTTP ${res.status}.`;
    return { authenticated: false, checkedAt, httpStatus: res.status, error };
  } catch (err) {
    return {
      authenticated: false,
      checkedAt,
      httpStatus: null,
      error: `Could not reach OpenSanctions: ${err instanceof Error ? err.message : "network error"}`,
    };
  }
}

/**
 * Rotate the credential. The new key is validated FIRST; a failing key is
 * discarded so an existing working credential is never destroyed.
 */
export async function rotateCredential(
  candidate: string,
  rotatedBy: string,
): Promise<{ replaced: boolean; validation: ValidationOutcome }> {
  const validation = await validateCredential(candidate);
  if (!validation.authenticated) return { replaced: false, validation };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("provider_credentials").upsert(
    {
      provider: PROVIDER_KEY,
      secret: candidate.trim(),
      rotated_at: new Date().toISOString(),
      rotated_by: rotatedBy,
      last_validated_at: validation.checkedAt,
    },
    { onConflict: "provider" },
  );
  if (error) {
    return {
      replaced: false,
      validation: {
        ...validation,
        authenticated: false,
        error: "Credential validated but could not be stored securely.",
      },
    };
  }
  return { replaced: true, validation };
}

/** Record a successful validation timestamp against the stored credential. */
export async function touchValidation(at: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("provider_credentials")
      .update({ last_validated_at: at })
      .eq("provider", PROVIDER_KEY);
  } catch {
    /* status timestamp is advisory only */
  }
}

// ─── screening ──────────────────────────────────────────────────────

const SCHEMA_BY_KIND: Record<string, string> = {
  vessel: "Vessel",
  company: "Company",
  organization: "Organization",
  person: "Person",
};

interface RawEntity {
  id?: string;
  caption?: string;
  schema?: string;
  score?: number;
  datasets?: unknown;
  properties?: Record<string, unknown>;
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

function toCandidate(raw: RawEntity): SanctionsCandidate | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  const props = raw.properties ?? {};
  const imo = strings(props["imoNumber"])[0] ?? null;
  return {
    id,
    caption: raw.caption ?? strings(props["name"])[0] ?? id,
    schema: raw.schema ?? "Thing",
    score: typeof raw.score === "number" ? Math.max(0, Math.min(1, raw.score)) : 0,
    datasets: strings(raw.datasets),
    topics: strings(props["topics"]),
    countries: [...strings(props["country"]), ...strings(props["jurisdiction"])],
    imoNumber: imo ? imo.replace(/[^0-9]/g, "") || null : null,
    detailUrl: `https://www.opensanctions.org/entities/${id}/`,
  };
}

export interface ScreenInput {
  readonly name: string;
  readonly kind?: string;
  readonly imo?: string;
  readonly dataset?: string;
}

/** POST /match/{dataset} — the screening path. Failures are never a clear. */
export async function screenEntity(input: ScreenInput): Promise<SanctionsScreeningFinding> {
  const dataset = (input.dataset ?? DEFAULT_DATASET).trim() || DEFAULT_DATASET;
  const screenedAt = new Date().toISOString();
  const kind = (input.kind ?? "company").toLowerCase();
  const base = {
    subject: input.name,
    entityKind: kind,
    provider: PROVIDER_NAME,
    dataset,
    screenedAt,
  } as const;

  const secret = (await resolveSecret())?.value;
  if (!secret) {
    return {
      ...base,
      state: "NOT_SCREENED",
      topScore: null,
      candidates: [],
      error: "OpenSanctions credential is not configured — screening did not run.",
    };
  }

  const properties: Record<string, string[]> = { name: [input.name] };
  if (input.imo && kind === "vessel") properties["imoNumber"] = [input.imo];

  try {
    const res = await timedFetch(
      `${API_BASE}/match/${encodeURIComponent(dataset)}?algorithm=best`,
      {
        method: "POST",
        headers: { ...authHeaders(secret), "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: {
            subject: { schema: SCHEMA_BY_KIND[kind] ?? "LegalEntity", properties },
          },
        }),
      },
    );
    if (!res.ok) {
      return {
        ...base,
        state: "NOT_SCREENED",
        topScore: null,
        candidates: [],
        error:
          res.status === 401 || res.status === 403
            ? "OpenSanctions rejected the configured credential — screening did not run."
            : `OpenSanctions returned HTTP ${res.status} — screening did not run.`,
      };
    }
    const body = (await res.json()) as {
      responses?: Record<string, { results?: RawEntity[] }>;
    };
    const results = body.responses?.["subject"]?.results ?? [];
    const candidates = results
      .map(toCandidate)
      .filter((c): c is SanctionsCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
    const topScore = candidates.length > 0 ? candidates[0].score : null;
    return {
      ...base,
      state: deriveMatchState(topScore),
      topScore,
      candidates,
      error: null,
    };
  } catch (err) {
    return {
      ...base,
      state: "NOT_SCREENED",
      topScore: null,
      candidates: [],
      error: `Could not reach OpenSanctions: ${err instanceof Error ? err.message : "network error"} — screening did not run.`,
    };
  }
}

export interface EntityDetail {
  readonly id: string;
  readonly caption: string;
  readonly schema: string;
  readonly datasets: ReadonlyArray<string>;
  readonly properties: Record<string, ReadonlyArray<string>>;
  readonly detailUrl: string;
  readonly retrievedAt: string;
}

/** GET /entities/{id} — detailed candidate information. */
export async function entityDetail(id: string): Promise<EntityDetail | { error: string }> {
  const secret = (await resolveSecret())?.value;
  if (!secret) return { error: "OpenSanctions credential is not configured." };
  try {
    const res = await timedFetch(`${API_BASE}/entities/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: authHeaders(secret),
    });
    if (!res.ok) return { error: `OpenSanctions returned HTTP ${res.status}.` };
    const raw = (await res.json()) as RawEntity;
    const props: Record<string, ReadonlyArray<string>> = {};
    for (const [key, value] of Object.entries(raw.properties ?? {})) {
      const list = strings(value);
      if (list.length > 0) props[key] = list;
    }
    return {
      id: String(raw.id ?? id),
      caption: raw.caption ?? String(raw.id ?? id),
      schema: raw.schema ?? "Thing",
      datasets: strings(raw.datasets),
      properties: props,
      detailUrl: `https://www.opensanctions.org/entities/${raw.id ?? id}/`,
      retrievedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      error: `Could not reach OpenSanctions: ${err instanceof Error ? err.message : "network error"}`,
    };
  }
}
