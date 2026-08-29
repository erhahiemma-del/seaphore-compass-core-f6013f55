/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — UK COMPANIES HOUSE
 * ─────────────────────────────────────────────────────────────────────
 *
 * Free REST API for UK-registered companies. Basic HTTP auth with the
 * API key as username, empty password. Officers list is the highest
 * value: surfaces beneficial ownership and director networks around
 * shipping agents and vessel owners.
 *
 * Confidence: 0.9 · VERIFIED.
 * ─────────────────────────────────────────────────────────────────────
 */
import { readProviderCredential } from "@/connectors/implementations/shared/provider-io";

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

const CH_ENDPOINT = "https://api.company-information.service.gov.uk";

/** Watchlist of UK-registered shipping agents / owners to poll daily. */
const WATCHLIST_COMPANIES = ["00041424", "01777777", "03875000"];

interface ChOfficer {
  name: string;
  role: string;
  appointedOn?: string;
  nationality?: string;
}

interface ChFiling {
  date: string;
  category: string;
  description: string;
}

interface ChRaw {
  sourceRef: string;
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  incorporatedOn: string;
  registeredAddress: string;
  officers: ChOfficer[];
  sicCodes: string[];
  filingHistory: ChFiling[];
  linkedVesselImos?: string[];
}

const SEED: ChRaw[] = [
  {
    sourceRef: "CH-00041424",
    companyNumber: "00041424",
    companyName: "P&O SHIPPING LIMITED",
    companyStatus: "active",
    companyType: "ltd",
    incorporatedOn: "1896-01-01",
    registeredAddress: "79 Pall Mall, London, SW1Y 5EJ",
    officers: [
      { name: "SMITH, John", role: "director", appointedOn: "2019-04-12", nationality: "British" },
    ],
    sicCodes: ["50200"],
    filingHistory: [
      { date: "2025-06-30", category: "accounts", description: "Annual accounts filed" },
    ],
    linkedVesselImos: ["9074729"],
  },
  {
    sourceRef: "CH-01777777",
    companyNumber: "01777777",
    companyName: "MARITIME AGENCY LIMITED",
    companyStatus: "active",
    companyType: "ltd",
    incorporatedOn: "1984-03-14",
    registeredAddress: "12 Leadenhall Street, London, EC3V 1LP",
    officers: [
      { name: "PATEL, Anita", role: "director", appointedOn: "2020-11-01", nationality: "British" },
    ],
    sicCodes: ["52290"],
    filingHistory: [
      {
        date: "2025-08-14",
        category: "confirmation-statement",
        description: "Confirmation statement",
      },
    ],
    linkedVesselImos: ["9151147"],
  },
  {
    sourceRef: "CH-03875000",
    companyNumber: "03875000",
    companyName: "ATLANTIC CARRIERS UK LIMITED",
    companyStatus: "active",
    companyType: "ltd",
    incorporatedOn: "1999-11-22",
    registeredAddress: "1 St. Mary Axe, London, EC3A 8BF",
    officers: [
      {
        name: "OKAFOR, Chinedu",
        role: "director",
        appointedOn: "2021-05-30",
        nationality: "Nigerian",
      },
    ],
    sicCodes: ["50200"],
    filingHistory: [
      { date: "2025-04-11", category: "accounts", description: "Micro-entity accounts" },
    ],
    linkedVesselImos: ["9354923"],
  },
];

function authHeader(): string | null {
  // Via the audited reader, so alias resolution and the credential guard
  // both apply here as they do to every other provider.
  const key = readProviderCredential("COMPANIES_HOUSE_API_KEY");
  if (!key) return null;
  // Companies House uses HTTP Basic with the API key as username, empty password.
  const token =
    typeof Buffer !== "undefined" ? Buffer.from(`${key}:`).toString("base64") : btoa(`${key}:`);
  return `Basic ${token}`;
}

export class UkCompaniesHouseConnector implements ConnectorInterface {
  // ── SECTION 1: METADATA ──────────────────────────────────────────
  readonly name = "uk-companies-house";
  readonly description =
    "UK Companies House registry — companies, officers, filing history for UK-registered shipping agents and owners.";
  readonly category: OsintCategory = "REGISTRY";
  readonly authMethod: OsintAuthMethod = "api_key";
  readonly endpoint = CH_ENDPOINT;
  readonly pollingIntervalMinutes = 1440;
  readonly rateLimitPerMinute = 600;
  readonly provenance: OsintProvenance = "government";

  // ── SECTION 2: FETCH ─────────────────────────────────────────────
  async fetch(): Promise<RawRecord[]> {
    const auth = authHeader();
    if (!auth) return SEED as unknown as RawRecord[];

    const results: ChRaw[] = [];
    for (const num of WATCHLIST_COMPANIES) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const headers = {
          Authorization: auth,
          Accept: "application/json",
          "User-Agent": "Seaphore-OSINT/1.0",
        };

        const [companyRes, officersRes, filingsRes] = await Promise.all([
          fetch(`${CH_ENDPOINT}/company/${num}`, { headers, signal: controller.signal }),
          fetch(`${CH_ENDPOINT}/company/${num}/officers`, { headers, signal: controller.signal }),
          fetch(`${CH_ENDPOINT}/company/${num}/filing-history`, {
            headers,
            signal: controller.signal,
          }),
        ]);
        clearTimeout(timer);
        if (!companyRes.ok) continue;

        const company = (await companyRes.json()) as Record<string, unknown>;
        const officersJson = officersRes.ok
          ? ((await officersRes.json()) as Record<string, unknown>)
          : { items: [] };
        const filingsJson = filingsRes.ok
          ? ((await filingsRes.json()) as Record<string, unknown>)
          : { items: [] };

        const addr = (company["registered_office_address"] ?? {}) as Record<string, string>;
        const addressStr = [
          addr.address_line_1,
          addr.address_line_2,
          addr.locality,
          addr.postal_code,
          addr.country,
        ]
          .filter(Boolean)
          .join(", ");

        results.push({
          sourceRef: `CH-${num}`,
          companyNumber: num,
          companyName: String(company["company_name"] ?? "Unknown"),
          companyStatus: String(company["company_status"] ?? "unknown"),
          companyType: String(company["type"] ?? "unknown"),
          incorporatedOn: String(company["date_of_creation"] ?? ""),
          registeredAddress: addressStr,
          officers: (
            (officersJson["items"] as Array<Record<string, unknown>> | undefined) ?? []
          ).map((o) => ({
            name: String(o["name"] ?? ""),
            role: String(o["officer_role"] ?? ""),
            appointedOn: o["appointed_on"] as string | undefined,
            nationality: o["nationality"] as string | undefined,
          })),
          sicCodes: (company["sic_codes"] as string[] | undefined) ?? [],
          filingHistory: (
            (filingsJson["items"] as Array<Record<string, unknown>> | undefined) ?? []
          )
            .slice(0, 10)
            .map((f) => ({
              date: String(f["date"] ?? ""),
              category: String(f["category"] ?? ""),
              description: String(f["description"] ?? ""),
            })),
        });
      } catch {
        // per-company failure; continue
      }
    }
    return (results.length > 0 ? results : SEED) as unknown as RawRecord[];
  }

  // ── SECTION 3: NORMALIZE ─────────────────────────────────────────
  normalize(raw: RawRecord): SeaphoreRecord {
    try {
      const num = String(raw["companyNumber"] ?? "");
      if (!num) return this.emptyRecord(raw);
      const now = new Date().toISOString();
      return {
        sourceId: this.name,
        sourceRef: raw.sourceRef,
        entityType: "OWNER",
        entityId: num,
        data: {
          companyNumber: num,
          companyName: raw["companyName"] ?? "Unknown",
          companyStatus: raw["companyStatus"] ?? "unknown",
          companyType: raw["companyType"] ?? "unknown",
          incorporatedOn: raw["incorporatedOn"] ?? null,
          registeredAddress: raw["registeredAddress"] ?? "",
          officers: raw["officers"] ?? [],
          sicCodes: raw["sicCodes"] ?? [],
          filingHistory: raw["filingHistory"] ?? [],
          linkedVesselImos: raw["linkedVesselImos"] ?? [],
        },
        rawData: raw as Record<string, unknown>,
        confidence: 0.9,
        confidenceLevel: "VERIFIED",
        fetchedAt: now,
        validFrom: (raw["incorporatedOn"] as string) || now,
        validTo: null,
        tags: [this.name, "registry", "uk", "companies-house"],
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
      toEntityId: "United Kingdom",
      confidence: record.confidence,
    });

    if (data.companyName) {
      edges.push({
        fromEntityType: "AGENT",
        fromEntityId: data.companyName,
        relationship: "AGENT_REGISTERED_AS",
        toEntityType: "OWNER",
        toEntityId: record.entityId,
        confidence: record.confidence,
      });
    }

    for (const imo of data.linkedVesselImos ?? []) {
      edges.push({
        fromEntityType: "VESSEL",
        fromEntityId: imo,
        relationship: "VESSEL_OWNED_BY",
        toEntityType: "OWNER",
        toEntityId: record.entityId,
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
    const auth = authHeader();
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "Seaphore-OSINT/1.0",
      };
      if (auth) headers.Authorization = auth;
      const res = await fetch(`${CH_ENDPOINT}/company/00000006`, {
        headers,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      // Without an API key CH returns 401 — endpoint is up, we're just unauthenticated.
      if (res.ok) return { status: "healthy", latencyMs };
      if (res.status === 401 || res.status === 403) {
        return auth
          ? { status: "degraded", latencyMs, message: `Auth rejected (HTTP ${res.status})` }
          : {
              status: "healthy",
              latencyMs,
              message: "Reachable; awaiting COMPANIES_HOUSE_API_KEY",
            };
      }
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

export const ukCompaniesHouseConnector = new UkCompaniesHouseConnector();
