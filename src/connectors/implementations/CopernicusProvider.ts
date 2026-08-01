/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-COPERNICUS-01 — Copernicus Data Space Ecosystem Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Satellite imagery metadata from the Copernicus Data Space Ecosystem
 *  (CDSE) — ESA's official platform for Sentinel-1 SAR, Sentinel-2
 *  multispectral, and related Copernicus mission data. Metadata only:
 *  scene IDs, acquisition times, bounding boxes, collection names, and
 *  licensing. Raw imagery is never downloaded.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → CopernicusProvider → EvidencePackage
 *      → IFE → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  AUTHENTICATION
 *  CDSE uses OAuth 2.0 password-grant against the Keycloak token
 *  endpoint. The access token has a short TTL (~600 s); this provider
 *  automatically refreshes it before the window expires. Credentials
 *  are read ONLY from environment variables — never hardcoded, never
 *  logged, never committed.
 *
 *  Required env vars (server-side only):
 *    COPERNICUS_USERNAME  — CDSE account email
 *    COPERNICUS_PASSWORD  — CDSE account password
 *
 *  ACQUISITION ONLY. This provider reports scene metadata verbatim. It
 *  never labels imagery "suspicious", never infers vessel presence,
 *  never scores risk, and never interprets SAR signatures. All
 *  interpretation belongs to the IFE/OIE reasoning layers.
 *
 *  Never: persists, resolves identity, dedupes, publishes a UIP, or
 *  modifies IAL / IFE / OIE / OKL / MIBC. No Supabase imports.
 * ─────────────────────────────────────────────────────────────────────
 */
import { BaseEvidenceProvider } from "@/connectors/framework/BaseEvidenceProvider";
import type { ProviderValidation } from "@/connectors/framework/spec";
import type { EvidenceCache } from "@/services/ial/cache";
import { stableHash } from "@/services/ial/hash";
import { normalizeRecord } from "@/services/ial/normalizer";
import { validateRecords } from "@/services/ial/validator";
import type { ConnectorCapability } from "@/services/ial/connectors/base";
import type { ProviderMetadata } from "@/services/ial/connectors/provider-metadata";
import type {
  AcquisitionQuery,
  ConnectorId,
  ConnectorResult,
  EvidenceFieldValue,
  NormalizedEvidence,
} from "@/services/ial/types";
import { readProviderCredential, timedFetch, type ProviderOptions } from "./shared/provider-io";

// ─────────────────────────────────────────────────────────────────────
//  SECTION 1: CONSTANTS & METADATA
// ─────────────────────────────────────────────────────────────────────

/**
 * CDSE Keycloak OAuth 2.0 token endpoint (password grant).
 * Documented at: https://documentation.dataspace.copernicus.eu/APIs/Token.html
 */
const TOKEN_ENDPOINT =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

/** STAC API search endpoint. */
const STAC_SEARCH = "https://catalogue.dataspace.copernicus.eu/stac/v1/search";

/** Health probe: STAC root (no auth required). */
const STAC_ROOT = "https://catalogue.dataspace.copernicus.eu/stac/v1";

const CONNECT_TIMEOUT_MS = 8_000;
const SEARCH_TIMEOUT_MS = 12_000;
const TOKEN_TIMEOUT_MS = 10_000;

/**
 * Refresh the token 60 seconds before it expires to prevent mid-query
 * expiry. CDSE tokens typically live 600 s; we treat that as the floor.
 */
const TOKEN_REFRESH_BUFFER_S = 60;

/** Maximum scenes returned per search. */
const MAX_SCENES = 20;

/** Cache: 1 h — scene metadata is stable once a pass completes. */
export const COPERNICUS_CACHE_TTL_MS = 60 * 60 * 1_000;

/** Credential env vars — declared in .env.example, read at call time. */
export const COPERNICUS_CREDENTIAL_ENV = ["COPERNICUS_USERNAME", "COPERNICUS_PASSWORD"] as const;

export const COPERNICUS_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  /**
   * Satellite imagery is a corroborating source for AIS-dark vessel
   * positions. Lower priority than IDENTITY/POSITION providers so the
   * resolver prefers those for general vessel queries; imagery activates
   * only when SATELLITE_IMAGERY capability is explicitly requested.
   */
  priority: 70,
  environment: "both",
  enabled: true,
};

// ─────────────────────────────────────────────────────────────────────
//  SECTION 2: AUTHENTICATION STATE TAXONOMY
// ─────────────────────────────────────────────────────────────────────

/** Officer-facing authentication states — named, never a generic string. */
export type CopernicusAuthState =
  | "AUTHENTICATED"
  | "CREDENTIALS_MISSING"
  | "CREDENTIALS_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REFRESH_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_UNREACHABLE";

export const COPERNICUS_AUTH_MESSAGE: Record<CopernicusAuthState, string> = {
  AUTHENTICATED: "Authenticated with Copernicus Data Space Ecosystem.",
  CREDENTIALS_MISSING:
    "Credentials Missing — set COPERNICUS_USERNAME and COPERNICUS_PASSWORD to activate satellite imagery.",
  CREDENTIALS_INVALID: "Credentials Invalid — CDSE rejected the username/password pair.",
  TOKEN_EXPIRED: "Access Token Expired — automatic refresh will be attempted on the next query.",
  TOKEN_REFRESH_FAILED: "Token Refresh Failed — CDSE did not issue a new token. Check credentials.",
  RATE_LIMITED:
    "Rate Limited — CDSE has throttled this account. Evidence collection will resume when the window resets.",
  PROVIDER_UNREACHABLE:
    "Provider Unreachable — Copernicus Data Space Ecosystem did not answer the probe.",
};

// ─────────────────────────────────────────────────────────────────────
//  SECTION 3: PROVIDER-NATIVE SHAPES
// ─────────────────────────────────────────────────────────────────────

/** CDSE OAuth token response (only consumed fields). */
interface CdseTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/** CDSE STAC feature (only consumed fields). */
export interface CdseStacFeature {
  id?: string;
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
  bbox?: number[];
  properties?: {
    datetime?: string | null;
    start_datetime?: string | null;
    end_datetime?: string | null;
    platform?: string;
    constellation?: string;
    instruments?: string[];
    gsd?: number;
    "eo:cloud_cover"?: number;
    "s2:product_type"?: string;
    "s1:mode"?: string;
    "s1:polarisation"?: string;
    title?: string;
    description?: string;
    license?: string;
    [key: string]: unknown;
  };
  collection?: string;
  links?: Array<{ rel?: string; href?: string; type?: string }>;
  assets?: Record<string, { href?: string; type?: string; title?: string }>;
}

interface CdseStacSearchResponse {
  type?: string;
  features?: CdseStacFeature[];
  numberMatched?: number;
  numberReturned?: number;
}

/** Active token state. */
interface ActiveToken {
  readonly value: string;
  /** Unix epoch seconds when the token expires. */
  readonly expiresAt: number;
}

export interface CopernicusProviderOptions extends ProviderOptions {
  /** Injectable username (tests). Production reads env per call. */
  readonly username?: string | null;
  /** Injectable password (tests). Production reads env per call. */
  readonly password?: string | null;
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 4: PROVIDER IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────

export class CopernicusProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "copernicus-cdse";
  readonly displayName = "Copernicus Data Space Ecosystem (CDSE)";
  readonly provider: ProviderMetadata = COPERNICUS_METADATA;
  readonly projectionContractId = "ial.copernicus-cdse-evidence-provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "ENVIRONMENTAL_INTELLIGENCE",
    "POSITION",
  ];

  private readonly fetchImpl: typeof fetch;
  private readonly injectedUsername: string | null;
  private readonly injectedPassword: string | null;

  /** Current OAuth token. Null until first successful authentication. */
  private token: ActiveToken | null = null;

  /** Reported auth state — never a catch-all "offline". */
  private authState: CopernicusAuthState = "CREDENTIALS_MISSING";

  constructor(opts: CopernicusProviderOptions = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? COPERNICUS_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.injectedUsername = opts.username ?? null;
    this.injectedPassword = opts.password ?? null;
  }

  // ── SECTION 4A: CREDENTIAL RESOLUTION ──────────────────────────────

  /**
   * Read credentials at call time — NEVER at module scope or in the
   * constructor. The edge-function runtime injects env per request;
   * capturing at construction gives a null credential in production.
   */
  private resolveCredentials(): { username: string; password: string } | null {
    const username = this.injectedUsername ?? readProviderCredential(COPERNICUS_CREDENTIAL_ENV[0]);
    const password = this.injectedPassword ?? readProviderCredential(COPERNICUS_CREDENTIAL_ENV[1]);
    if (!username || !password) return null;
    return { username, password };
  }

  // ── SECTION 4B: TOKEN LIFECYCLE ────────────────────────────────────

  /**
   * Returns true when the active token is still usable. We refresh
   * TOKEN_REFRESH_BUFFER_S seconds early to avoid mid-query expiry.
   */
  private tokenIsUsable(): boolean {
    if (!this.token) return false;
    const nowS = Math.floor((this.now ?? Date.now)() / 1_000);
    return this.token.expiresAt - TOKEN_REFRESH_BUFFER_S > nowS;
  }

  /**
   * Fetch a fresh access token via the CDSE Keycloak password grant.
   * Returns the token on success; sets authState and returns null on failure.
   * Never throws — callers treat null as "acquisition blocked".
   */
  private async fetchToken(username: string, password: string): Promise<ActiveToken | null> {
    const body = new URLSearchParams({
      client_id: "cdse-public",
      grant_type: "password",
      username,
      password,
    });
    try {
      const res = await timedFetch(this.fetchImpl, TOKEN_ENDPOINT, TOKEN_TIMEOUT_MS, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (res.status === 429) {
        this.setAuthState("RATE_LIMITED");
        return null;
      }
      const data = (await res.json()) as CdseTokenResponse;
      if (res.status === 401 || res.status === 403 || data.error) {
        // Surface the specific CDSE error when available, otherwise classify
        // as CREDENTIALS_INVALID so the officer knows what to fix.
        const detail = data.error_description ?? data.error ?? `HTTP ${res.status}`;
        this.setAuthState("CREDENTIALS_INVALID", detail);
        return null;
      }
      if (!data.access_token) {
        this.setAuthState("CREDENTIALS_INVALID", "no access_token in response");
        return null;
      }
      const expiresInS = typeof data.expires_in === "number" ? data.expires_in : 600;
      const nowS = Math.floor((this.now ?? Date.now)() / 1_000);
      return { value: data.access_token, expiresAt: nowS + expiresInS };
    } catch (err) {
      this.setAuthState("PROVIDER_UNREACHABLE", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Ensure a usable token is available.
   *
   * Token acquisition path:
   *   1. Cached token still valid → return immediately (no network call).
   *   2. Token absent or expiring → fetch a fresh one.
   *   3. Token fetch fails → set authState, return null.
   */
  private async ensureToken(): Promise<string | null> {
    if (this.tokenIsUsable()) return this.token!.value;

    const creds = this.resolveCredentials();
    if (!creds) {
      this.setAuthState("CREDENTIALS_MISSING");
      return null;
    }
    const newToken = await this.fetchToken(creds.username, creds.password);
    if (!newToken) {
      // authState already set by fetchToken
      return null;
    }
    this.token = newToken;
    this.setAuthState("AUTHENTICATED");
    return newToken.value;
  }

  private setAuthState(state: CopernicusAuthState, detail?: string): void {
    this.authState = state;
    this.authed = state === "AUTHENTICATED";
    this.available = state !== "PROVIDER_UNREACHABLE";
    this.lastError =
      state === "AUTHENTICATED"
        ? null
        : `${COPERNICUS_AUTH_MESSAGE[state]}${detail ? ` (${detail})` : ""}`;
  }

  // ── SECTION 4C: LIFECYCLE (connect / authenticate) ─────────────────

  /**
   * Warm-up: attempt token acquisition. Called by ConnectorManager.warmup().
   * Non-throwing — sets internal state; callers read healthCheck().
   */
  async connect(): Promise<void> {
    await this.ensureToken();
  }

  /**
   * Verify credentials by attempting token acquisition.
   * Returns true only when a usable token exists.
   */
  async authenticate(): Promise<boolean> {
    const token = await this.ensureToken();
    this.authed = token !== null;
    return this.authed;
  }

  // ── SECTION 4D: CACHE KEY ──────────────────────────────────────────

  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({
      text: query.text,
      entityId: query.entity?.id,
      kinds: query.kinds,
    })}`;
  }

  // ── SECTION 4E: SEARCH BUILDING ────────────────────────────────────

  /**
   * Build a STAC search body from the AcquisitionQuery.
   *
   * Coordinate/bbox extraction strategy:
   *   1. If query.text looks like a bbox ("w,s,e,n"), parse it directly.
   *   2. If query.text contains "lat=...,lon=..." extract a point and
   *      create a ±0.05° buffer box (~5 km at the equator).
   *   3. If query.entity is a port, fall back to a maritime-domain bbox
   *      centred on Nigerian waters (default for NIMASA use case).
   *   4. Otherwise, search without spatial constraint (free-text).
   */
  private buildSearchBody(query: AcquisitionQuery): Record<string, unknown> {
    const text = query.text ?? query.entity?.label ?? "";
    const body: Record<string, unknown> = {
      limit: MAX_SCENES,
    };

    // Bounding box: "w,s,e,n"
    const bboxMatch = /^(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)$/.exec(text.trim());
    if (bboxMatch) {
      body.bbox = bboxMatch.slice(1, 5).map(Number);
    } else {
      // lat=6.45,lon=3.38 or lat:6.45 lon:3.38
      const coordMatch = this.extractCoords(text);
      if (coordMatch) {
        const { lat, lon } = coordMatch;
        const buf = 0.05;
        body.bbox = [lon - buf, lat - buf, lon + buf, lat + buf];
      } else if (query.entity?.kind === "port") {
        // Nigerian maritime domain default for NIMASA operations
        body.bbox = [2.5, 3.5, 9.5, 7.5];
      }
    }

    // Collection filter: "collection=SENTINEL-2" or entity label
    const colExplicit = /collection[=:]([A-Z0-9_-]+)/i.exec(text);
    const colSentinel = /sentinel[-_]?([12])/i.exec(text);
    if (colExplicit) {
      body.collections = [colExplicit[1].toUpperCase()];
    } else if (colSentinel) {
      body.collections = [`SENTINEL-${colSentinel[1]}`];
    }

    // Date range: "from=2026-07-01,to=2026-07-27"
    const fromMatch = /from[=:](\d{4}-\d{2}-\d{2})/i.exec(text);
    const toMatch = /to[=:](\d{4}-\d{2}-\d{2})/i.exec(text);
    if (fromMatch || toMatch) {
      const start = fromMatch ? `${fromMatch[1]}T00:00:00Z` : "1970-01-01T00:00:00Z";
      const end = toMatch ? `${toMatch[1]}T23:59:59Z` : new Date().toISOString();
      body.datetime = `${start}/${end}`;
    } else {
      // Default: last 3 days — relevant to maritime operations tempo
      const since = new Date((this.now ?? Date.now)() - 3 * 86_400_000);
      body.datetime = `${since.toISOString()}/..`;
    }

    // Free-text filter when no collection extracted and text is not a bbox/coord string
    if (!body.collections && !bboxMatch) {
      const hasCoordText = this.extractCoords(text) !== null;
      if (!hasCoordText && text.trim().length > 0) {
        body.filter = { op: "like", args: [{ property: "id" }, `%${text.trim()}%`] };
      }
    }

    return body;
  }

  /** Extract lat/lon from "lat=6.45,lon=3.38" or "lat:6.45 lon:3.38" syntax. */
  private extractCoords(text: string): { lat: number; lon: number } | null {
    const latMatch = /lat[=:](-?\d+\.?\d*)/i.exec(text);
    const lonMatch = /lon[=:](-?\d+\.?\d*)/i.exec(text);
    if (latMatch && lonMatch) {
      return { lat: parseFloat(latMatch[1]), lon: parseFloat(lonMatch[1]) };
    }
    return null;
  }

  // ── SECTION 4F: CORE ACQUISITION ───────────────────────────────────

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    const token = await this.ensureToken();
    if (!token) {
      throw new Error(COPERNICUS_AUTH_MESSAGE[this.authState]);
    }

    const searchBody = this.buildSearchBody(query);
    const res = await timedFetch(this.fetchImpl, STAC_SEARCH, SEARCH_TIMEOUT_MS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (res.status === 401 || res.status === 403) {
      // Token may have expired between ensureToken() check and the request.
      this.token = null;
      this.setAuthState("TOKEN_EXPIRED");
      throw new Error(COPERNICUS_AUTH_MESSAGE.TOKEN_EXPIRED);
    }
    if (res.status === 429) {
      this.setAuthState("RATE_LIMITED");
      throw new Error(COPERNICUS_AUTH_MESSAGE.RATE_LIMITED);
    }
    if (res.status >= 500) {
      this.setAuthState("PROVIDER_UNREACHABLE", `HTTP ${res.status}`);
      throw new Error(`${COPERNICUS_AUTH_MESSAGE.PROVIDER_UNREACHABLE} (HTTP ${res.status})`);
    }
    if (res.status !== 200) {
      throw new Error(`Copernicus STAC returned HTTP ${res.status}`);
    }

    const payload = (await res.json()) as CdseStacSearchResponse;
    const records: NormalizedEvidence[] = [];
    for (const feature of payload.features ?? []) {
      const record = this.normalize(feature, query);
      if (record) records.push(record);
    }
    return records;
  }

  // ── SECTION 4G: NORMALISATION ───────────────────────────────────────

  /**
   * Translate one STAC feature into a Seaphore NormalizedEvidence record.
   *
   * Evidence kind: "other" — satellite imagery metadata is a unique
   * observation type. The IFE interprets it as corroborating position
   * or presence evidence; the provider never makes that inference.
   *
   * Grade: CORROBORATED — satellite acquisition is an authoritative
   * government observation (ESA), but imagery metadata alone cannot
   * independently confirm a specific vessel (that requires IFE fusion
   * with AIS or identity evidence).
   */
  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const feature = raw as CdseStacFeature | null | undefined;
    if (!feature || !feature.id) return null;

    const props = feature.properties ?? {};
    const sceneId = feature.id;

    // Acquisition time: prefer datetime, fall back to start_datetime
    const acquisitionTime =
      props.datetime ?? props.start_datetime ?? new Date((this.now ?? Date.now)()).toISOString();

    // Bounding box centroid for the canonical entity id
    const bbox = feature.bbox ?? [];
    const hasCoords = bbox.length === 4;
    const centroidLon = hasCoords ? (bbox[0] + bbox[2]) / 2 : 0;
    const centroidLat = hasCoords ? (bbox[1] + bbox[3]) / 2 : 0;

    // Collection (Sentinel-1, Sentinel-2, …)
    const collection = feature.collection ?? props["s2:product_type"] ?? "UNKNOWN";

    // Platform / instrument
    const platform =
      props.platform ??
      props.constellation ??
      (collection.startsWith("SENTINEL") ? collection : "Copernicus");

    const instruments = Array.isArray(props.instruments)
      ? (props.instruments as string[]).join(", ")
      : null;

    // Thumbnail and browse links — officers can open these without
    // downloading the full product.
    const browseHref =
      Object.values(feature.assets ?? {}).find(
        (a) => a.type?.startsWith("image/") || a.title?.toLowerCase().includes("thumbnail"),
      )?.href ?? null;

    const fields: Record<string, EvidenceFieldValue> = {
      sceneId,
      collection,
      platform,
      instruments,
      acquisitionTime,
      centroidLatitude: hasCoords ? centroidLat : null,
      centroidLongitude: hasCoords ? centroidLon : null,
      bboxWest: hasCoords ? bbox[0] : null,
      bboxSouth: hasCoords ? bbox[1] : null,
      bboxEast: hasCoords ? bbox[2] : null,
      bboxNorth: hasCoords ? bbox[3] : null,
      cloudCover: props["eo:cloud_cover"] ?? null,
      sarMode: props["s1:mode"] ?? null,
      sarPolarisation: props["s1:polarisation"] ?? null,
      groundSamplingDistance: props.gsd ?? null,
      license: props.license ?? "proprietary",
      title: props.title ?? sceneId,
      thumbnailHref: browseHref,
      rawHash: stableHash({ id: sceneId, props }),
    };

    const units: Record<string, string> = {};
    if (hasCoords) {
      units.centroidLatitude = "deg";
      units.centroidLongitude = "deg";
      units.bboxWest = "deg";
      units.bboxSouth = "deg";
      units.bboxEast = "deg";
      units.bboxNorth = "deg";
    }
    if (props.gsd !== undefined) units.groundSamplingDistance = "m";
    if (props["eo:cloud_cover"] !== undefined) units.cloudCover = "%";

    // Canonical entity: the geographic location the scene covers.
    // Represented as a "port" kind because ports are the primary
    // geographic entities in Seaphore's operational domain. The
    // IFE can link satellite evidence to vessel entities via the
    // spatial proximity of their position records.
    const nativeId = hasCoords ? `${centroidLat.toFixed(4)},${centroidLon.toFixed(4)}` : sceneId;

    return normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      grade: "CORROBORATED",
      entity: {
        kind: "port",
        nativeId,
        label: `${platform} scene · ${acquisitionTime.slice(0, 10)}`,
      },
      kind: "other",
      fields,
      units,
      observedAt: acquisitionTime,
      providerRecordId: sceneId,
      excerpt: `${platform} · ${collection} · ${acquisitionTime.slice(0, 10)}${hasCoords ? ` · ${centroidLat.toFixed(2)}°N ${centroidLon.toFixed(2)}°E` : ""}`,
    });
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }

  // ── SECTION 4H: HEALTH CHECK ────────────────────────────────────────

  /**
   * Health probe: test the STAC root (no auth required) for reachability,
   * then report the current auth state. Officers see the specific state,
   * not a generic "offline".
   */
  async healthCheck() {
    try {
      const res = await timedFetch(this.fetchImpl, STAC_ROOT, CONNECT_TIMEOUT_MS, {
        headers: { Accept: "application/json" },
      });
      this.available = res.status < 500;
      if (!this.available) {
        this.setAuthState("PROVIDER_UNREACHABLE", `STAC root HTTP ${res.status}`);
      }
    } catch (err) {
      this.available = false;
      this.setAuthState("PROVIDER_UNREACHABLE", err instanceof Error ? err.message : String(err));
    }

    return super.healthCheck();
  }

  /** Current authentication state, for the Provider Health dashboard. */
  get authenticationState(): CopernicusAuthState {
    return this.authState;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 5: SINGLETON EXPORT
// ─────────────────────────────────────────────────────────────────────

export const copernicusProvider = new CopernicusProvider();

/** Canonical cache TTL re-exported for the catalog. */
export type CopernicusCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type CopernicusProviderResult = ConnectorResult;
