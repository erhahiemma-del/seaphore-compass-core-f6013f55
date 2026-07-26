/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-06 — Global Fishing Watch Evidence Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  AIS-derived vessel identity and activity events (Global Fishing Watch
 *  API v3): encounters, loitering, port visits, gaps in transmission.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → GlobalFishingWatchProvider → EvidencePackage
 *      → IFE → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  ACQUISITION ONLY. The provider reports observed events verbatim: it
 *  never labels behaviour "dark", "suspicious" or "STS transfer", never
 *  scores risk, and never infers intent. Behavioural interpretation
 *  belongs to the IFE/OIE reasoning layers.
 *
 *  Never: persists, resolves identity, dedupes, publishes a UIP, or
 *  modifies IAL / IFE / OIE / OKL / MIBC.
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

const API_BASE = "https://gateway.api.globalfishingwatch.org/v3";
const TIMEOUT_MS = 8_000;
export const GFW_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — AIS activity moves

export const GFW_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  priority: 100,
  environment: "both",
  enabled: true,
};

/** GFW vessel search record (only consumed fields). */
export interface GfwVessel {
  id?: string;
  ssvid?: string;
  imo?: string;
  callsign?: string;
  shipname?: string;
  flag?: string;
  vesselType?: string;
  geartypes?: string[];
  firstTransmissionDate?: string;
  lastTransmissionDate?: string;
}

export class GlobalFishingWatchProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "global-fishing-watch";
  readonly displayName = "Global Fishing Watch";
  readonly provider: ProviderMetadata = GFW_METADATA;
  readonly projectionContractId = "ial.global-fishing-watch-evidence-provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "POSITION",
    "PORT_CALL",
    "IDENTITY",
  ];

  private readonly fetchImpl: typeof fetch;
  private readonly apiToken: string | null;

  constructor(opts: ProviderOptions = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? GFW_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.apiToken = opts.credential ?? readProviderCredential("GFW_API_TOKEN");
  }

  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({ text: query.text, entity: query.entity?.id })}`;
  }

  async connect(): Promise<void> {
    try {
      const res = await timedFetch(
        this.fetchImpl,
        `${API_BASE}/vessels/search?query=test&datasets[0]=public-global-vessel-identity:latest&limit=1`,
        TIMEOUT_MS,
        { headers: this.headers() },
      );
      this.available = res.status < 500;
      this.authed = res.status === 200;
      this.lastError = this.available
        ? res.status === 401 || res.status === 403
          ? "GFW API token missing or rejected (GFW_API_TOKEN)"
          : null
        : `health probe returned ${res.status}`;
    } catch (err) {
      this.available = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  async authenticate(): Promise<boolean> {
    this.authed = this.apiToken !== null;
    if (!this.authed) this.lastError = "GFW API token not configured (GFW_API_TOKEN)";
    return this.authed;
  }

  private headers(): Record<string, string> {
    return this.apiToken
      ? { Authorization: `Bearer ${this.apiToken}`, Accept: "application/json" }
      : { Accept: "application/json" };
  }

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    if (!(await this.authenticate())) {
      throw new Error(
        "Global Fishing Watch API token not configured — no AIS evidence acquired (evidence is never simulated)",
      );
    }
    const term = (query.entity?.label ?? query.text ?? "").trim();
    if (!term) return [];

    const url = new URL(`${API_BASE}/vessels/search`);
    url.searchParams.set("query", term);
    url.searchParams.set("datasets[0]", "public-global-vessel-identity:latest");
    url.searchParams.set("limit", "10");

    const res = await timedFetch(this.fetchImpl, url.toString(), TIMEOUT_MS, {
      headers: this.headers(),
    });
    if (res.status !== 200) throw new Error(`Global Fishing Watch returned ${res.status}`);
    const payload = (await res.json()) as {
      entries?: Array<{ selfReportedInfo?: GfwVessel[]; combinedSourcesInfo?: unknown } & GfwVessel>;
    };
    const out: NormalizedEvidence[] = [];
    for (const entry of payload.entries ?? []) {
      const candidate = entry.selfReportedInfo?.[0] ?? entry;
      const record = this.normalize(candidate, query);
      if (record) out.push(record);
    }
    return out;
  }

  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const vessel = raw as GfwVessel | null | undefined;
    if (!vessel || (!vessel.shipname && !vessel.ssvid && !vessel.imo)) return null;
    const imo = vessel.imo ? String(vessel.imo).replace(/\D/g, "") : null;

    const fields: Record<string, EvidenceFieldValue> = {
      name: vessel.shipname ?? null,
      vesselName: vessel.shipname ?? null,
      imoNumber: imo,
      mmsi: vessel.ssvid ?? null,
      callSign: vessel.callsign ?? null,
      flagState: vessel.flag ?? null,
      vesselType: vessel.vesselType ?? null,
      gearTypes: vessel.geartypes?.length ? vessel.geartypes.join(" | ") : null,
      firstTransmissionDate: vessel.firstTransmissionDate ?? null,
      lastTransmissionDate: vessel.lastTransmissionDate ?? null,
      gfwVesselId: vessel.id ?? null,
      rawHash: stableHash(vessel),
    };

    return normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      // Self-reported AIS identity: reported, not independently verified.
      grade: "REPORTED",
      entity: {
        kind: "vessel",
        nativeId: imo ?? vessel.ssvid ?? vessel.id ?? "unknown",
        label: vessel.shipname,
      },
      kind: "identity",
      fields,
      observedAt: vessel.lastTransmissionDate ?? new Date().toISOString(),
      providerRecordId: vessel.id ?? vessel.ssvid,
      excerpt: `${vessel.shipname ?? "Vessel"}${vessel.ssvid ? ` · MMSI ${vessel.ssvid}` : ""}`,
    });
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }
}

export const globalFishingWatchProvider = new GlobalFishingWatchProvider();

/** The frozen EvidenceCache remains the only cache used by this provider. */
export type GfwCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type GlobalFishingWatchProviderResult = ConnectorResult;
