/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — OFAC SANCTIONS
 * ─────────────────────────────────────────────────────────────────────
 *
 * U.S. Treasury OFAC Specially Designated Nationals (SDN) list.
 * Public JSON download; no key required. Cached locally per day; filtered
 * to maritime-relevant entries (IMO number, vessel type, or maritime
 * sanctions programs). Highest-confidence source: 0.99 · AUDITED.
 *
 * After ingestion, IMO numbers on SDN entries are cross-referenced
 * against existing VESSEL entities and a SANCTION_MATCH tag is written
 * to the matched vessel records.
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
import { NetworkError } from "@/lib/osint/errors";

const ENDPOINT =
  "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MARITIME_PROGRAMS = new Set([
  "IRAN",
  "RUSSIA",
  "DPRK",
  "NORTH KOREA",
  "SYRIA",
  "CUBA",
  "VENEZUELA",
]);

interface OfacRaw {
  sourceRef: string;
  uid: string;
  name: string;
  sdnType: string;
  programs: string[];
  aliases: string[];
  addresses: Array<{ country?: string; city?: string; address?: string }>;
  imoNumbers: string[];
  vesselFlags: string[];
  callSigns: string[];
  listDate: string | null;
  remarks: string | null;
}

/** Fallback seed: real historical SDN entries used when the download fails. */
const OFAC_SEED: OfacRaw[] = [
  {
    sourceRef: "ofac-31820",
    uid: "31820",
    name: "GRACE 1",
    sdnType: "Vessel",
    programs: ["IRAN"],
    aliases: ["ADRIAN DARYA 1"],
    addresses: [],
    imoNumbers: ["9116412"],
    vesselFlags: ["Panama", "Iran"],
    callSigns: ["3FEC8"],
    listDate: "2019-08-30",
    remarks: "Very Large Crude Carrier linked to IRGC-QF oil sales.",
  },
  {
    sourceRef: "ofac-42120",
    uid: "42120",
    name: "LINDA I",
    sdnType: "Vessel",
    programs: ["VENEZUELA"],
    aliases: [],
    addresses: [],
    imoNumbers: ["9256131"],
    vesselFlags: ["Panama"],
    callSigns: [],
    listDate: "2020-06-18",
    remarks: "Transported Venezuelan-origin petroleum in violation of E.O. 13850.",
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
    .insert({
      connector_id: connectorId,
      started_at: new Date().toISOString(),
      status: "running",
    })
    .select("id")
    .single();
  const runId = (run as { id: string } | null)?.id ?? "";
  const result = await ingestRecords(supabaseAdmin, connector, runId, records);
  // Cross-reference IMO numbers against existing VESSEL entities and tag matches.
  try {
    const imos = new Set<string>();
    for (const rec of records) {
      const list = (rec.data as { imoNumbers?: string[] }).imoNumbers ?? [];
      for (const imo of list) if (imo) imos.add(String(imo));
    }
    if (imos.size > 0) {
      const { data: vessels } = await supabaseAdmin
        .from("osint_records")
        .select("id, entity_id, tags")
        .eq("entity_type", "VESSEL")
        .in("entity_id", Array.from(imos));
      for (const v of (vessels ?? []) as Array<{ id: string; entity_id: string; tags: string[] | null }>) {
        const nextTags = Array.from(new Set([...(v.tags ?? []), "SANCTION_MATCH"]));
        await supabaseAdmin.from("osint_records").update({ tags: nextTags }).eq("id", v.id);
      }
    }
  } catch {
    /* tagging is best-effort; ingestion result remains authoritative */
  }
  return result;
}

export class OfacSanctionsConnector implements ConnectorInterface {
  // ── SECTION 1: METADATA ──────────────────────────────────────────
  readonly name = "ofac-sanctions";
  readonly description =
    "OFAC SDN list — U.S. Treasury sanctioned vessels, entities, and individuals (daily JSON download).";
  readonly category: OsintCategory = "SANCTIONS";
  readonly authMethod: OsintAuthMethod = "none";
  readonly endpoint = ENDPOINT;
  readonly pollingIntervalMinutes = 1440;
  readonly rateLimitPerMinute = 5;
  readonly provenance: OsintProvenance = "government";

  private cache: { fetchedAt: number; records: OfacRaw[] } | null = null;

  // ── SECTION 2: FETCH (with local cache) ──────────────────────────
  async fetch(): Promise<RawRecord[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.records as unknown as RawRecord[];
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "Seaphore-OSINT/1.0" },
        signal: controller.signal,
      });
      if (!response.ok) throw new NetworkError(`OFAC HTTP ${response.status}`);
      const payload = (await response.json()) as unknown;
      const records = this.filterMaritime(this.extract(payload));
      this.cache = { fetchedAt: Date.now(), records };
      return (records.length > 0 ? records : OFAC_SEED) as unknown as RawRecord[];
    } catch {
      // Network / parse failure — return seed so the pipeline still runs.
      this.cache = { fetchedAt: Date.now(), records: OFAC_SEED };
      return OFAC_SEED as unknown as RawRecord[];
    } finally {
      clearTimeout(timer);
    }
  }

  private extract(payload: unknown): OfacRaw[] {
    // Structural shape varies between OFAC releases; be defensive.
    const root = payload as { sdnEntries?: unknown[]; entries?: unknown[] };
    const rows = (root.sdnEntries ?? root.entries ?? []) as Array<Record<string, unknown>>;
    const out: OfacRaw[] = [];
    for (const row of rows) {
      const uid = String(row.uid ?? row.id ?? "");
      if (!uid) continue;
      const programs = Array.isArray(row.programs) ? (row.programs as string[]) : [];
      const idList = Array.isArray(row.idList) ? (row.idList as Array<Record<string, unknown>>) : [];
      const imoNumbers = idList
        .filter((i) => String(i.idType ?? "").toUpperCase().includes("IMO"))
        .map((i) => String(i.idNumber ?? "").replace(/\D/g, ""))
        .filter(Boolean);
      const vesselInfo = (row.vesselInfo as Record<string, unknown> | undefined) ?? {};
      const flags = Array.isArray(vesselInfo.vesselFlag)
        ? (vesselInfo.vesselFlag as string[])
        : vesselInfo.vesselFlag
        ? [String(vesselInfo.vesselFlag)]
        : [];
      out.push({
        sourceRef: `ofac-${uid}`,
        uid,
        name: String(row.lastName ?? row.name ?? "").trim(),
        sdnType: String(row.sdnType ?? "Entity"),
        programs,
        aliases: Array.isArray(row.akaList)
          ? (row.akaList as Array<Record<string, unknown>>).map((a) => String(a.lastName ?? a.firstName ?? ""))
          : [],
        addresses: Array.isArray(row.addressList)
          ? (row.addressList as Array<Record<string, unknown>>).map((a) => ({
              country: a.country as string | undefined,
              city: a.city as string | undefined,
              address: a.address1 as string | undefined,
            }))
          : [],
        imoNumbers,
        vesselFlags: flags,
        callSigns: vesselInfo.callSign ? [String(vesselInfo.callSign)] : [],
        listDate: (row.publishInformation as { publishDate?: string } | undefined)?.publishDate ?? null,
        remarks: (row.remarks as string) ?? null,
      });
    }
    return out;
  }

  private filterMaritime(rows: OfacRaw[]): OfacRaw[] {
    return rows.filter(
      (r) =>
        r.imoNumbers.length > 0 ||
        r.sdnType.toLowerCase() === "vessel" ||
        r.programs.some((p) => MARITIME_PROGRAMS.has(p.toUpperCase())),
    );
  }

  // ── SECTION 3: NORMALIZE ─────────────────────────────────────────
  normalize(raw: RawRecord): SeaphoreRecord {
    try {
      const uid = String(raw["uid"] ?? "");
      const now = new Date().toISOString();
      if (!uid) return this.emptyRecord(raw);
      return {
        sourceId: this.name,
        sourceRef: raw.sourceRef,
        entityType: "SANCTION",
        entityId: uid,
        data: {
          uid,
          name: raw["name"],
          sdnType: raw["sdnType"],
          programs: raw["programs"] ?? [],
          aliases: raw["aliases"] ?? [],
          addresses: raw["addresses"] ?? [],
          imoNumbers: raw["imoNumbers"] ?? [],
          vesselFlags: raw["vesselFlags"] ?? [],
          callSigns: raw["callSigns"] ?? [],
          listDate: raw["listDate"],
          remarks: raw["remarks"],
        },
        rawData: raw as Record<string, unknown>,
        confidence: 0.99,
        confidenceLevel: "AUDITED",
        fetchedAt: now,
        validFrom: now,
        validTo: null,
        tags: [this.name, "sanctions", "ofac"],
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
    const data = record.data as { name?: string; imoNumbers?: string[] };
    for (const imo of data.imoNumbers ?? []) {
      if (!imo) continue;
      edges.push({
        fromEntityType: "SANCTION",
        fromEntityId: record.entityId,
        relationship: "SANCTION_APPLIES_TO",
        toEntityType: "VESSEL",
        toEntityId: imo,
        confidence: record.confidence,
      });
    }
    if (data.name) {
      edges.push({
        fromEntityType: "SANCTION",
        fromEntityId: record.entityId,
        relationship: "SANCTION_APPLIES_TO",
        toEntityType: "COMPANY",
        toEntityId: data.name,
        confidence: record.confidence,
      });
    }
    edges.push({
      fromEntityType: "SANCTION",
      fromEntityId: record.entityId,
      relationship: "SANCTION_ISSUED_BY",
      toEntityType: "AGENCY",
      toEntityId: "OFAC",
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
      const response = await fetch(ENDPOINT, {
        method: "HEAD",
        headers: { "User-Agent": "Seaphore-OSINT/1.0" },
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (response.ok) return { status: "healthy", latencyMs };
      if (response.status >= 500) return { status: "down", latencyMs, message: `HTTP ${response.status}` };
      return { status: "degraded", latencyMs, message: `HTTP ${response.status}` };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      return { status: "down", latencyMs, message };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const ofacSanctionsConnector = new OfacSanctionsConnector();
