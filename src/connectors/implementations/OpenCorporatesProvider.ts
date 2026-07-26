/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-02 — OpenCorporates Evidence Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Corporate registry evidence (company identity + officers) for
 *  ownership transparency work.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → OpenCorporatesProvider → EvidencePackage
 *      → IFE → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  Evidence Provider Specification v1.0. Extends BaseEvidenceProvider,
 *  so cache handling, result envelopes, metrics and health reporting are
 *  the frozen platform implementations — not re-implemented here.
 *
 *  This provider NEVER: writes to the database, resolves identities,
 *  dedupes entities, scores risk, publishes a UIP, or touches IFE / OKL
 *  / OIE / MIBC. It acquires, normalizes and flags. Nothing else.
 * ─────────────────────────────────────────────────────────────────────
 */
import { BaseEvidenceProvider } from "@/connectors/framework/BaseEvidenceProvider";
import type { ProviderValidation } from "@/connectors/framework/spec";
import { EvidenceCache } from "@/services/ial/cache";
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

const API_BASE = "https://api.opencorporates.com/v0.4";
const TIMEOUT_MS = 6_000;
export const OPENCORPORATES_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h — registries change slowly

export const OPENCORPORATES_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  priority: 100,
  environment: "both",
  enabled: true,
};

/** OpenCorporates `/companies/search` shape (only consumed fields). */
export interface OpenCorporatesCompany {
  name?: string;
  company_number?: string;
  jurisdiction_code?: string;
  company_type?: string;
  current_status?: string;
  incorporation_date?: string;
  dissolution_date?: string;
  registered_address_in_full?: string;
  opencorporates_url?: string;
  updated_at?: string;
  inactive?: boolean;
}

export class OpenCorporatesProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "opencorporates";
  readonly displayName = "OpenCorporates";
  readonly provider: ProviderMetadata = OPENCORPORATES_METADATA;
  readonly projectionContractId = "ial.opencorporates-evidence-provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "OWNERSHIP",
    "COMPANY_SCREENING",
    "IDENTITY",
  ];

  private readonly fetchImpl: typeof fetch;
  private readonly apiToken: string | null;

  constructor(opts: ProviderOptions = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? OPENCORPORATES_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.apiToken = opts.credential ?? readProviderCredential("OPENCORPORATES_API_TOKEN");
  }

  /** Deterministic cache key over the query (frozen EvidenceCache). */
  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({ text: query.text, entity: query.entity?.id })}`;
  }

  async connect(): Promise<void> {
    try {
      const res = await timedFetch(
        this.fetchImpl,
        `${API_BASE}/companies/search?q=test&per_page=1`,
        TIMEOUT_MS,
      );
      // 401/403 = reachable but token-gated: available, not authenticated.
      this.available = res.status < 500;
      this.authed = res.status === 200;
      this.lastError = this.available ? null : `health probe returned ${res.status}`;
    } catch (err) {
      this.available = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  async authenticate(): Promise<boolean> {
    // The open API tier is keyless but rate-limited; a token raises limits.
    this.authed = this.apiToken !== null;
    return this.authed;
  }

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    const term = (query.entity?.label ?? query.text ?? "").trim();
    if (!term) return [];
    const url = new URL(`${API_BASE}/companies/search`);
    url.searchParams.set("q", term);
    url.searchParams.set("per_page", "10");
    if (this.apiToken) url.searchParams.set("api_token", this.apiToken);

    const res = await timedFetch(this.fetchImpl, url.toString(), TIMEOUT_MS);
    if (res.status !== 200) throw new Error(`OpenCorporates returned ${res.status}`);
    const body = (await res.json()) as {
      results?: { companies?: Array<{ company?: OpenCorporatesCompany }> };
    };
    const companies = body.results?.companies ?? [];
    const out: NormalizedEvidence[] = [];
    for (const wrapper of companies) {
      const record = this.normalize(wrapper.company, query);
      if (record) out.push(record);
    }
    return out;
  }

  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const company = raw as OpenCorporatesCompany | null | undefined;
    if (!company || !company.name) return null;
    const nativeId =
      company.jurisdiction_code && company.company_number
        ? `${company.jurisdiction_code}-${company.company_number}`
        : company.name;

    const fields: Record<string, EvidenceFieldValue> = {
      // `name`/`ownerName` are the canonical validator field names.
      name: company.name,
      ownerName: company.name,
      companyName: company.name,
      companyNumber: company.company_number ?? null,
      jurisdiction: company.jurisdiction_code?.toUpperCase() ?? null,
      companyType: company.company_type ?? null,
      status: company.current_status ?? null,
      incorporationDate: company.incorporation_date ?? null,
      dissolutionDate: company.dissolution_date ?? null,
      registeredAddress: company.registered_address_in_full ?? null,
      inactive: company.inactive ?? null,
      evidenceUrl: company.opencorporates_url ?? null,
      rawHash: stableHash(company),
    };

    return normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      // Registry filings are an official record of what was reported.
      grade: "REPORTED",
      entity: { kind: "company", nativeId, label: company.name },
      kind: "ownership",
      fields,
      observedAt: company.updated_at ?? company.incorporation_date ?? new Date().toISOString(),
      providerRecordId: nativeId,
      excerpt: `${company.name}${company.jurisdiction_code ? ` · ${company.jurisdiction_code.toUpperCase()}` : ""}`,
    });
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }
}

/** Shared singleton registered through the Provider Resolver. */
export const openCorporatesProvider = new OpenCorporatesProvider();

/** Cache type re-export so the frozen EvidenceCache stays the only cache. */
export type OpenCorporatesCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type OpenCorporatesProviderResult = ConnectorResult;
