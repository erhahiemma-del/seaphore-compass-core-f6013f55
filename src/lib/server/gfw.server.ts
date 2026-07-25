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
  GfwEvidencePackage,
  GfwHealthPayload,
  GfwVesselIdentity,
} from "@/connectors/global-fishing-watch/types";

const BASE_URL = "https://gateway.api.globalfishingwatch.org";
const SEARCH_PATH = "/v3/vessels/search";
const EVENTS_PATH = "/v3/events";
const HEALTH_TIMEOUT_MS = 4000;
// GFW v3 requires a datasets[] param on every vessel/event call.
const VESSEL_IDENTITY_DATASET = "public-global-vessel-identity:latest";
const EVENTS_DATASET = "public-global-events:latest";

const ENV_KEY = "GLOBAL_FISHING_WATCH_API_KEY";

function readApiKey(): string | null {
  const key = process.env[ENV_KEY];
  return key && key.length > 0 ? key : null;
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
  params: Record<string, string>,
): Promise<{ ok: true; body: T } | { ok: false; status: number; message: string }> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
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
    return { ok: false, status: response.status, message: `HTTP ${response.status}` };
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
  return {
    vesselId: String(r.id ?? r.vesselId ?? fallbackQuery),
    imo: (r.imo as string) ?? null,
    mmsi: (r.mmsi as string) ?? null,
    callSign: (r.callsign as string) ?? (r.callSign as string) ?? null,
    flag: (r.flag as string) ?? null,
    name: (r.shipname as string) ?? (r.name as string) ?? null,
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
 */
export async function runGfwSearch(query: string): Promise<GfwEvidencePackage | null> {
  const q = String(query ?? "").trim();
  if (!q) return null;
  const apiKey = readApiKey();
  if (!apiKey) throw new GfwCredentialsMissingError();

  const searchRes = await httpGet<{ entries?: unknown[] }>(apiKey, SEARCH_PATH, { query: q });
  if (!searchRes.ok) {
    if (searchRes.status === 401 || searchRes.status === 403) {
      throw new GfwAuthError(searchRes.message);
    }
    throw new GfwUpstreamError(searchRes.message, searchRes.status);
  }
  const first = Array.isArray(searchRes.body.entries) ? searchRes.body.entries[0] : null;
  const vessel = parseVessel(first, q);
  if (!vessel) return null;

  const eventsRes = await httpGet<{ entries?: unknown[] }>(apiKey, EVENTS_PATH, {
    vessels: vessel.vesselId,
    types: "port_visit,gap,fishing,encounter",
  });
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
    evidenceUrl: `https://globalfishingwatch.org/vessel-search/vessels/${encodeURIComponent(vessel.vesselId)}`,
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
    return { status: "down", latencyMs: 0, message: `${ENV_KEY} not configured` };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const url = new URL(SEARCH_PATH, BASE_URL);
    url.searchParams.set("query", "healthcheck");
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: buildHeaders(apiKey),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (response.status === 401 || response.status === 403) {
      return { status: "down", latencyMs, message: "Authentication Failed" };
    }
    if (response.status >= 500) {
      return { status: "down", latencyMs, message: `Unavailable (HTTP ${response.status})` };
    }
    if (!response.ok) {
      return { status: "degraded", latencyMs, message: `HTTP ${response.status}` };
    }
    return { status: "healthy", latencyMs };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}
