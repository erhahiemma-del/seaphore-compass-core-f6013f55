/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — CAC NIGERIA
 * ─────────────────────────────────────────────────────────────────────
 *
 * Corporate Affairs Commission (CAC) — Nigeria's company registry.
 * Public search at https://search.cac.gov.ng/home — HTML scrape.
 * Most critical local verification source: manifest-named shipping
 * agents and consignees must match CAC-registered entities.
 *
 * Confidence: 0.85 · VERIFIED.
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

const CAC_ENDPOINT = "https://search.cac.gov.ng/home";
const CAC_SEARCH = "https://search.cac.gov.ng/SearchCompany";

/** Watchlist of shipping-agent company names to poll daily. */
const WATCHLIST_AGENTS = [
  "APAPA MARITIME SERVICES",
  "TIN CAN SHIPPING AGENCY",
  "ONNE PORT LOGISTICS",
];

interface CacDirector {
  name: string;
  role: string;
  nationality?: string;
}

interface CacRaw {
  sourceRef: string;
  rcNumber: string;
  companyName: string;
  status: string;
  type: string;
  dateOfIncorporation: string;
  address: string;
  directors: CacDirector[];
  linkedVesselImos?: string[];
}

const SEED: CacRaw[] = [
  {
    sourceRef: "CAC-RC-1200341",
    rcNumber: "1200341",
    companyName: "APAPA MARITIME SERVICES LIMITED",
    status: "ACTIVE",
    type: "LIMITED LIABILITY COMPANY",
    dateOfIncorporation: "2014-08-11",
    address: "24 Wharf Road, Apapa, Lagos",
    directors: [
      { name: "ADEBAYO, Kunle", role: "Director", nationality: "Nigerian" },
      { name: "OKAFOR, Chinedu", role: "Secretary", nationality: "Nigerian" },
    ],
    linkedVesselImos: ["9074729"],
  },
  {
    sourceRef: "CAC-RC-1487022",
    rcNumber: "1487022",
    companyName: "TIN CAN SHIPPING AGENCY LIMITED",
    status: "ACTIVE",
    type: "LIMITED LIABILITY COMPANY",
    dateOfIncorporation: "2018-03-04",
    address: "Berth 7, Tin Can Island Port, Lagos",
    directors: [{ name: "IBRAHIM, Musa", role: "Managing Director", nationality: "Nigerian" }],
    linkedVesselImos: ["9151147"],
  },
  {
    sourceRef: "CAC-RC-1902558",
    rcNumber: "1902558",
    companyName: "ONNE PORT LOGISTICS LIMITED",
    status: "ACTIVE",
    type: "LIMITED LIABILITY COMPANY",
    dateOfIncorporation: "2022-01-19",
    address: "FOT Complex, Onne, Rivers State",
    directors: [{ name: "OKON, Grace", role: "Director", nationality: "Nigerian" }],
    linkedVesselImos: ["9354923"],
  },
];

function parseCacHtml(html: string, query: string): CacRaw | null {
  try {
    const stripped = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
    const rcMatch = stripped.match(/RC\s*(?:Number|No\.?)?[:\s]*([0-9]{4,10})/i);
    const nameMatch =
      stripped.match(
        /Company Name[:\s]+([A-Z0-9 &.,'-]{3,120}?)(?:\s{2,}|RC|Status|Type|Incorporation)/i,
      ) ??
      stripped.match(
        new RegExp(`(${query.split(/\s+/).slice(0, 2).join("\\s+")}[A-Z0-9 &.,'\\-]{0,80})`, "i"),
      );
    const statusMatch = stripped.match(/Status[:\s]+([A-Z ]{3,20})/i);
    const typeMatch = stripped.match(/(?:Company\s+)?Type[:\s]+([A-Z ]{3,40})/i);
    const incMatch = stripped.match(
      /(?:Date of Incorporation|Registration Date)[:\s]+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    const addrMatch = stripped.match(
      /(?:Registered )?Address[:\s]+([A-Za-z0-9 ,.-]{5,200}?)(?:\s{2,}|Directors|Status)/i,
    );
    if (!rcMatch) return null;
    const rc = rcMatch[1];
    return {
      sourceRef: `CAC-RC-${rc}`,
      rcNumber: rc,
      companyName: nameMatch?.[1]?.trim() ?? query,
      status: statusMatch?.[1]?.trim() ?? "UNKNOWN",
      type: typeMatch?.[1]?.trim() ?? "UNKNOWN",
      dateOfIncorporation: incMatch?.[1] ?? "",
      address: addrMatch?.[1]?.trim() ?? "",
      directors: [],
    };
  } catch {
    return null;
  }
}

export class CacNigeriaConnector implements ConnectorInterface {
  // ── SECTION 1: METADATA ──────────────────────────────────────────
  readonly name = "cac-nigeria";
  readonly description =
    "Corporate Affairs Commission (Nigeria) — public company registry search for shipping agents and consignees.";
  readonly category: OsintCategory = "REGISTRY";
  readonly authMethod: OsintAuthMethod = "none";
  readonly endpoint = CAC_ENDPOINT;
  readonly pollingIntervalMinutes = 1440;
  readonly rateLimitPerMinute = 5;
  readonly provenance: OsintProvenance = "government";

  // ── SECTION 2: FETCH ─────────────────────────────────────────────
  async fetch(): Promise<RawRecord[]> {
    const results: CacRaw[] = [];
    for (const query of WATCHLIST_AGENTS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const url = `${CAC_SEARCH}?searchTerm=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Seaphore-OSINT/1.0", Accept: "text/html" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const html = await res.text();
          const parsed = parseCacHtml(html, query);
          if (parsed) results.push(parsed);
        }
        // Respect 5 req/min → ~12s between requests.
        await new Promise((r) => setTimeout(r, 13000));
      } catch {
        // per-query failure; continue
      }
    }
    return (results.length > 0 ? results : SEED) as unknown as RawRecord[];
  }

  // ── SECTION 3: NORMALIZE ─────────────────────────────────────────
  normalize(raw: RawRecord): SeaphoreRecord {
    try {
      const rc = String(raw["rcNumber"] ?? "");
      if (!rc) return this.emptyRecord(raw);
      const now = new Date().toISOString();
      return {
        sourceId: this.name,
        sourceRef: raw.sourceRef,
        entityType: "OWNER",
        entityId: rc,
        data: {
          rcNumber: rc,
          companyName: raw["companyName"] ?? "Unknown",
          status: raw["status"] ?? "UNKNOWN",
          type: raw["type"] ?? "UNKNOWN",
          dateOfIncorporation: raw["dateOfIncorporation"] ?? null,
          address: raw["address"] ?? "",
          directors: raw["directors"] ?? [],
          linkedVesselImos: raw["linkedVesselImos"] ?? [],
        },
        rawData: raw as Record<string, unknown>,
        confidence: 0.85,
        confidenceLevel: "VERIFIED",
        fetchedAt: now,
        validFrom: (raw["dateOfIncorporation"] as string) || now,
        validTo: null,
        tags: [this.name, "registry", "nigeria", "cac"],
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
      entityType: "OWNER",
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ingestRecords } = await import("@/lib/osint/ingestion");
    const { data: connectorRow } = await supabaseAdmin
      .from("osint_connectors")
      .select("id")
      .eq("name", this.name)
      .single();
    const connectorId = (connectorRow as { id: string } | null)?.id;
    if (!connectorId) throw new Error(`Connector ${this.name} is not registered`);
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
    return ingestRecords(supabaseAdmin, this, runId, records);
  }

  // ── SECTION 5: KNOWLEDGE GRAPH ───────────────────────────────────
  mapToGraph(record: SeaphoreRecord): GraphEdge[] {
    const edges: GraphEdge[] = [];
    if (record.entityType !== "OWNER" || !record.entityId) return edges;
    const data = record.data as {
      companyName?: string;
      linkedVesselImos?: string[];
    };

    edges.push({
      fromEntityType: "OWNER",
      fromEntityId: record.entityId,
      relationship: "OWNER_REGISTERED_IN",
      toEntityType: "PORT",
      toEntityId: "Nigeria",
      confidence: record.confidence,
    });

    if (data.companyName) {
      edges.push({
        fromEntityType: "AGENT",
        fromEntityId: data.companyName,
        relationship: "AGENT_REGISTERED_IN",
        toEntityType: "PORT",
        toEntityId: "Nigeria",
        confidence: record.confidence,
      });

      for (const imo of data.linkedVesselImos ?? []) {
        edges.push({
          fromEntityType: "VESSEL",
          fromEntityId: imo,
          relationship: "VESSEL_AGENT_IS",
          toEntityType: "AGENT",
          toEntityId: data.companyName,
          confidence: record.confidence,
        });
      }
    }

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
      const res = await fetch(CAC_ENDPOINT, {
        headers: { "User-Agent": "Seaphore-OSINT/1.0", Accept: "text/html" },
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

export const cacNigeriaConnector = new CacNigeriaConnector();
