/**
 * Mock OSINT connector — proves the engine end-to-end.
 *
 * Emits two synthetic VESSEL records plus one always-invalid payload so
 * the dead-letter queue can be verified. Extracts a VESSEL → OWNER edge
 * so the knowledge-graph pipeline is exercised too.
 */
import type {
  ConnectorInterface,
  GraphEdge,
  IngestionResult,
  RawRecord,
  SeaphoreRecord,
} from "../types";
import { baseConfidence, confidenceLevelFor } from "../confidence";

const PROVENANCE = "commercial_verified" as const;

export const mockAisConnector: ConnectorInterface = {
  name: "mock-ais",
  description:
    "Synthetic AIS feed used to validate the OSINT Integration Engine. Emits two VESSEL records and one intentionally-invalid payload per fetch.",
  category: "AIS",
  authMethod: "none",
  endpoint: "mock://ais",
  pollingIntervalMinutes: 15,
  rateLimitPerMinute: 60,
  provenance: PROVENANCE,

  async fetch(): Promise<RawRecord[]> {
    const now = new Date().toISOString();
    return [
      {
        sourceRef: "mock-ais-9700001",
        imo: "9700001",
        name: "MV Harmattan Star",
        flag: "NG",
        type: "Bulk Carrier",
        owner: { name: "Atlantic Bulk Holdings", country: "NG" },
        port: "NGAPP",
        timestamp: now,
      },
      {
        sourceRef: "mock-ais-9700002",
        imo: "9700002",
        name: "MV Delta Voyager",
        flag: "LR",
        type: "Container Ship",
        owner: { name: "Delta Marine Ltd", country: "LR" },
        port: "NGTIN",
        timestamp: now,
      },
      // Intentionally malformed — should land in dead-letter queue.
      {
        sourceRef: "mock-ais-broken",
        // no imo, no name → normalize will emit an invalid record
        __invalid: true,
      },
    ];
  },

  normalize(raw: RawRecord): SeaphoreRecord {
    const confidence = baseConfidence(PROVENANCE);
    const invalid = raw["__invalid"] === true;
    const imo = typeof raw.imo === "string" ? raw.imo : "";
    return {
      sourceId: this.name,
      sourceRef: raw.sourceRef,
      entityType: "VESSEL",
      entityId: invalid ? "" : imo,
      data: invalid
        ? {}
        : {
            imo,
            name: raw.name,
            flag: raw.flag,
            type: raw.type,
            lastPort: raw.port,
            owner: raw.owner,
          },
      rawData: raw as Record<string, unknown>,
      confidence,
      confidenceLevel: confidenceLevelFor(confidence),
      fetchedAt: new Date().toISOString(),
      validFrom: new Date().toISOString(),
      validTo: null,
      tags: ["mock", "ais"],
    };
  },

  async ingest(records: SeaphoreRecord[]): Promise<IngestionResult> {
    // The engine's ingestion pipeline handles persistence; connectors
    // may implement custom pre-ingest logic here. Mock just reports.
    return {
      fetched: records.length,
      ingested: records.length,
      errors: [],
      deadLettered: 0,
    };
  },

  async healthCheck() {
    return { status: "healthy", latencyMs: 1 };
  },

  extractEdges(record: SeaphoreRecord): GraphEdge[] {
    const owner = (record.data as { owner?: { name?: string } }).owner;
    if (!owner?.name || !record.entityId) return [];
    return [
      {
        fromEntityType: "VESSEL",
        fromEntityId: record.entityId,
        relationship: "VESSEL_OWNED_BY",
        toEntityType: "OWNER",
        toEntityId: owner.name,
        confidence: record.confidence,
      },
    ];
  },
};
