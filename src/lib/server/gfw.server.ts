/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE SERVER-ONLY GATEWAY — GLOBAL FISHING WATCH
 * ─────────────────────────────────────────────────────────────────────
 *
 * This module is server-only (`.server.ts` — blocked from the client
 * bundle). It is the SINGLE place where the GFW API key is read and
 * where authenticated requests to Global Fishing Watch are issued.
 *
 * Security invariants (enforced by architecture, not by convention):
 *   • `process.env.GLOBAL_FISHING_WATCH_API_KEY` is read inside the
 *     execution boundary — never at module scope, never in a helper
 *     imported by client code.
 *   • The Authorization header never leaves this module.
 *   • Only sanitised Evidence Packages cross the RPC boundary.
 *
 * Intelligence invariants:
 *   • Evidence-only. This module never assigns risk labels.
 *   • Priority assignment is OSAE's responsibility — happens on the
 *     client after the Evidence Package arrives.
 * ─────────────────────────────────────────────────────────────────────
 */
import {
  AISBehaviourAnalyzer,
  type AisMovementEvent,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import type {
  GfwCandidate,
  GfwEvidencePackage,
  GfwHealthPayload,
  GfwVesselIdentity,
} from "@/connectors/global-fishing-watch/types";
import { selectIdentity } from "@/intelligence/matching/identity-confidence";

const BASE_URL = "https://gateway.api.globalfishingwatch.org";
const SEARCH_PATH = "/v3/vessels/search";
const EVENTS_PATH = "/v3/events";
const HEALTH_TIMEOUT_MS = 4000;
// GFW v3 requires a datasets[] param on every vessel/event call.
const VESSEL_IDENTITY_DATASET = "public-global-vessel-identity:latest";
const EVENTS_DATASET = "public-global-events:latest";

/**
 * Accepted credential variables, canonical first. `GFW_API_TOKEN` is the
 * name declared in the Evidence Provider Catalog; the legacy name is
 * still accepted so an existing deployment keeps working.
 */
const ENV_KEYS = ["GFW_API_TOKEN", "GLOBAL_FISHING_WATCH_API_KEY"] as const;
const ENV_KEY = ENV_KEYS[0];

/** Read inside the execution boundary — env is injected per request. */
function readApiKeyWithSource(): { value: string; source: string } | null {
  for (const name of ENV_KEYS) {
    const raw = process.env[name];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return { value: raw.trim(), source: name };
    }
  }
  return null;
}

function readApiKey(): string | null {
  return readApiKeyWithSource()?.value ?? null;
}

/** Officer-facing credential states — never a generic error string. */
export type GfwCredentialState =
  | "AUTHENTICATED"
  | "CREDENTIALS_MISSING"
  | "CREDENTIALS_INVALID"
  | "PROVIDER_UNREACHABLE";

export interface GfwCredentialStatus {
  readonly state: GfwCredentialState;
  readonly configured: boolean;
  /** Which env var supplied the credential. Never the credential itself. */
  readonly credentialEnv: string | null;
  readonly message: string;
  readonly checkedAt: string;
  readonly latencyMs: number;
}

/**
 * Startup validation.
 *
 * Called once per worker instance by the connector bootstrap: confirms
 * the token is present AND accepted upstream, so Provider Health and the
 * Intelligence Readiness dashboard report a validated state rather than
 * an assumed one. The result is cached per instance; `force` re-probes.
 */
let startupValidation: GfwCredentialStatus | null = null;

export async function validateGfwCredentials(force = false): Promise<GfwCredentialStatus> {
  if (startupValidation && !force) return startupValidation;
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  const found = readApiKeyWithSource();
  if (!found) {
    startupValidation = {
      state: "CREDENTIALS_MISSING",
      configured: false,
      credentialEnv: null,
      message: `Credentials Missing — set ${ENV_KEY} to activate Global Fishing Watch.`,
      checkedAt,
      latencyMs: 0,
    };
    return startupValidation;
  }

  const health = await runGfwHealthCheck();
  const msg = (health.message ?? "").toLowerCase();
  let state: GfwCredentialState;
  let message: string;
  if (health.status === "healthy" || health.status === "degraded") {
    state = "AUTHENTICATED";
    message = `Authenticated with Global Fishing Watch via ${found.source}.`;
  } else if (msg.includes("authentication")) {
    state = "CREDENTIALS_INVALID";
    message = `Credentials Invalid — Global Fishing Watch rejected ${found.source}.`;
  } else {
    state = "PROVIDER_UNREACHABLE";
    message = `Provider Unreachable — ${health.message ?? "no response from Global Fishing Watch"}.`;
  }

  startupValidation = {
    state,
    configured: true,
    credentialEnv: found.source,
    message,
    checkedAt,
    latencyMs: Date.now() - started,
  };
  return startupValidation;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": "Seaphore-OSINT/1.0",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function httpGet<T>(
  apiKey: string,
  path: string,
  params: Array<[string, string]>,
): Promise<{ ok: true; body: T } | { ok: false; status: number; message: string }> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of params) url.searchParams.append(k, v);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: buildHeaders(apiKey),
    });
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: response.status, message: "Authentication Failed" };
  }
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: response.status,
      message: `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
    };
  }
  try {
    return { ok: true, body: (await response.json()) as T };
  } catch {
    return { ok: false, status: response.status, message: "Invalid JSON from upstream" };
  }
}

function parseVessel(entry: unknown, fallbackQuery: string): GfwVesselIdentity | null {
  if (!entry || typeof entry !== "object") return null;
  const r = entry as Record<string, unknown>;
  const selfArr = Array.isArray(r.selfReportedInfo)
    ? (r.selfReportedInfo as Record<string, unknown>[])
    : [];
  const registryArr = Array.isArray(r.registryInfo)
    ? (r.registryInfo as Record<string, unknown>[])
    : [];
  const self = selfArr[0] ?? {};
  const registry = registryArr[0] ?? {};
  const vesselId =
    (self.id as string) ?? (registry.id as string) ?? (r.id as string) ?? fallbackQuery;

  // Aliases: every distinct shipname across self-reported + registry
  // beyond the primary. Historical names: `registryOwners`/`priorNames`
  // when present (GFW exposes these on the identity object).
  const primary = ((self.shipname as string) ?? (registry.shipname as string) ?? null) || null;
  const aliasSet = new Set<string>();
  for (const s of [...selfArr, ...registryArr]) {
    const n = typeof s.shipname === "string" ? (s.shipname as string) : null;
    if (n && n !== primary) aliasSet.add(n);
  }
  const priorNames = Array.isArray(r.priorNames)
    ? (r.priorNames as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  const matchFields = typeof r.matchFields === "string" ? (r.matchFields as string) : null;

  return {
    vesselId: String(vesselId),
    imo: (self.imo as string) ?? (registry.imo as string) ?? null,
    mmsi: (self.ssvid as string) ?? (registry.ssvid as string) ?? null,
    callSign: (self.callsign as string) ?? (registry.callsign as string) ?? null,
    flag: (self.flag as string) ?? (registry.flag as string) ?? null,
    name: primary,
    aliases: aliasSet.size ? [...aliasSet] : undefined,
    historicalNames: priorNames.length ? priorNames : undefined,
    providerMatchFields: matchFields,
  };
}

function parseMovementEvents(entries: unknown[]): AisMovementEvent[] {
  const events: AisMovementEvent[] = [];
  for (const item of entries) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const ts = (it.start as string) ?? (it.timestamp as string);
    const pos = (it.position as Record<string, unknown> | undefined) ?? undefined;
    if (!ts || !pos) continue;
    events.push({
      timestamp: ts,
      latitude: Number(pos.lat ?? pos.latitude ?? 0),
      longitude: Number(pos.lon ?? pos.lng ?? pos.longitude ?? 0),
      speedKnots: typeof it.speed === "number" ? (it.speed as number) : undefined,
      courseDeg: typeof it.course === "number" ? (it.course as number) : undefined,
      nearestPort: typeof it.nearestPort === "string" ? (it.nearestPort as string) : undefined,
      distanceFromPortNm:
        typeof it.distanceFromPortNm === "number" ? (it.distanceFromPortNm as number) : undefined,
      distanceFromCoastNm:
        typeof it.distanceFromCoastNm === "number" ? (it.distanceFromCoastNm as number) : undefined,
      weather:
        it.weather === "clear" || it.weather === "moderate" || it.weather === "severe"
          ? (it.weather as "clear" | "moderate" | "severe")
          : undefined,
      trafficDensity:
        it.trafficDensity === "sparse" ||
        it.trafficDensity === "moderate" ||
        it.trafficDensity === "dense"
          ? (it.trafficDensity as "sparse" | "moderate" | "dense")
          : undefined,
    });
  }
  return events;
}

export class GfwCredentialsMissingError extends Error {
  code = "GFW_CREDENTIALS_MISSING" as const;
  constructor() {
    super(`Missing ${ENV_KEY}. Configure the secret and redeploy.`);
  }
}

export class GfwAuthError extends Error {
  code = "GFW_AUTH_FAILED" as const;
  constructor(message: string) {
    super(message);
  }
}

export class GfwUpstreamError extends Error {
  code = "GFW_UPSTREAM_ERROR" as const;
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Perform vessel search + movement history + AIS continuity analysis
 * and return a sanitised Evidence Package. Reads credentials from
 * server env only.
 *
 * Identity Confidence: every candidate is scored by
 * `selectIdentity(...)`. When the top score is below the
 * auto-select threshold or a runner-up sits within the tie band,
 * `requiresConfirmation` is set to `true` and the movement/continuity
 * fetch is skipped — the officer must confirm the intended vessel
 * before OSAE receives evidence.
 */
export async function runGfwSearch(query: string): Promise<GfwEvidencePackage | null> {
  const q = String(query ?? "").trim();
  if (!q) return null;
  const apiKey = readApiKey();
  if (!apiKey) throw new GfwCredentialsMissingError();

  const searchRes = await httpGet<{ entries?: unknown[] }>(apiKey, SEARCH_PATH, [
    ["query", q],
    ["datasets[0]", VESSEL_IDENTITY_DATASET],
    ["limit", "5"],
  ]);
  if (!searchRes.ok) {
    if (searchRes.status === 401 || searchRes.status === 403) {
      throw new GfwAuthError(searchRes.message);
    }
    throw new GfwUpstreamError(searchRes.message, searchRes.status);
  }
  const entries = Array.isArray(searchRes.body.entries) ? searchRes.body.entries : [];
  const candidates = entries
    .map((e) => parseVessel(e, q))
    .filter((v): v is GfwVesselIdentity => v !== null);

  if (candidates.length === 0) return null;

  const selection = selectIdentity(
    candidates.map((v) => ({
      id: v.vesselId,
      name: v.name,
      imo: v.imo,
      mmsi: v.mmsi,
      callSign: v.callSign,
      flag: v.flag,
      aliases: v.aliases,
      historicalNames: v.historicalNames,
      providerMatchFields: v.providerMatchFields,
      _vessel: v,
    })),
    { query: q },
  );

  const vessel =
    (selection.selected as (GfwVesselIdentity & { _vessel?: GfwVesselIdentity }) | null)?._vessel ??
    null;
  if (!vessel || !selection.confidence) return null;

  const alternates: GfwCandidate[] = selection.alternates.map((a) => ({
    vessel: (a.candidate as unknown as { _vessel: GfwVesselIdentity })._vessel,
    confidence: a.confidence,
  }));

  const evidenceUrl = `https://globalfishingwatch.org/vessel-search/vessels/${encodeURIComponent(vessel.vesselId)}`;

  // Ambiguous: skip the movement fetch. Officer must confirm first.
  if (selection.requiresConfirmation) {
    return {
      vessel,
      lastPosition: null,
      movementHistory: [],
      continuityReport: AISBehaviourAnalyzer.analyse({
        vesselId: vessel.vesselId,
        events: [],
      }),
      evidenceUrl,
      identityConfidence: selection.confidence,
      alternates,
      requiresConfirmation: true,
      ambiguityReason: selection.ambiguityReason,
    };
  }

  const eventsRes = await httpGet<{ entries?: unknown[] }>(apiKey, EVENTS_PATH, [
    ["vessels[0]", vessel.vesselId],
    ["datasets[0]", EVENTS_DATASET],
    ["types[0]", "gap"],
    ["types[1]", "port_visit"],
    ["types[2]", "fishing"],
    ["types[3]", "encounter"],
    ["limit", "50"],
  ]);
  const rawEntries =
    eventsRes.ok && Array.isArray(eventsRes.body.entries) ? eventsRes.body.entries : [];
  const events = parseMovementEvents(rawEntries);
  const continuityReport = AISBehaviourAnalyzer.analyse({
    vesselId: vessel.vesselId,
    events,
  });

  const last = events[events.length - 1];
  return {
    vessel,
    lastPosition: last
      ? {
          latitude: last.latitude,
          longitude: last.longitude,
          timestamp: last.timestamp,
          speedKnots: last.speedKnots,
          courseDeg: last.courseDeg,
        }
      : null,
    movementHistory: events,
    continuityReport,
    evidenceUrl,
    identityConfidence: selection.confidence,
    alternates,
    requiresConfirmation: false,
    ambiguityReason: "none",
  };
}

/**
 * Server-side health probe. Reads env internally and pings the search
 * endpoint with a short timeout. Never leaks credentials in the
 * returned payload.
 */
export async function runGfwHealthCheck(): Promise<GfwHealthPayload> {
  const started = Date.now();
  const apiKey = readApiKey();
  if (!apiKey) {
    return {
      status: "down",
      latencyMs: 0,
      message: `Credentials Missing — ${ENV_KEY} not configured`,
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const url = new URL(SEARCH_PATH, BASE_URL);
    url.searchParams.append("query", "test");
    url.searchParams.append("datasets[0]", VESSEL_IDENTITY_DATASET);
    url.searchParams.append("limit", "1");
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: buildHeaders(apiKey),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (response.status === 401 || response.status === 403) {
      return {
        status: "down",
        latencyMs,
        message: `Authentication Failed — Credentials Invalid (HTTP ${response.status})`,
      };
    }
    if (response.status >= 500) {
      return {
        status: "down",
        latencyMs,
        message: `Provider Unreachable — upstream returned HTTP ${response.status}`,
      };
    }
    if (!response.ok) {
      return { status: "degraded", latencyMs, message: `HTTP ${response.status}` };
    }
    return { status: "healthy", latencyMs };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      message: `Provider Unreachable — ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
