/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-01 — OpenSanctions Evidence Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  First PRODUCTION Evidence Provider for Seaphore.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *
 *    Officer Query → IAL → OpenSanctionsConnector → EvidencePackage
 *      → IFE → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  Connector responsibility ENDS at returning validated, normalized
 *  evidence records. This connector therefore does NOT:
 *    • write to Supabase / osint_raw / any table
 *    • resolve identities or deduplicate entities
 *    • create canonical entities or knowledge-graph edges
 *    • create briefings or call registerUip()
 *    • touch IFE / OKL / OIE / MIBC
 *
 *  It reuses the existing framework verbatim:
 *    • `Connector` contract           (src/services/ial/connectors/base.ts)
 *    • `EvidenceCache`                (src/services/ial/cache.ts)
 *    • `normalizeRecord`              (src/services/ial/normalizer.ts)
 *    • `validateRecords`              (src/services/ial/validator.ts)
 *    • `stableHash`                   (src/services/ial/hash.ts)
 * ─────────────────────────────────────────────────────────────────────
 */
import { readFirstProviderCredential } from "./shared/provider-io";
import { EvidenceCache } from "@/services/ial/cache";
import { stableHash } from "@/services/ial/hash";
import { normalizeRecord } from "@/services/ial/normalizer";
import { validateRecords } from "@/services/ial/validator";
import type { Connector, ConnectorCapability } from "@/services/ial/connectors/base";
import { EVIDENCE_PROVIDER_SPEC_VERSION } from "@/connectors/framework/spec";
import type { EvidenceProviderV1, ProviderValidation } from "@/connectors/framework/spec";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  EntityKind,
  EvidenceFieldValue,
  NormalizedEvidence,
} from "@/services/ial/types";

// ───────────────────────────────────────────────────────────────────
//  SECTION 1: METADATA
// ───────────────────────────────────────────────────────────────────

export const OPEN_SANCTIONS_METADATA = {
  id: "open-sanctions",
  name: "OpenSanctions",
  tier: 1,
  entityTypes: ["PERSON", "COMPANY", "VESSEL", "SANCTION"] as const,
  fieldCategories: ["SANCTIONS", "COMPLIANCE"] as const,
  updateFrequency: "daily" as const,
  /**
   * Sprint OPS-01: the hosted OpenSanctions API now rejects anonymous
   * `/search` with HTTP 401 ("No API key provided."). Declaring
   * `requiresAuth: false` was the second defect behind the offline
   * report — it hid a credential requirement from the officer.
   */
  requiresAuth: true,
} as const;

/**
 * Sprint OPS-01 — endpoint correction.
 *
 * The previous base was `https://api.opensanctions.org/v3`, which the
 * upstream (yente) service answers with HTTP 404 on EVERY path,
 * including the health probe. The hosted API is unversioned: the health
 * endpoint is `/healthz` and search is `/search/{dataset}`. That 404 on
 * the probe is what pinned the provider at "Provider Offline" even
 * though DNS, TLS and the host were all reachable.
 */
const API_BASE = "https://api.opensanctions.org";
const HEALTH_PATH = "/healthz";
const SEARCH_DATASET = "default";
/** Credential variable, matching the catalog declaration. */
const CREDENTIAL_ENV = ["OPENSANCTIONS_API_KEY"] as const;
const CONNECT_TIMEOUT_MS = 5_000;
const SEARCH_TIMEOUT_MS = 5_000;

/**
 * Sprint OPS-01 — connectivity failure taxonomy.
 *
 * The officer is told which of these is true; "Provider Offline" is
 * never used as a catch-all for problems it does not describe.
 */
export type OpenSanctionsFailureClass =
  | "OPERATIONAL"
  | "CONFIGURATION_ERROR"
  | "NETWORK_DNS"
  | "TIMEOUT"
  | "API_UNAVAILABLE"
  | "RATE_LIMITED"
  | "ENVIRONMENT_RESTRICTION"
  | "INVALID_ENDPOINT";

export const OPEN_SANCTIONS_FAILURE_LABEL: Record<OpenSanctionsFailureClass, string> = {
  OPERATIONAL: "Operational",
  CONFIGURATION_ERROR: "Configuration Error",
  NETWORK_DNS: "Network / DNS",
  TIMEOUT: "Timeout",
  API_UNAVAILABLE: "API Unavailable",
  RATE_LIMITED: "Rate Limited",
  ENVIRONMENT_RESTRICTION: "Environment Restriction",
  INVALID_ENDPOINT: "Invalid Endpoint",
};

/** Map an HTTP status from the upstream to a root cause. */
export function classifyHttpStatus(status: number): OpenSanctionsFailureClass {
  if (status === 200) return "OPERATIONAL";
  if (status === 401 || status === 403) return "CONFIGURATION_ERROR";
  if (status === 404) return "INVALID_ENDPOINT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "API_UNAVAILABLE";
  return "API_UNAVAILABLE";
}

/** Map a thrown transport error to a root cause. */
export function classifyTransportError(err: unknown): OpenSanctionsFailureClass {
  const msg = describe(err).toLowerCase();
  if (/abort|timed? ?out|timeout|deadline/.test(msg)) return "TIMEOUT";
  if (/enotfound|eai_again|dns|getaddrinfo|name not resolved/.test(msg)) return "NETWORK_DNS";
  if (/econnrefused|econnreset|network|socket|tls|certificate|ssl|fetch failed/.test(msg)) {
    return "NETWORK_DNS";
  }
  if (/blocked|not allowed|disallowed|egress|proxy|forbidden by policy/.test(msg)) {
    return "ENVIRONMENT_RESTRICTION";
  }
  return "API_UNAVAILABLE";
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** OpenSanctions schema names, keyed by Seaphore entity kind. */
const SCHEMA_BY_KIND: Partial<Record<EntityKind, string>> = {
  vessel: "Vessel",
  company: "Company",
  person: "Person",
};

/** Reverse map — OpenSanctions schema → Seaphore canonical entity kind. */
function kindFromSchema(schema: string | undefined, fallback: EntityKind): EntityKind {
  switch (String(schema ?? "").toLowerCase()) {
    case "vessel":
    case "airplane":
      return "vessel";
    case "person":
      return "person";

    case "company":
    case "organization":
    case "legalentity":
    case "publicbody":
      return "company";
    default:
      return fallback;
  }
}

/** OpenSanctions `/search` response envelope (only fields we consume). */
export interface OpenSanctionsEntity {
  id?: string;
  caption?: string;
  schema?: string;
  score?: number;
  first_seen?: string;
  last_seen?: string;
  last_change?: string;
  datasets?: string[];
  properties?: Record<string, unknown>;
}

export interface OpenSanctionsSearchResponse {
  results?: OpenSanctionsEntity[];
  total?: { value?: number } | number;
}

export interface OpenSanctionsConnectorOptions {
  /** Injectable fetch — tests pass a stub; production uses global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable cache — defaults to a connector-local 24h EvidenceCache. */
  readonly cache?: EvidenceCache;
  /** Injectable clock for deterministic cache-expiry tests. */
  readonly clock?: () => number;
}

// ───────────────────────────────────────────────────────────────────
//  SECTION 2: CONNECTOR
// ───────────────────────────────────────────────────────────────────

export class OpenSanctionsConnector implements Connector, EvidenceProviderV1 {
  /**
   * Sprint PF-01 — reference implementation of Evidence Provider
   * Specification v1.0. Every future provider mirrors these three
   * declarations plus the frozen five-method API.
   */
  readonly specVersion = EVIDENCE_PROVIDER_SPEC_VERSION;
  /** Officer-facing projection declared in the Projection Contract. */
  readonly projectionContractId = "ial.opensanctions-evidence-provider";

  /** Spec v1.0 validation entry point — flags, never drops. */
  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }

  readonly id: ConnectorId = OPEN_SANCTIONS_METADATA.id;

  /** Sprint EP-01A — live provider metadata used by the Provider Resolver. */
  readonly provider = {
    providerType: "LIVE" as const,
    priority: 100,
    environment: "both" as const,
    enabled: true,
  };
  readonly displayName = OPEN_SANCTIONS_METADATA.name;
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "SANCTIONS",
    "VESSEL_SCREENING",
    "COMPANY_SCREENING",
    "PERSON_SCREENING",
    "COMPLIANCE",
  ];
  /** Declared for `ConnectorRegistry.getByEntityType`. */
  readonly entityKinds: ReadonlyArray<EntityKind> = ["vessel", "company", "person"];

  private readonly fetchImpl: typeof fetch;
  private readonly cache: EvidenceCache;
  private readonly now: () => number;
  private available = true;
  private authed = false;
  /** Most recent classified root cause — surfaced in Provider Health. */
  private failureClass: OpenSanctionsFailureClass = "OPERATIONAL";
  private lastError: string | null = null;
  private lastSuccessAt: string | null = null;
  private latencies: number[] = [];
  private calls = 0;
  private failures = 0;

  constructor(opts: OpenSanctionsConnectorOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.now = opts.clock ?? Date.now;
    this.cache =
      opts.cache ??
      new EvidenceCache({ defaultTtlMs: CACHE_TTL_MS, clock: this.now });
  }

  // ─── connect() ────────────────────────────────────────────────────
  // GET https://api.opensanctions.org/v3/ with a 5s timeout.
  // true → HTTP 200 · false → timeout / network failure / non-200.

  async connect(): Promise<void> {
    this.available = await this.probe();
  }

  async authenticate(): Promise<boolean> {
    // Reachability first: an unreachable host is not a credential fault.
    const reachable = await this.probe();
    this.available = reachable;
    if (!reachable) {
      this.authed = false;
      return false;
    }
    // The hosted search API requires a key. Absence is a Configuration
    // Error the officer must see, not a silent "offline".
    const key = this.resolveKey();
    if (!key) {
      this.authed = false;
      this.failureClass = "CONFIGURATION_ERROR";
      this.lastError =
        "Configuration Error — Credentials Missing: set OPENSANCTIONS_API_KEY to enable sanctions screening.";
      return false;
    }
    this.authed = true;
    this.failureClass = "OPERATIONAL";
    this.lastError = null;
    return true;
  }

  /** Resolve the API key at call time — env is injected per request. */
  private resolveKey(): string | null {
    return readFirstProviderCredential(CREDENTIAL_ENV)?.value ?? null;
  }

  private headers(): Record<string, string> {
    const key = this.resolveKey();
    return key
      ? { Accept: "application/json", Authorization: `ApiKey ${key}` }
      : { Accept: "application/json" };
  }

  /**
   * Reachability probe against the unversioned health endpoint.
   * Records the precise root cause rather than a generic failure.
   */
  private async probe(): Promise<boolean> {
    try {
      const res = await this.withTimeout(
        (signal) =>
          this.fetchImpl(`${API_BASE}${HEALTH_PATH}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal,
          }),
        CONNECT_TIMEOUT_MS,
      );
      const cls = classifyHttpStatus(res.status);
      this.failureClass = cls;
      if (cls === "OPERATIONAL") {
        this.lastError = null;
        return true;
      }
      this.lastError = `${OPEN_SANCTIONS_FAILURE_LABEL[cls]} — health probe ${API_BASE}${HEALTH_PATH} returned HTTP ${res.status}.`;
      // A 401 on the probe means the host answered: reachable, but
      // misconfigured. Reachability and authentication stay separate.
      return cls === "CONFIGURATION_ERROR";
    } catch (err) {
      const cls = classifyTransportError(err);
      this.failureClass = cls;
      this.lastError = `${OPEN_SANCTIONS_FAILURE_LABEL[cls]} — ${describe(err)}`;
      return false;
    }
  }

  // ─── search() ─────────────────────────────────────────────────────

  async search(query: AcquisitionQuery): Promise<ConnectorResult> {
    const started = this.now();
    const term = (query.entity?.label ?? query.text ?? "").trim();
    if (!term) {
      return { connectorId: this.id, ok: true, records: [], latencyMs: 0 };
    }

    const kind: EntityKind = query.entity?.kind ?? inferKind(term);
    const schema = SCHEMA_BY_KIND[kind] ?? "Thing";
    const cacheKey = this.cacheKey(term, schema);

    // 1 — cache lookup (24h TTL). A hit avoids the API call entirely.
    if (!query.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // 2 — live call
    let payload: unknown;
    try {
      const url = new URL(`${API_BASE}/search/${SEARCH_DATASET}`);
      url.searchParams.set("q", term);
      url.searchParams.set("schema", schema);
      const res = await this.withTimeout(
        (signal) =>
          this.fetchImpl(url.toString(), {
            method: "GET",
            headers: this.headers(),
            signal,
          }),
        SEARCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        const cls = classifyHttpStatus(res.status);
        this.failureClass = cls;
        const hint =
          cls === "CONFIGURATION_ERROR"
            ? this.resolveKey()
              ? " Credentials Invalid — OPENSANCTIONS_API_KEY was rejected."
              : " Credentials Missing — set OPENSANCTIONS_API_KEY."
            : "";
        return this.fail(
          `${OPEN_SANCTIONS_FAILURE_LABEL[cls]} — OpenSanctions returned HTTP ${res.status}.${hint}`,
          started,
        );
      }
      this.failureClass = "OPERATIONAL";
      payload = await res.json();
    } catch (err) {
      // Timeout, network failure, or malformed JSON — all surface as a
      // clean, non-throwing failed ConnectorResult, classified.
      const cls = classifyTransportError(err);
      this.failureClass = cls;
      return this.fail(`${OPEN_SANCTIONS_FAILURE_LABEL[cls]} — ${describe(err)}`, started);
    }

    // 3 — normalize
    let records: NormalizedEvidence[];
    try {
      records = this.normalizeResponse(payload, term, kind);
    } catch (err) {
      return this.fail(`malformed OpenSanctions payload: ${describe(err)}`, started);
    }

    // 4 — validate with the existing framework validator (flags, never drops)
    validateRecords(records);

    const result: ConnectorResult = {
      connectorId: this.id,
      ok: true,
      records,
      latencyMs: Math.max(0, Math.round(this.now() - started)),
    };

    // 5 — cache for 24 hours
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    this.record(true, result.latencyMs);
    return result;
  }

  /** Exact lookup shares the search endpoint — OpenSanctions resolves
   *  identifiers (IMO, registration numbers) inside `q`. */
  async lookup(query: AcquisitionQuery): Promise<ConnectorResult> {
    return this.search(query);
  }

  // ─── normalize(raw) ───────────────────────────────────────────────
  // Normalization ONLY — no enrichment, no merging, no dedupe.

  normalize(raw: unknown, query: AcquisitionQuery): NormalizedEvidence | null {
    const entity = raw as OpenSanctionsEntity | null;
    if (!entity || typeof entity !== "object") return null;

    const props = (entity.properties ?? {}) as Record<string, unknown>;
    const entityName =
      entity.caption ?? firstString(props["name"]) ?? query.entity?.label ?? query.text ?? "";
    if (!entityName) return null;

    const fallbackKind: EntityKind = query.entity?.kind ?? inferKind(entityName);
    const entityType = kindFromSchema(entity.schema, fallbackKind);

    const aliases = stringList(props["alias"]).concat(stringList(props["weakAlias"]));
    const countries = stringList(props["country"]).concat(stringList(props["jurisdiction"]));
    const sanctionLists = uniq(
      (entity.datasets ?? []).map(String).concat(stringList(props["authority"])),
    );
    const sanctionPrograms = uniq(
      stringList(props["program"]).concat(stringList(props["sanctionProgram"])),
    );
    const imoNumber = normalizeImo(props["imoNumber"] ?? props["imo"]);
    const startDate = firstString(props["startDate"]) ?? entity.first_seen ?? null;
    const endDate = firstString(props["endDate"]) ?? null;
    const lastUpdated =
      entity.last_change ?? entity.last_seen ?? new Date(this.now()).toISOString();
    const confidence = clamp01(
      typeof entity.score === "number" ? entity.score : 0.75,
    );
    const evidenceUrl = entity.id
      ? `https://www.opensanctions.org/entities/${entity.id}/`
      : "https://www.opensanctions.org/";

    const nativeId = imoNumber ?? entity.id ?? entityName;
    const rawPayload = entity as unknown as Record<string, unknown>;

    const fields: Record<string, EvidenceFieldValue> = {
      entityId: entity.id ?? "",
      entityType,
      entityName,
      name: entityName,
      aliases,
      countries,
      sanctionLists,
      sanctionPrograms,
      // Validator compatibility for kind === "sanctions".
      listName: sanctionLists[0] ?? "OpenSanctions",
      imoNumber: imoNumber ?? null,
      startDate,
      endDate,
      lastUpdated,
      confidence,
      source: OPEN_SANCTIONS_METADATA.name,
      evidenceUrl,
      rawHash: stableHash(rawPayload),
      match: sanctionLists.length > 0 ? "positive" : "unresolved",
    };

    const record = normalizeRecord({
      source: this.id,
      sourceName: OPEN_SANCTIONS_METADATA.name,
      grade: "CORROBORATED",
      entity: { kind: entityType, nativeId, label: entityName },
      kind: "sanctions",
      fields,
      observedAt: safeDate(lastUpdated, this.now()),
      providerRecordId: entity.id,
      excerpt:
        sanctionLists.length > 0
          ? `Listed on ${sanctionLists.slice(0, 3).join(", ")}`
          : `No listing found for ${entityName}`,
    });

    // rawPayload travels alongside the normalized record for the
    // Evidence Explorer; it is never merged into normalized fields.
    return Object.assign({}, record, { rawPayload }) as NormalizedEvidence;
  }

  private normalizeResponse(
    payload: unknown,
    term: string,
    kind: EntityKind,
  ): NormalizedEvidence[] {
    if (!payload || typeof payload !== "object") {
      throw new Error("response body is not an object");
    }
    const body = payload as OpenSanctionsSearchResponse;
    const results = Array.isArray(body.results) ? body.results : [];
    const query: AcquisitionQuery = { text: term, kinds: ["sanctions"] };
    const out: NormalizedEvidence[] = [];
    for (const item of results) {
      const rec = this.normalize(item, { ...query, entity: undefined });
      if (rec) out.push(rec);
    }
    // Empty API response → empty package. No synthetic "no match" record
    // is fabricated: absent evidence is reported as absent.
    void kind;
    return out;
  }

  // ─── healthCheck() ────────────────────────────────────────────────

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      connectorId: this.id,
      available: this.available,
      authenticated: this.authed,
      latencyMsP50: p50(this.latencies),
      failureRate: this.calls === 0 ? 0 : this.failures / this.calls,
      quotaRemaining: null,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  /** Officer-facing root cause from the most recent probe or call. */
  get rootCause(): OpenSanctionsFailureClass {
    return this.failureClass;
  }

  // ─── internals ────────────────────────────────────────────────────

  private cacheKey(term: string, schema: string): string {
    return `open-sanctions:${schema}:${term.toLowerCase()}`;
  }

  private fail(error: string, started: number): ConnectorResult {
    const latencyMs = Math.max(0, Math.round(this.now() - started));
    this.lastError = error;
    this.record(false, latencyMs);
    return { connectorId: this.id, ok: false, records: [], error, latencyMs };
  }

  private record(ok: boolean, latencyMs: number): void {
    this.calls += 1;
    if (!ok) this.failures += 1;
    else this.lastSuccessAt = new Date(this.now()).toISOString();
    this.latencies = [...this.latencies.slice(-49), latencyMs];
  }

  private async withTimeout(
    call: (signal: AbortSignal) => Promise<Response>,
    ms: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await call(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ───────────────────────────────────────────────────────────────────
//  helpers
// ───────────────────────────────────────────────────────────────────

function inferKind(name: string): EntityKind {
  if (/\bMV\b|\bM\/V\b|\bIMO\s*\d{7}\b/i.test(name)) return "vessel";
  return "company";
}

function stringList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  return [String(value)].filter(Boolean);
}

function firstString(value: unknown): string | null {
  const list = stringList(value);
  return list.length > 0 ? list[0] : null;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeImo(value: unknown): string | null {
  const raw = firstString(value);
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits.length === 7 ? digits : null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function safeDate(value: string | null | undefined, fallbackMs: number): Date {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed) : new Date(fallbackMs);
}

function p50(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "AbortError" ? "timeout" : err.message;
  }
  return String(err);
}

/** Shared singleton — registered via `src/connectors/index.ts`. */
export const openSanctionsConnector = new OpenSanctionsConnector();
