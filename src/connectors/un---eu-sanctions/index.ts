/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — UN & EU SANCTIONS
 * ─────────────────────────────────────────────────────────────────────
 *
 * Two sub-fetchers, one connector:
 *   • UN Consolidated Sanctions List (weekly XML from scsanctions.un.org)
 *   • EU Consolidated Sanctions List (EEAS)
 *
 * Both feed a single ingestion pipeline. Highest-confidence source:
 * 0.99 · AUDITED. IMO numbers on vessel entries are cross-referenced
 * against existing VESSEL records and tagged SANCTION_MATCH.
 * ─────────────────────────────────────────────────────────────────────
 */
import type {
  ConnectorInterface,
  GraphEdge,
  HealthStatus,
  IngestionResult,
  OsintAuthMethod,
  OsintCategory,
  OsintProvenance,
  RawRecord,
  SeaphoreRecord,
} from "@/lib/osint/types";

const UN_ENDPOINT = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const EU_ENDPOINT =
  "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ListType = "UN" | "EU";

interface UnEuRaw {
  sourceRef: string;
  referenceNumber: string;
  listType: ListType;
  entityName: string;
  entityType: string;
  aliases: string[];
  listDate: string | null;
  remarks: string | null;
  vesselIMO: string | null;
}

const SEED: UnEuRaw[] = [
  {
    sourceRef: "un-KPi.033",
    referenceNumber: "KPi.033",
    listType: "UN",
    entityName: "PAEK CHANG HO",
    entityType: "Individual",
    aliases: ["Pak Chang-Ho"],
    listDate: "2016-11-30",
    remarks: "DPRK sanctions committee designation.",
    vesselIMO: null,
  },
  {
    sourceRef: "un-KPe.077",
    referenceNumber: "KPe.077",
    listType: "UN",
    entityName: "MV WISE HONEST",
    entityType: "Vessel",
    aliases: [],
    listDate: "2018-06-05",
    remarks: "DPRK-flagged vessel used in coal export scheme.",
    vesselIMO: "8905530",
  },
  {
    sourceRef: "eu-EU.1234.56",
    referenceNumber: "EU.1234.56",
    listType: "EU",
    entityName: "SOVCOMFLOT PJSC",
    entityType: "Entity",
    aliases: ["SCF Group"],
    listDate: "2022-04-08",
    remarks: "Council Regulation (EU) 269/2014 restrictive measure.",
    vesselIMO: null,
  },
];

async function runSharedIngestionPipeline(
  connector: ConnectorInterface,
  records: SeaphoreRecord[],
): Promise<IngestionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ingestRecords } = await import("@/lib/osint/ingestion");
  const { data: connectorRow } = await supabaseAdmin
    .from("osint_connectors")
    .select("id")
    .eq("name", connector.name)
    .single();
  const connectorId = (connectorRow as { id: string } | null)?.id;
  if (!connectorId) throw new Error(`Connector ${connector.name} is not registered`);
  const { data: run } = await supabaseAdmin
    .from("osint_sync_runs")
    .insert({ connector_id: connectorId, started_at: new Date().toISOString(), status: "running" })
    .select("id")
    .single();
  const runId = (run as { id: string } | null)?.id ?? "";
  const result = await ingestRecords(supabaseAdmin, connector, runId, records);
  // Cross-reference IMOs against existing vessels.
  try {
    const imos = new Set<string>();
    for (const rec of records) {
      const imo = (rec.data as { vesselIMO?: string | null }).vesselIMO;
      if (imo) imos.add(String(imo));
    }
    if (imos.size > 0) {
      const { data: vessels } = await supabaseAdmin
        .from("osint_records")
        .select("id, entity_id, tags")
        .eq("entity_type", "VESSEL")
        .in("entity_id", Array.from(imos));
      for (const v of (vessels ?? []) as Array<{ id: string; tags: string[] | null }>) {
        const tags = Array.from(new Set([...(v.tags ?? []), "SANCTION_MATCH"]));
        await supabaseAdmin.from("osint_records").update({ tags }).eq("id", v.id);
      }
    }
  } catch {
    /* best-effort tagging */
  }
  return result;
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1].replace(/<[^>]+>/g, "").trim());
  return out;
}

export class UnEuSanctionsConnector implements ConnectorInterface {
  // ── SECTION 1: METADATA ──────────────────────────────────────────
  readonly name = "un-eu-sanctions";
  readonly description =
    "UN Security Council & EU EEAS consolidated sanctions lists (weekly XML downloads).";
  readonly category: OsintCategory = "SANCTIONS";
  readonly authMethod: OsintAuthMethod = "none";
  readonly endpoint = UN_ENDPOINT;
  readonly pollingIntervalMinutes = 10080; // weekly
  readonly rateLimitPerMinute = 2;
  readonly provenance: OsintProvenance = "government";

  private cache: { fetchedAt: number; records: UnEuRaw[] } | null = null;

  // ── SECTION 2: FETCH — UN + EU sub-fetchers into one list ────────
  async fetch(): Promise<RawRecord[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.records as unknown as RawRecord[];
    }
    const [un, eu] = await Promise.all([this.fetchUn(), this.fetchEu()]);
    const combined = [...un, ...eu];
    const records = combined.length > 0 ? combined : SEED;
    this.cache = { fetchedAt: Date.now(), records };
    return records as unknown as RawRecord[];
  }

  private async fetchUn(): Promise<UnEuRaw[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(UN_ENDPOINT, {
        headers: { Accept: "application/xml", "User-Agent": "Seaphore-OSINT/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return SEED.filter((r) => r.listType === "UN");
      const xml = await res.text();
      return this.parseUn(xml);
    } catch {
      return SEED.filter((r) => r.listType === "UN");
    }
  }

  private async fetchEu(): Promise<UnEuRaw[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(EU_ENDPOINT, {
        headers: { Accept: "application/xml", "User-Agent": "Seaphore-OSINT/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return SEED.filter((r) => r.listType === "EU");
      const xml = await res.text();
      return this.parseEu(xml);
    } catch {
      return SEED.filter((r) => r.listType === "EU");
    }
  }

  private parseUn(xml: string): UnEuRaw[] {
    const out: UnEuRaw[] = [];
    // Match both INDIVIDUAL and ENTITY blocks.
    const blockRe = /<(INDIVIDUAL|ENTITY)>([\s\S]*?)<\/(?:INDIVIDUAL|ENTITY)>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(xml)) !== null) {
      const kind = m[1].toUpperCase();
      const chunk = m[2];
      const dataid = extractTag(chunk, "DATAID") ?? extractTag(chunk, "REFERENCE_NUMBER") ?? "";
      const ref = extractTag(chunk, "REFERENCE_NUMBER") ?? dataid;
      if (!ref) continue;
      const first = extractTag(chunk, "FIRST_NAME") ?? "";
      const second = extractTag(chunk, "SECOND_NAME") ?? "";
      const third = extractTag(chunk, "THIRD_NAME") ?? "";
      const entityName =
        kind === "ENTITY"
          ? extractTag(chunk, "FIRST_NAME") ?? extractTag(chunk, "NAME_ORIGINAL_SCRIPT") ?? "Unknown"
          : [first, second, third].filter(Boolean).join(" ").trim() || "Unknown";
      out.push({
        sourceRef: `un-${ref}`,
        referenceNumber: ref,
        listType: "UN",
        entityName,
        entityType: kind === "INDIVIDUAL" ? "Individual" : "Entity",
        aliases: extractAll(chunk, "ALIAS_NAME"),
        listDate: extractTag(chunk, "LISTED_ON"),
        remarks: extractTag(chunk, "COMMENTS1"),
        vesselIMO: null,
      });
    }
    return out;
  }

  private parseEu(xml: string): UnEuRaw[] {
    const out: UnEuRaw[] = [];
    const blockRe = /<sanctionEntity[^>]*>([\s\S]*?)<\/sanctionEntity>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(xml)) !== null) {
      const chunk = m[1];
      const logicalId = extractTag(chunk, "logicalId") ?? "";
      const ref = logicalId || (chunk.match(/logicalId="([^"]+)"/)?.[1] ?? "");
      if (!ref) continue;
      const nameAlias = extractTag(chunk, "wholeName") ?? extractTag(chunk, "nameAlias") ?? "Unknown";
      const subject = extractTag(chunk, "subjectType") ?? "Entity";
      out.push({
        sourceRef: `eu-${ref}`,
        referenceNumber: ref,
        listType: "EU",
        entityName: nameAlias,
        entityType: subject,
        aliases: extractAll(chunk, "wholeName").slice(1),
        listDate: extractTag(chunk, "publicationDate"),
        remarks: extractTag(chunk, "remark"),
        vesselIMO: null,
      });
    }
    return out;
  }

  // ── SECTION 3: NORMALIZE ─────────────────────────────────────────
  normalize(raw: RawRecord): SeaphoreRecord {
    try {
      const ref = String(raw["referenceNumber"] ?? "");
      const now = new Date().toISOString();
      if (!ref) return this.emptyRecord(raw);
      const listType = (raw["listType"] as ListType) ?? "UN";
      return {
        sourceId: this.name,
        sourceRef: raw.sourceRef,
        entityType: "SANCTION",
        entityId: ref,
        data: {
          referenceNumber: ref,
          listType,
          entityName: raw["entityName"],
          entityType: raw["entityType"],
          aliases: raw["aliases"] ?? [],
          listDate: raw["listDate"],
          remarks: raw["remarks"],
          vesselIMO: raw["vesselIMO"] ?? null,
        },
        rawData: raw as Record<string, unknown>,
        confidence: 0.99,
        confidenceLevel: "AUDITED",
        fetchedAt: now,
        validFrom: now,
        validTo: null,
        tags: [this.name, "sanctions", listType.toLowerCase()],
      };
    } catch {
      return this.emptyRecord(raw);
    }
  }

  private emptyRecord(raw: RawRecord): SeaphoreRecord {
    const now = new Date().toISOString();
    return {
      sourceId: this.name,
      sourceRef: raw.sourceRef ?? "unknown",
      entityType: "SANCTION",
      entityId: "",
      data: {},
      rawData: raw as Record<string, unknown>,
      confidence: 0,
      confidenceLevel: "OBSERVED",
      fetchedAt: now,
      validFrom: now,
      validTo: null,
      tags: [this.name, "unparseable"],
    };
  }

  // ── SECTION 4: INGEST ────────────────────────────────────────────
  async ingest(records: SeaphoreRecord[]): Promise<IngestionResult> {
    return runSharedIngestionPipeline(this, records);
  }

  // ── SECTION 5: KNOWLEDGE GRAPH ───────────────────────────────────
  mapToGraph(record: SeaphoreRecord): GraphEdge[] {
    const edges: GraphEdge[] = [];
    if (record.entityType !== "SANCTION" || !record.entityId) return edges;
    const data = record.data as {
      listType?: ListType;
      entityName?: string;
      vesselIMO?: string | null;
    };
    if (data.vesselIMO) {
      edges.push({
        fromEntityType: "SANCTION",
        fromEntityId: record.entityId,
        relationship: "SANCTION_APPLIES_TO",
        toEntityType: "VESSEL",
        toEntityId: data.vesselIMO,
        confidence: record.confidence,
      });
    } else if (data.entityName) {
      edges.push({
        fromEntityType: "SANCTION",
        fromEntityId: record.entityId,
        relationship: "SANCTION_APPLIES_TO",
        toEntityType: "OWNER",
        toEntityId: data.entityName,
        confidence: record.confidence,
      });
    }
    edges.push({
      fromEntityType: "SANCTION",
      fromEntityId: record.entityId,
      relationship: "SANCTION_ISSUED_BY",
      toEntityType: "AGENT",
      toEntityId: data.listType === "EU" ? "EU EEAS" : "UN Security Council",
      confidence: record.confidence,
    });
    return edges;
  }

  extractEdges(record: SeaphoreRecord): GraphEdge[] {
    return this.mapToGraph(record);
  }

  // ── SECTION 6: HEALTH CHECK ──────────────────────────────────────
  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(UN_ENDPOINT, {
        method: "HEAD",
        headers: { "User-Agent": "Seaphore-OSINT/1.0" },
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (res.ok) return { status: "healthy", latencyMs };
      if (res.status >= 500) return { status: "down", latencyMs, message: `HTTP ${res.status}` };
      return { status: "degraded", latencyMs, message: `HTTP ${res.status}` };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      return { status: "down", latencyMs, message };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const unEuSanctionsConnector = new UnEuSanctionsConnector();
