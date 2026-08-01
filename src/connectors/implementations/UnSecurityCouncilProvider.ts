/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-08 — UN Security Council Evidence Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  UN Security Council Consolidated Sanctions List — the multilateral
 *  primary-source designation record, acquired from the UN's published
 *  consolidated XML export (keyless, no account).
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → UnSecurityCouncilProvider → EvidencePackage
 *      → IFE → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  OpenSanctions stays the resolved SANCTIONS provider (priority 100);
 *  this provider registers at priority 80 as a primary-source
 *  corroborator, so Provider Resolution is unchanged.
 *
 *  ACQUISITION ONLY: designations are reported verbatim (committee,
 *  reference, listing date). No risk scoring, no match assertion, no
 *  identity resolution — those belong to IFE/OIE.
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
import {
  extractAll,
  extractOne,
  timedFetch,
  xmlBlocks,
  type ProviderOptions,
} from "./shared/provider-io";

const CONSOLIDATED_XML_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const TIMEOUT_MS = 20_000;
const MAX_RESULTS = 10;
export const UNSC_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — list updates are infrequent

export const UNSC_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  priority: 80,
  environment: "both",
  enabled: true,
};

/** One UN consolidated-list designation (only consumed fields). */
export interface UnScDesignation {
  dataid?: string;
  name?: string;
  entityKind?: "individual" | "entity";
  unListType?: string | null;
  referenceNumber?: string | null;
  listedOn?: string | null;
  comments?: string | null;
  aliases?: string[];
  nationalities?: string[];
  committee?: string | null;
}

export class UnSecurityCouncilProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "un-security-council";
  readonly displayName = "UN Security Council Consolidated List";
  readonly provider: ProviderMetadata = UNSC_METADATA;
  readonly projectionContractId = "ial.un-security-council-evidence-provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "SANCTIONS",
    "PERSON_SCREENING",
    "COMPANY_SCREENING",
  ];

  private readonly fetchImpl: typeof fetch;

  constructor(opts: ProviderOptions = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? UNSC_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({ text: query.text, entity: query.entity?.id })}`;
  }

  async connect(): Promise<void> {
    try {
      const res = await timedFetch(this.fetchImpl, CONSOLIDATED_XML_URL, TIMEOUT_MS, {
        method: "HEAD",
      });
      this.available = res.status < 500;
      this.lastError = this.available ? null : `health probe returned ${res.status}`;
    } catch (err) {
      this.available = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.authed = true; // The UN export is public — no credential exists.
  }

  async authenticate(): Promise<boolean> {
    this.authed = true;
    return true;
  }

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    const term = (query.entity?.label ?? query.text ?? "").trim();
    if (!term) return [];

    const res = await timedFetch(this.fetchImpl, CONSOLIDATED_XML_URL, TIMEOUT_MS, {
      headers: { Accept: "application/xml" },
    });
    if (res.status !== 200) throw new Error(`UN consolidated list returned ${res.status}`);
    const xml = await res.text();
    const needle = term.toLowerCase();

    const out: NormalizedEvidence[] = [];
    for (const kind of ["INDIVIDUAL", "ENTITY"] as const) {
      for (const block of xmlBlocks(xml, kind)) {
        if (!block.toLowerCase().includes(needle)) continue;
        const record = this.normalize(this.parseDesignation(block, kind), query);
        if (record) out.push(record);
        if (out.length >= MAX_RESULTS) return out;
      }
    }
    return out;
  }

  /** Provider-native parse of one designation — no interpretation applied. */
  private parseDesignation(block: string, kind: "INDIVIDUAL" | "ENTITY"): UnScDesignation {
    const parts = [
      extractOne(block, /<FIRST_NAME>([\s\S]*?)<\/FIRST_NAME>/),
      extractOne(block, /<SECOND_NAME>([\s\S]*?)<\/SECOND_NAME>/),
      extractOne(block, /<THIRD_NAME>([\s\S]*?)<\/THIRD_NAME>/),
      extractOne(block, /<FOURTH_NAME>([\s\S]*?)<\/FOURTH_NAME>/),
    ].filter(Boolean);
    return {
      dataid: extractOne(block, /<DATAID>([\s\S]*?)<\/DATAID>/) ?? undefined,
      name: parts.length ? parts.join(" ") : undefined,
      entityKind: kind === "INDIVIDUAL" ? "individual" : "entity",
      unListType: extractOne(block, /<UN_LIST_TYPE>([\s\S]*?)<\/UN_LIST_TYPE>/),
      referenceNumber: extractOne(block, /<REFERENCE_NUMBER>([\s\S]*?)<\/REFERENCE_NUMBER>/),
      listedOn: extractOne(block, /<LISTED_ON>([\s\S]*?)<\/LISTED_ON>/),
      comments: extractOne(block, /<COMMENTS1>([\s\S]*?)<\/COMMENTS1>/),
      aliases: extractAll(block, /<ALIAS_NAME>([\s\S]*?)<\/ALIAS_NAME>/g),
      nationalities: extractAll(block, /<NATIONALITY>[\s\S]*?<VALUE>([\s\S]*?)<\/VALUE>/g),
      committee: extractOne(block, /<COMMITTEE>([\s\S]*?)<\/COMMITTEE>/),
    };
  }

  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const designation = raw as UnScDesignation | null | undefined;
    if (!designation || !designation.name) return null;

    const fields: Record<string, EvidenceFieldValue> = {
      name: designation.name,
      entityName: designation.name,
      listName: "UN Security Council Consolidated List",
      sanctionLists: "UN Security Council Consolidated List",
      sanctionPrograms: designation.unListType ?? null,
      unReferenceNumber: designation.referenceNumber ?? null,
      committee: designation.committee ?? null,
      startDate: designation.listedOn ?? null,
      aliases: designation.aliases?.length ? designation.aliases.join(" | ") : null,
      countries: designation.nationalities?.length ? designation.nationalities.join(" | ") : null,
      remarks: designation.comments ?? null,
      evidenceUrl: "https://www.un.org/securitycouncil/content/un-sc-consolidated-list",
      rawHash: stableHash(designation),
    };

    return normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      // Primary-source multilateral designation.
      grade: "VERIFIED",
      entity: {
        kind: designation.entityKind === "individual" ? "person" : "company",
        nativeId: designation.dataid ?? designation.name,
        label: designation.name,
      },
      kind: "sanctions",
      fields,
      observedAt: designation.listedOn ?? new Date().toISOString(),
      providerRecordId: designation.dataid,
      excerpt: `${designation.name} · UNSC${designation.unListType ? ` (${designation.unListType})` : ""}`,
    });
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }
}

export const unSecurityCouncilProvider = new UnSecurityCouncilProvider();

/** The frozen EvidenceCache remains the only cache used by this provider. */
export type UnScCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type UnSecurityCouncilProviderResult = ConnectorResult;
