/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-03 — Equasis Evidence Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Ship particulars, management and classification history from Equasis
 *  (European ship information system).
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → EquasisProvider → EvidencePackage → IFE
 *      → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  HONESTY NOTE — Equasis has no open API: access requires a registered
 *  account. When credentials are absent this provider reports an explicit
 *  acquisition failure. It NEVER fabricates, simulates or infers ship
 *  particulars to fill the gap.
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

const SEARCH_URL = "https://www.equasis.org/EquasisWeb/restricted/Search";
const HOME_URL = "https://www.equasis.org/EquasisWeb/public/HomePage";
const TIMEOUT_MS = 8_000;
export const EQUASIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — particulars are stable

export const EQUASIS_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  priority: 100,
  environment: "both",
  enabled: true,
};

/** Equasis ship particulars, provider-native shape (only consumed fields). */
export interface EquasisShip {
  imo?: string;
  name?: string;
  flag?: string;
  callSign?: string;
  mmsi?: string;
  grossTonnage?: number;
  deadweight?: number;
  yearOfBuild?: number;
  shipType?: string;
  registeredOwner?: string;
  ismManager?: string;
  classificationSociety?: string;
  statusDate?: string;
}

export interface EquasisProviderOptions extends ProviderOptions {
  readonly password?: string | null;
}

export class EquasisProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "equasis";
  readonly displayName = "Equasis";
  readonly provider: ProviderMetadata = EQUASIS_METADATA;
  readonly projectionContractId = "ial.equasis-evidence-provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "IDENTITY",
    "OWNERSHIP",
    "VESSEL_SCREENING",
    "COMPLIANCE",
  ];

  private readonly fetchImpl: typeof fetch;
  private readonly username: string | null;
  private readonly password: string | null;

  constructor(opts: EquasisProviderOptions = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? EQUASIS_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.username = opts.credential ?? readProviderCredential("EQUASIS_USERNAME");
    this.password = opts.password ?? readProviderCredential("EQUASIS_PASSWORD");
  }

  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({ text: query.text, entity: query.entity?.id })}`;
  }

  async connect(): Promise<void> {
    try {
      const res = await timedFetch(this.fetchImpl, HOME_URL, TIMEOUT_MS);
      this.available = res.status < 500;
      this.lastError = this.available ? null : `health probe returned ${res.status}`;
    } catch (err) {
      this.available = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.authed = await this.authenticate();
  }

  async authenticate(): Promise<boolean> {
    this.authed = Boolean(this.username && this.password);
    if (!this.authed) {
      this.lastError = "Equasis credentials not configured (EQUASIS_USERNAME / EQUASIS_PASSWORD)";
    }
    return this.authed;
  }

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    if (!(await this.authenticate())) {
      throw new Error(
        "Equasis credentials not configured — no ship particulars acquired (evidence is never simulated)",
      );
    }
    const term = (query.entity?.label ?? query.text ?? "").trim();
    if (!term) return [];

    const res = await timedFetch(this.fetchImpl, SEARCH_URL, TIMEOUT_MS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        P_ENTREE: term,
        username: this.username ?? "",
        password: this.password ?? "",
      }).toString(),
    });
    if (res.status !== 200) throw new Error(`Equasis returned ${res.status}`);
    const payload = (await res.json()) as { ships?: EquasisShip[] };
    const out: NormalizedEvidence[] = [];
    for (const ship of payload.ships ?? []) {
      const record = this.normalize(ship, query);
      if (record) out.push(record);
    }
    return out;
  }

  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const ship = raw as EquasisShip | null | undefined;
    if (!ship || (!ship.imo && !ship.name)) return null;

    const fields: Record<string, EvidenceFieldValue> = {
      name: ship.name ?? null,
      vesselName: ship.name ?? null,
      imoNumber: ship.imo ? String(ship.imo).replace(/\D/g, "") : null,
      mmsi: ship.mmsi ?? null,
      callSign: ship.callSign ?? null,
      flagState: ship.flag ?? null,
      shipType: ship.shipType ?? null,
      grossTonnage: ship.grossTonnage ?? null,
      deadweightTonnes: ship.deadweight ?? null,
      yearOfBuild: ship.yearOfBuild ?? null,
      registeredOwner: ship.registeredOwner ?? null,
      ismManager: ship.ismManager ?? null,
      classificationSociety: ship.classificationSociety ?? null,
      rawHash: stableHash(ship),
    };

    return normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      grade: "VERIFIED",
      entity: {
        kind: "vessel",
        nativeId: ship.imo ?? ship.name ?? "unknown",
        label: ship.name,
      },
      kind: "identity",
      fields,
      observedAt: ship.statusDate ?? new Date().toISOString(),
      providerRecordId: ship.imo ?? ship.name,
      excerpt: `${ship.name ?? "Vessel"}${ship.imo ? ` · IMO ${ship.imo}` : ""}`,
      units: { grossTonnage: "GT", deadweightTonnes: "t" },
    });
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }
}

export const equasisProvider = new EquasisProvider();

/** The frozen EvidenceCache remains the only cache used by this provider. */
export type EquasisCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type EquasisProviderResult = ConnectorResult;
