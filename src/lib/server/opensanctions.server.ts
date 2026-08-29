/**
 * ─────────────────────────────────────────────────────────────────────
 *  OpenSanctions screening bridge (server only)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  The credential lives in the server environment and is read here at
 *  handler time. It never leaves this module: callers receive normalized
 *  findings, never headers, never the key, never the raw request.
 *
 *  Screening uses `POST /match/{dataset}` — the endpoint designed for
 *  entity resolution. `/search` is a text lookup and is deliberately not
 *  used for screening decisions. Candidate detail uses
 *  `GET /entities/{id}`.
 *
 *  This is a boundary shim, not a second sanctions engine: it classifies
 *  provider failure honestly and hands the result to the canonical
 *  screening state model in `@/lib/sanctions/match-state`.
 * ─────────────────────────────────────────────────────────────────────
 */
import { readProviderCredential } from "@/connectors/implementations/shared/provider-io";
import {
  deriveMatchState,
  type SanctionsCandidate,
  type SanctionsFailureReason,
  type SanctionsMatchState,
} from "@/lib/sanctions/match-state";

const BASE = "https://api.opensanctions.org";
const DEFAULT_DATASET = "sanctions";
export const PROVIDER_NAME = "OpenSanctions";
const TIMEOUT_MS = 12_000;

export interface ScreenSubjectInput {
  readonly name: string;
  /** `Vessel`, `Company`, `Person` — OpenSanctions FollowTheMoney schema. */
  readonly schema?: "Vessel" | "Company" | "Person" | "LegalEntity";
  readonly imo?: string | null;
  readonly country?: string | null;
  readonly dataset?: string;
}

export interface ScreenSubjectOutcome {
  readonly state: SanctionsMatchState;
  readonly failureReason: SanctionsFailureReason | null;
  readonly errorMessage: string | null;
  readonly topScore: number | null;
  readonly candidates: ReadonlyArray<SanctionsCandidate>;
  readonly provider: string;
  readonly dataset: string;
}

export interface CredentialStatus {
  readonly configured: boolean;
  readonly provider: string;
}

export function credentialStatus(): CredentialStatus {
  return {
    configured: readProviderCredential("OPENSANCTIONS_API_KEY") !== null,
    provider: PROVIDER_NAME,
  };
}

function strings(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function props(record: Record<string, unknown>): Record<string, unknown> {
  const raw = record["properties"];
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function normalizeCandidate(raw: Record<string, unknown>): SanctionsCandidate {
  const p = props(raw);
  const score = typeof raw["score"] === "number" ? raw["score"] : 0;
  return {
    id: String(raw["id"] ?? ""),
    caption: String(raw["caption"] ?? "Unnamed entity"),
    schema: String(raw["schema"] ?? "LegalEntity"),
    score,
    matchBasis: strings(raw["match"] ?? raw["features"] ?? []),
    datasets: strings(raw["datasets"]),
    topics: strings(p["topics"]),
    programs: strings(p["program"]),
    countries: strings(p["country"]).concat(strings(p["flag"])),
    identifiers: strings(p["registrationNumber"])
      .concat(strings(p["taxNumber"]))
      .concat(strings(p["mmsi"])),
    imoNumber: strings(p["imoNumber"])[0] ?? null,
  };
}

function classify(status: number): SanctionsFailureReason {
  if (status === 401 || status === 403) return "AUTHENTICATION_FAILED";
  if (status === 429) return "RATE_LIMITED";
  return "PROVIDER_ERROR";
}

function failure(
  reason: SanctionsFailureReason,
  message: string,
  dataset: string,
): ScreenSubjectOutcome {
  return {
    state: "SCREENING_UNAVAILABLE",
    failureReason: reason,
    errorMessage: message,
    topScore: null,
    candidates: [],
    provider: PROVIDER_NAME,
    dataset,
  };
}

/**
 * Screen one subject. A transport or credential failure returns
 * `SCREENING_UNAVAILABLE` with the reason attached — it is never reported
 * as an absence of matches.
 */
export async function screenSubject(input: ScreenSubjectInput): Promise<ScreenSubjectOutcome> {
  const dataset = input.dataset ?? DEFAULT_DATASET;
  const name = input.name.trim();
  if (name.length < 2) {
    return failure("NO_RECORD", "Subject has no usable name to screen.", dataset);
  }

  const key = readProviderCredential("OPENSANCTIONS_API_KEY");
  if (!key) {
    return failure("AUTHENTICATION_FAILED", "No OpenSanctions credential configured.", dataset);
  }

  const properties: Record<string, string[]> = { name: [name] };
  if (input.imo) properties["imoNumber"] = [input.imo];
  if (input.country) properties["country"] = [input.country];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}/match/${encodeURIComponent(dataset)}?algorithm=best`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `ApiKey ${key}`,
      },
      body: JSON.stringify({
        queries: {
          subject: { schema: input.schema ?? "LegalEntity", properties },
        },
      }),
    });

    if (!response.ok) {
      return failure(classify(response.status), `Provider responded ${response.status}.`, dataset);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const responses = payload["responses"];
    const subject =
      responses && typeof responses === "object"
        ? ((responses as Record<string, unknown>)["subject"] as Record<string, unknown> | undefined)
        : undefined;
    const results = Array.isArray(subject?.["results"]) ? (subject!["results"] as unknown[]) : [];

    const candidates = results
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map(normalizeCandidate)
      .filter((c) => c.id.length > 0)
      .sort((a, b) => b.score - a.score);

    const topScore = candidates.length ? candidates[0]!.score : null;
    return {
      state: deriveMatchState(topScore),
      failureReason: null,
      errorMessage: null,
      topScore,
      candidates,
      provider: PROVIDER_NAME,
      dataset,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure("PROVIDER_ERROR", message, dataset);
  } finally {
    clearTimeout(timer);
  }
}

export interface EntityDetail {
  readonly id: string;
  readonly caption: string;
  readonly schema: string;
  readonly datasets: ReadonlyArray<string>;
  readonly properties: ReadonlyArray<{ readonly key: string; readonly values: string[] }>;
  readonly firstSeen: string | null;
  readonly lastSeen: string | null;
}

/** Full provider record for one candidate. Officer-initiated only. */
export async function entityDetail(id: string): Promise<EntityDetail | { readonly error: string }> {
  const key = readProviderCredential("OPENSANCTIONS_API_KEY");
  if (!key) return { error: "No OpenSanctions credential configured." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}/entities/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { authorization: `ApiKey ${key}` },
    });
    if (!response.ok) return { error: `Provider responded ${response.status}.` };
    const raw = (await response.json()) as Record<string, unknown>;
    const p = props(raw);
    return {
      id: String(raw["id"] ?? id),
      caption: String(raw["caption"] ?? id),
      schema: String(raw["schema"] ?? "LegalEntity"),
      datasets: strings(raw["datasets"]),
      properties: Object.entries(p)
        .map(([k, v]) => ({ key: k, values: [...strings(v)] }))
        .filter((entry) => entry.values.length > 0),
      firstSeen: typeof raw["first_seen"] === "string" ? raw["first_seen"] : null,
      lastSeen: typeof raw["last_seen"] === "string" ? raw["last_seen"] : null,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
