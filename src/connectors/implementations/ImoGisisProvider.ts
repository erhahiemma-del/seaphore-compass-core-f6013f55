/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-04 — IMO GISIS Evidence Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Global Integrated Shipping Information System (IMO) — ship registry
 *  identity, flag history and company (SHIP/COMPANY) particulars.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → ImoGisisProvider → EvidencePackage → IFE
 *      → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  HONESTY NOTE — GISIS public modules require an IMO Web Account. With
 *  no credentials configured this provider reports an explicit
 *  acquisition failure; it never fabricates registry data.
 *
 *  Never: persists, resolves identity, dedupes, scores risk, publishes a
 *  UIP, or modifies IAL / IFE / OIE / OKL / MIBC.
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

const GISIS_BASE = "https://gisis.imo.org";
const SEARCH_PATH = "/Public/SHIPS/Search.aspx";
const TIMEOUT_MS = 8_000;
export const IMO_GISIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d — registry particulars

export const IMO_GISIS_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  // Equasis is the primary IDENTITY provider; GISIS is the registry fallback.
  priority: 90,
  environment: "both",
  enabled: true,
};

/** GISIS ship record, provider-native shape (only consumed fields). */
export interface GisisShip {
  imoNumber?: string | number;
  shipName?: string;
  formerNames?: string[];
  flag?: string;
  flagDate?: string;
  shipType?: string;
  grossTonnage?: number;
  yearOfBuild?: number;
  registeredOwner?: string;
  operator?: string;
  status?: string;
  recordUpdated?: string;
}

export class ImoGisisProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "imo-gisis";
  readonly displayName = "IMO GISIS";
  readonly provider: ProviderMetadata = IMO_GISIS_METADATA;
  readonly projectionContractId = "ial.imo-gisis-evidence-provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "IDENTITY",
    "OWNERSHIP",
    "COMPLIANCE",
  ];

  private readonly fetchImpl: typeof fetch;
  private readonly account: string | null;

  constructor(opts: ProviderOptions = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? IMO_GISIS_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.account = opts.credential ?? readProviderCredential("IMO_GISIS_API_TOKEN");
  }

  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({ text: query.text, entity: query.entity?.id })}`;
  }

  async connect(): Promise<void> {
    try {
      const res = await timedFetch(this.fetchImpl, `${GISIS_BASE}${SEARCH_PATH}`, TIMEOUT_MS);
      this.available = res.status < 500;
      this.lastError = this.available ? null : `health probe returned ${res.status}`;
    } catch (err) {
      this.available = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.authed = await this.authenticate();
  }

  async authenticate(): Promise<boolean> {
    this.authed = this.account !== null;
    if (!this.authed) {
      this.lastError = "IMO GISIS access token not configured (IMO_GISIS_API_TOKEN)";
    }
    return this.authed;
  }

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    if (!(await this.authenticate())) {
      throw new Error(
        "IMO GISIS access token not configured — no registry evidence acquired (evidence is never simulated)",
      );
    }
    const term = (query.entity?.label ?? query.text ?? "").trim();
    if (!term) return [];

    const url = new URL(`${GISIS_BASE}${SEARCH_PATH}`);
    url.searchParams.set("q", term);
    const res = await timedFetch(this.fetchImpl, url.toString(), TIMEOUT_MS, {
      headers: { Authorization: `Bearer ${this.account}`, Accept: "application/json" },
    });
    if (res.status !== 200) throw new Error(`IMO GISIS returned ${res.status}`);
    const payload = (await res.json()) as { ships?: GisisShip[] };
    const out: NormalizedEvidence[] = [];
    for (const ship of payload.ships ?? []) {
      const record = this.normalize(ship, query);
      if (record) out.push(record);
    }
    return out;
  }

  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const ship = raw as GisisShip | null | undefined;
    if (!ship || (!ship.imoNumber && !ship.shipName)) return null;
    const imo = ship.imoNumber ? String(ship.imoNumber).replace(/\D/g, "") : null;

    const fields: Record<string, EvidenceFieldValue> = {
      name: ship.shipName ?? null,
      vesselName: ship.shipName ?? null,
      imoNumber: imo,
      formerNames: ship.formerNames?.length ? ship.formerNames.join(" | ") : null,
      flagState: ship.flag ?? null,
      flagRegistrationDate: ship.flagDate ?? null,
      shipType: ship.shipType ?? null,
      grossTonnage: ship.grossTonnage ?? null,
      yearOfBuild: ship.yearOfBuild ?? null,
      registeredOwner: ship.registeredOwner ?? null,
      operator: ship.operator ?? null,
      registryStatus: ship.status ?? null,
      rawHash: stableHash(ship),
    };

    return normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      grade: "VERIFIED",
      entity: {
        kind: "vessel",
        nativeId: imo ?? ship.shipName ?? "unknown",
        label: ship.shipName,
      },
      kind: "identity",
      fields,
      observedAt: ship.recordUpdated ?? new Date().toISOString(),
      providerRecordId: imo ?? ship.shipName,
      excerpt: `${ship.shipName ?? "Vessel"}${imo ? ` · IMO ${imo}` : ""}`,
      units: { grossTonnage: "GT" },
    });
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }
}

export const imoGisisProvider = new ImoGisisProvider();

/** The frozen EvidenceCache remains the only cache used by this provider. */
export type ImoGisisCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type ImoGisisProviderResult = ConnectorResult;
