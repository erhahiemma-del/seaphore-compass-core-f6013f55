/**
 * Seaphore OSINT Integration Engine — core contract.
 *
 * Every OSINT data source connector implements ConnectorInterface. The
 * engine (registry + scheduler + pipeline + ingestion) does not care
 * where the data comes from; it just needs a connector that can fetch,
 * normalize into a SeaphoreRecord, and report health.
 */

export type OsintCategory =
  | "AIS"
  | "SANCTIONS"
  | "REGISTRY"
  | "WEATHER"
  | "IMAGERY"
  | "TRADE"
  | "COMPLIANCE";

export type OsintAuthMethod = "none" | "api_key" | "oauth" | "credentials";

export type OsintEntityType =
  | "VESSEL"
  | "VOYAGE"
  | "AGENT"
  | "CARGO"
  | "OWNER"
  | "PORT"
  | "SANCTION"
  | "WEATHER"
  | "ALERT";

export type OsintConfidenceLevel =
  | "OBSERVED"
  | "DECLARED"
  | "INFERRED"
  | "CORROBORATED"
  | "VERIFIED"
  | "AUDITED";

export type OsintHealthStatus = "healthy" | "degraded" | "down";
export type OsintSyncStatus = "success" | "partial" | "failed";

/** Provenance grade — drives baseline confidence scoring. */
export type OsintProvenance =
  | "government"
  | "commercial_verified"
  | "aggregated"
  | "scraped";

/** Untyped inbound payload from an external OSINT source. */
export type RawRecord = Record<string, unknown> & {
  sourceRef: string;
};

/** Canonical Seaphore record — every source normalizes to this. */
export interface SeaphoreRecord {
  id?: string; // generated at ingest if omitted
  sourceId: string;
  sourceRef: string;
  entityType: OsintEntityType;
  entityId: string;
  data: Record<string, unknown>;
  rawData: Record<string, unknown>;
  confidence: number;
  confidenceLevel: OsintConfidenceLevel;
  fetchedAt: string;
  validFrom: string;
  validTo: string | null;
  tags: string[];
  syncRunId?: string;
}

export interface HealthStatus {
  status: OsintHealthStatus;
  message?: string;
  latencyMs?: number;
}

export interface IngestionError {
  sourceRef: string;
  error: string;
  rawPayload?: Record<string, unknown>;
}

export interface IngestionResult {
  fetched: number;
  ingested: number;
  errors: IngestionError[];
  deadLettered: number;
}

/** Knowledge-graph edge extracted from an ingested record. */
export interface GraphEdge {
  fromEntityType: OsintEntityType;
  fromEntityId: string;
  relationship:
    | "VESSEL_OWNED_BY"
    | "VESSEL_MANAGED_BY"
    | "VESSEL_FLAGGED_IN"
    | "VESSEL_CALLED_AT"
    | "VESSEL_UNDER_SANCTION"
    | string;
  toEntityType: OsintEntityType;
  toEntityId: string;
  confidence: number;
}

/** The contract every connector must implement. */
export interface ConnectorInterface {
  name: string;
  description: string;
  category: OsintCategory;
  authMethod: OsintAuthMethod;
  endpoint: string;
  pollingIntervalMinutes: number;
  rateLimitPerMinute: number;
  provenance: OsintProvenance;

  fetch(): Promise<RawRecord[]>;
  normalize(raw: RawRecord): SeaphoreRecord;
  ingest(records: SeaphoreRecord[]): Promise<IngestionResult>;
  healthCheck(): Promise<HealthStatus>;

  /**
   * Optional — return edges to write into osint_graph_edges after a
   * record is ingested. Default: no edges.
   */
  extractEdges?(record: SeaphoreRecord): GraphEdge[];
}
