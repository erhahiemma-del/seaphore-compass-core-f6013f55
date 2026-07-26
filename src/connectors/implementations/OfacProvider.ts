/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-07 — OFAC Evidence Provider
 * ─────────────────────────────────────────────────────────────────────
 *
 *  US Treasury / OFAC Specially Designated Nationals (SDN) list — the
 *  primary-source designation record, acquired directly from Treasury's
 *  published export (keyless, no account).
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → OfacProvider → EvidencePackage → IFE
 *      → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  OpenSanctions remains the primary SANCTIONS provider (priority 100);
 *  OFAC is the primary-source corroborator at priority 90, so Provider
 *  Resolution is unchanged.
 *
 *  ACQUISITION ONLY: reports designations verbatim (programs, list dates,
 *  identifiers). It never scores sanctions risk, never asserts a match,
 *  and never resolves identity — those belong to IFE/OIE.
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

const SDN_XML_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";
const TIMEOUT_MS = 20_000;
const MAX_RESULTS = 10;
export const OFAC_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — SDN publishes daily

export const OFAC_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  // OpenSanctions stays the resolved SANCTIONS provider; OFAC corroborates.
  priority: 90,
  environment: "both",
  enabled: true,
};

/** One OFAC SDN entry, provider-native shape (only consumed fields). */
export interface OfacSdnEntry {
  uid?: string;
  name?: string;
  sdnType?: string;
  programs?: string[];
  aliases?: string[];
  nationalities?: string[];
  imoNumber?: string | null;
  callSign?: string | null;
  vesselFlag?: string | null;
  vesselType?: string | null;
  remarks?: string | null;
  publishDate?: string | null;
}

export class OfacProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "ofac";
  readonly displayName = "US Treasury OFAC (SDN)";
  readonly provider: ProviderMetadata = OFAC_METADATA;
  readonly projectionContractId = "ial.ofac-evidence-provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "SANCTIONS",
    "VESSEL_SCREENING",
    "COMPANY_SCREENING",
    "PERSON_SCREENING",
  ];

  private readonly fetchImpl: typeof fetch;

  constructor(opts: ProviderOptions = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? OFAC_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({ text: query.text, entity: query.entity?.id })}`;
  }

  async connect(): Promise<void> {
    try {
      const res = await timedFetch(this.fetchImpl, SDN_XML_URL, TIMEOUT_MS, { method: "HEAD" });
      this.available = res.status < 500;
      this.lastError = this.available ? null : `health probe returned ${res.status}`;
    } catch (err) {
      this.available = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.authed = true; // Treasury's export is public — no credential exists.
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

    const res = await timedFetch(this.fetchImpl, SDN_XML_URL, TIMEOUT_MS, {
      headers: { Accept: "application/xml" },
    });
    if (res.status !== 200) throw new Error(`OFAC SDN export returned ${res.status}`);
    const xml = await res.text();
    const needle = term.toLowerCase();
    const publishDate = extractOne(xml, /<Publish_Date>([\s\S]*?)<\/Publish_Date>/);

    const out: NormalizedEvidence[] = [];
    for (const block of xmlBlocks(xml, "sdnEntry")) {
      if (!block.toLowerCase().includes(needle)) continue;
      const record = this.normalize(this.parseEntry(block, publishDate), query);
      if (record) out.push(record);
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }

  /** Provider-native parse of one SDN entry — no interpretation applied. */
  private parseEntry(block: string, publishDate: string | null): OfacSdnEntry {
    const first = extractOne(block, /<firstName>([\s\S]*?)<\/firstName>/);
    const last = extractOne(block, /<lastName>([\s\S]*?)<\/lastName>/);
    const name = [first, last].filter(Boolean).join(" ") || null;
    const ids = xmlBlocks(block, "id");
    const idValue = (type: RegExp): string | null => {
      for (const id of ids) {
        const idType = extractOne(id, /<idType>([\s\S]*?)<\/idType>/);
        if (idType && type.test(idType)) {
          return extractOne(id, /<idNumber>([\s\S]*?)<\/idNumber>/);
        }
      }
      return null;
    };
    return {
      uid: extractOne(block, /<uid>([\s\S]*?)<\/uid>/) ?? undefined,
      name: name ?? undefined,
      sdnType: extractOne(block, /<sdnType>([\s\S]*?)<\/sdnType>/) ?? undefined,
      programs: extractAll(block, /<program>([\s\S]*?)<\/program>/g),
      aliases: extractAll(block, /<lastName>([\s\S]*?)<\/lastName>/g).slice(1),
      nationalities: extractAll(block, /<country>([\s\S]*?)<\/country>/g),
      imoNumber: idValue(/IMO/i),
      callSign: extractOne(block, /<callSign>([\s\S]*?)<\/callSign>/),
      vesselFlag: extractOne(block, /<vesselFlag>([\s\S]*?)<\/vesselFlag>/),
      vesselType: extractOne(block, /<vesselType>([\s\S]*?)<\/vesselType>/),
      remarks: extractOne(block, /<remarks>([\s\S]*?)<\/remarks>/),
      publishDate,
    };
  }

  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const entry = raw as OfacSdnEntry | null | undefined;
    if (!entry || !entry.name) return null;
    const kindMap: Record<string, "vessel" | "company" | "person"> = {
      Vessel: "vessel",
      Entity: "company",
      Individual: "person",
    };
    const entityKind = kindMap[entry.sdnType ?? ""] ?? "company";

    const fields: Record<string, EvidenceFieldValue> = {
      name: entry.name,
      entityName: entry.name,
      listName: "OFAC SDN",
      sdnType: entry.sdnType ?? null,
      sanctionLists: "OFAC SDN",
      sanctionPrograms: entry.programs?.length ? entry.programs.join(" | ") : null,
      aliases: entry.aliases?.length ? entry.aliases.join(" | ") : null,
      countries: entry.nationalities?.length ? entry.nationalities.join(" | ") : null,
      imoNumber: entry.imoNumber ?? null,
      callSign: entry.callSign ?? null,
      vesselFlag: entry.vesselFlag ?? null,
      vesselType: entry.vesselType ?? null,
      remarks: entry.remarks ?? null,
      listPublishDate: entry.publishDate ?? null,
      evidenceUrl: entry.uid
        ? `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${entry.uid}`
        : "https://sanctionslist.ofac.treas.gov/Home/SdnList",
      rawHash: stableHash(entry),
    };

    return normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      // Primary-source government designation.
      grade: "VERIFIED",
      entity: {
        kind: entityKind,
        nativeId: entry.uid ?? entry.name,
        label: entry.name,
      },
      kind: "sanctions",
      fields,
      observedAt: entry.publishDate ?? new Date().toISOString(),
      providerRecordId: entry.uid,
      excerpt: `${entry.name} · OFAC SDN${entry.programs?.length ? ` (${entry.programs.join(", ")})` : ""}`,
    });
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }
}

export const ofacProvider = new OfacProvider();

/** The frozen EvidenceCache remains the only cache used by this provider. */
export type OfacCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type OfacProviderResult = ConnectorResult;
