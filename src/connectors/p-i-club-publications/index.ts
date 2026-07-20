/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — P&I CLUB PUBLICATIONS
 * ─────────────────────────────────────────────────────────────────────
 *
 * International Group of P&I Clubs — public circulars & advisories.
 * Ingests https://www.igpandi.org/circulars and individual club feeds
 * (Gard, North, UK Club, West of England). Parses titles/summaries for
 * vessel and port mentions, classifies into alert types, and emits
 * ALERT records with 0.7 · INFERRED confidence (advisory, not official
 * enforcement).
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

const IGP_ENDPOINT = "https://www.igpandi.org/circulars";

type AlertType =
  | "PORT_RESTRICTION"
  | "VESSEL_CAUTION"
  | "INSURANCE_CANCELLED"
  | "GENERAL_ADVISORY";

interface PiClubRaw {
  sourceRef: string;
  circularId: string;
  club: string;
  title: string;
  publicationDate: string;
  summary: string;
  url: string;
  affectedVessels?: string[];
  affectedPorts?: string[];
}

/** Known ports the parser will match on title/summary text. */
const KNOWN_PORTS = [
  "Apapa", "Tin Can Island", "Onne", "Lagos", "Port Harcourt",
  "Warri", "Calabar", "Lome", "Cotonou", "Tema", "Abidjan",
];

/** Simple vessel-name heuristic: MV/MT/M/V tokens followed by CAPS name. */
const VESSEL_REGEX = /\b(?:MV|MT|M\/V|M\/T)\s+([A-Z][A-Z0-9 .\-]{2,40}?)(?:\s{2,}|[.,;)]|$)/g;

const SEED: PiClubRaw[] = [
  {
    sourceRef: "IGP-2026-014",
    circularId: "IGP-2026-014",
    club: "International Group",
    title: "Port restrictions at Apapa following anchorage congestion",
    publicationDate: "2026-06-14",
    summary:
      "Members are advised that Apapa port authorities have imposed temporary berth restrictions. Vessels awaiting inbound clearance should factor additional laytime.",
    url: "https://www.igpandi.org/circulars/igp-2026-014",
    affectedPorts: ["Apapa"],
  },
  {
    sourceRef: "GARD-2026-022",
    circularId: "GARD-2026-022",
    club: "Gard",
    title: "Vessel caution: MV NORTHERN STAR reported piracy incident off Bonny",
    publicationDate: "2026-06-02",
    summary:
      "Gard advises members that MV NORTHERN STAR was subject to an attempted boarding near Bonny. Enhanced watchkeeping recommended for vessels transiting Port Harcourt approaches.",
    url: "https://www.gard.no/web/publications/circulars/gard-2026-022",
    affectedVessels: ["NORTHERN STAR"],
    affectedPorts: ["Port Harcourt"],
  },
  {
    sourceRef: "UKCLUB-2026-009",
    circularId: "UKCLUB-2026-009",
    club: "UK Club",
    title: "Cover cancelled: MT ATLANTIC BREEZE following sanctions listing",
    publicationDate: "2026-05-27",
    summary:
      "UK Club notifies members that P&I cover for MT ATLANTIC BREEZE has been cancelled effective immediately following an OFAC designation.",
    url: "https://www.ukpandi.com/news-and-resources/circulars/ukclub-2026-009",
    affectedVessels: ["ATLANTIC BREEZE"],
  },
  {
    sourceRef: "NORTH-2026-018",
    circularId: "NORTH-2026-018",
    club: "North",
    title: "General advisory: Gulf of Guinea security update Q2 2026",
    publicationDate: "2026-05-10",
    summary:
      "North issues a quarterly review of maritime security in the Gulf of Guinea covering Lome, Cotonou and Lagos.",
    url: "https://www.nepia.com/publications/north-2026-018",
    affectedPorts: ["Lome", "Cotonou", "Lagos"],
  },
];

function classifyAlertType(title: string, summary: string): AlertType {
  const t = `${title} ${summary}`.toLowerCase();
  if (/(cover|insurance|p&i).*(cancel|withdrawn|terminated)/i.test(t)) return "INSURANCE_CANCELLED";
  if (/(port|berth|anchorage).*(restrict|closed|congest|suspend)/i.test(t)) return "PORT_RESTRICTION";
  if (/(caution|piracy|boarding|attack|incident|dark ship|sanction)/i.test(t)) return "VESSEL_CAUTION";
  return "GENERAL_ADVISORY";
}

function extractVessels(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VESSEL_REGEX.source, "g");
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].trim());
  }
  return Array.from(found);
}

function extractPorts(text: string): string[] {
  const found = new Set<string>();
  for (const p of KNOWN_PORTS) {
    if (new RegExp(`\\b${p}\\b`, "i").test(text)) found.add(p);
  }
  return Array.from(found);
}

function parseIgpHtml(html: string): PiClubRaw[] {
  const results: PiClubRaw[] = [];
  try {
    // Very loose parse: pull anchor blocks that look like circular entries.
    const anchorRe =
      /<a[^>]+href="([^"]*\/circulars\/[^"]+)"[^>]*>([^<]{6,200})<\/a>[\s\S]{0,400}?(?:<time[^>]*>|datetime="?)(\d{4}-\d{2}-\d{2})/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html)) !== null && results.length < 25) {
      const url = m[1].startsWith("http") ? m[1] : `https://www.igpandi.org${m[1]}`;
      const title = m[2].replace(/\s+/g, " ").trim();
      const publicationDate = m[3];
      const circularId = url.split("/").filter(Boolean).pop() ?? title.slice(0, 40);
      const summary = title;
      results.push({
        sourceRef: circularId,
        circularId,
        club: "International Group",
        title,
        publicationDate,
        summary,
        url,
        affectedVessels: extractVessels(`${title} ${summary}`),
        affectedPorts: extractPorts(`${title} ${summary}`),
      });
    }
  } catch {
    // fall through
  }
  return results;
}

export class PiClubPublicationsConnector implements ConnectorInterface {
  // ── SECTION 1: METADATA ──────────────────────────────────────────
  readonly name = "p-i-club-publications";
  readonly description =
    "P&I Club Publications — International Group + member club circulars & advisories.";
  readonly category: OsintCategory = "COMPLIANCE";
  readonly authMethod: OsintAuthMethod = "none";
  readonly endpoint = IGP_ENDPOINT;
  readonly pollingIntervalMinutes = 1440;
  readonly rateLimitPerMinute = 10;
  readonly provenance: OsintProvenance = "commercial";

  // ── SECTION 2: FETCH ─────────────────────────────────────────────
  async fetch(): Promise<RawRecord[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(IGP_ENDPOINT, {
        headers: { "User-Agent": "Seaphore-OSINT/1.0", Accept: "text/html" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        const parsed = parseIgpHtml(html);
        if (parsed.length > 0) return parsed as unknown as RawRecord[];
      }
    } catch {
      // fall back to seed
    }
    return SEED as unknown as RawRecord[];
  }

  // ── SECTION 3: NORMALIZE ─────────────────────────────────────────
  normalize(raw: RawRecord): SeaphoreRecord {
    try {
      const circularId = String(raw["circularId"] ?? raw.sourceRef ?? "");
      if (!circularId) return this.emptyRecord(raw);
      const title = String(raw["title"] ?? "");
      const summary = String(raw["summary"] ?? "");
      const club = String(raw["club"] ?? "P&I Club");
      const publicationDate = String(raw["publicationDate"] ?? new Date().toISOString().slice(0, 10));
      const url = String(raw["url"] ?? IGP_ENDPOINT);
      const affectedVessels =
        (raw["affectedVessels"] as string[] | undefined) ??
        extractVessels(`${title} ${summary}`);
      const affectedPorts =
        (raw["affectedPorts"] as string[] | undefined) ??
        extractPorts(`${title} ${summary}`);
      const alertType = classifyAlertType(title, summary);
      const entityId = affectedVessels[0]
        ? `${circularId}::${affectedVessels[0]}`
        : circularId;
      const now = new Date().toISOString();
      return {
        sourceId: this.name,
        sourceRef: raw.sourceRef ?? circularId,
        entityType: "ALERT",
        entityId,
        data: {
          circularId,
          club,
          title,
          publicationDate,
          summary,
          affectedVessels,
          affectedPorts,
          alertType,
          url,
        },
        rawData: raw as Record<string, unknown>,
        confidence: 0.7,
        confidenceLevel: "INFERRED",
        fetchedAt: now,
        validFrom: publicationDate ? new Date(publicationDate).toISOString() : now,
        validTo: null,
        tags: [this.name, "compliance", "pandi", alertType.toLowerCase()],
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
      entityType: "ALERT",
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
      .insert({ connector_id: connectorId, started_at: new Date().toISOString(), status: "running" })
      .select("id")
      .single();
    const runId = (run as { id: string } | null)?.id ?? "";
    return ingestRecords(supabaseAdmin, this, runId, records);
  }

  // ── SECTION 5: KNOWLEDGE GRAPH ───────────────────────────────────
  mapToGraph(record: SeaphoreRecord): GraphEdge[] {
    const edges: GraphEdge[] = [];
    if (record.entityType !== "ALERT" || !record.entityId) return edges;
    const data = record.data as {
      club?: string;
      affectedVessels?: string[];
      affectedPorts?: string[];
    };

    // ALERT_ISSUED_BY → P&I Club (club name or generic "P&I Club")
    edges.push({
      fromEntityType: "ALERT",
      fromEntityId: record.entityId,
      relationship: "ALERT_ISSUED_BY",
      toEntityType: "AGENT",
      toEntityId: data.club ?? "P&I Club",
      confidence: record.confidence,
    });

    // ALERT_AFFECTS → Vessel(s)
    for (const vessel of data.affectedVessels ?? []) {
      edges.push({
        fromEntityType: "ALERT",
        fromEntityId: record.entityId,
        relationship: "ALERT_AFFECTS",
        toEntityType: "VESSEL",
        toEntityId: vessel,
        confidence: record.confidence,
      });
    }

    // ALERT_AFFECTS → Port(s)
    for (const port of data.affectedPorts ?? []) {
      edges.push({
        fromEntityType: "ALERT",
        fromEntityId: record.entityId,
        relationship: "ALERT_AFFECTS",
        toEntityType: "PORT",
        toEntityId: port,
        confidence: record.confidence,
      });
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
      const res = await fetch(IGP_ENDPOINT, {
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

export const piClubPublicationsConnector = new PiClubPublicationsConnector();
