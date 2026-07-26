/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — MASTER TEMPLATE
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Copy this folder to `src/connectors/<your-source>/` and replace every
 *  block marked `TODO`. Do NOT change section order, method names, or
 *  return types — the scheduler, ingestion pipeline, and dashboard all
 *  key off this contract.
 *
 *  Once implemented, register the connector in
 *  `src/lib/osint/connectors/index.ts` — the engine handles everything
 *  else (scheduling, retry, dead-letter, health, graph writes).
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
import { baseConfidence, confidenceLevelFor } from "@/lib/osint/confidence";
import {
  AuthError,
  NetworkError,
  ParseError,
  RateLimitError,
} from "@/lib/osint/errors";

/**
 * The engine calls this to persist normalized records. The template
 * imports it lazily so this file can also be loaded in a test runner
 * that does not stub the server client.
 */
async function runSharedIngestionPipeline(
  connector: ConnectorInterface,
  records: SeaphoreRecord[],
): Promise<IngestionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ingestRecords } = await import("@/lib/osint/ingestion");
  // The scheduler normally owns the sync-run row and passes its id in.
  // When ingest() is invoked outside the scheduler (backfill scripts,
  // ad-hoc replays) we look up the connector row and open a one-off
  // run so DLQ inserts still link to a real run.
  const { data: connectorRow } = await supabaseAdmin
    .from("osint_connectors")
    .select("id")
    .eq("name", connector.name)
    .single();
  const connectorId = (connectorRow as { id: string } | null)?.id;
  if (!connectorId) {
    throw new Error(
      `Connector ${connector.name} is not registered — cannot ingest`,
    );
  }
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
  return ingestRecords(supabaseAdmin, connector, runId, records);
}

/**
 * TEMPLATE CLASS — rename to `<SourceName>Connector`.
 *
 * Every connector implements ConnectorInterface. A class is used here
 * so authentication state, HTTP client, and pagination cursors can be
 * kept on `this` without polluting module scope.
 */
export class TemplateConnector implements ConnectorInterface {
  // ───────────────────────────────────────────────────────────────────
  //  SECTION 1: METADATA
  // ───────────────────────────────────────────────────────────────────
  // TODO: fill in for your source. `name` MUST be unique across all
  // connectors and stable — it is the join key in `osint_connectors`
  // and the value stored on every record's `source_id`.

  readonly name = "template-source";
  readonly description =
    "TODO: one-sentence description of what this source publishes and why Seaphore ingests it.";
  readonly category: OsintCategory = "AIS"; // TODO: AIS | SANCTIONS | REGISTRY | WEATHER | IMAGERY | TRADE | COMPLIANCE
  readonly authMethod: OsintAuthMethod = "api_key"; // TODO: none | api_key | oauth | credentials
  readonly endpoint = "https://example.com/api/v1"; // TODO
  readonly pollingIntervalMinutes = 60; // TODO — align with the source's freshness SLA
  readonly rateLimitPerMinute = 30; // TODO — from the provider's docs

  /**
   * Provenance grade drives baseline record confidence:
   *   government (0.9), commercial_verified (0.75),
   *   aggregated (0.6), scraped (0.4).
   * TODO: pick the honest grade for this source.
   */
  readonly provenance: OsintProvenance = "commercial_verified";

  // ───────────────────────────────────────────────────────────────────
  //  SECTION 2: AUTHENTICATION
  // ───────────────────────────────────────────────────────────────────
  // Reads credentials from environment variables only. Never hardcode
  // API keys or secrets in this file. Throws AuthError if a required
  // env var is missing so the scheduler surfaces a clean failure.

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "Seaphore-OSINT/1.0",
    };

    if (this.authMethod === "api_key") {
      // TODO: rename env var to `<SOURCE>_API_KEY`.
      const apiKey = process.env.TEMPLATE_SOURCE_API_KEY;
      if (!apiKey) {
        throw new AuthError(
          `Missing env var TEMPLATE_SOURCE_API_KEY — required by ${this.name} connector`,
        );
      }
      // TODO: use the header format the provider expects.
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // TODO: handle oauth / credentials variants here if needed.

    return headers;
  }

  // ───────────────────────────────────────────────────────────────────
  //  SECTION 3: FETCH
  // ───────────────────────────────────────────────────────────────────
  // Returns the source's raw payloads unchanged. Pagination lives here
  // — accumulate pages into a single array before returning. Throws
  // typed errors so the scheduler can distinguish 429 (cool-down) from
  // 500 (retry with backoff) from 401 (alert operator).

  async fetch(): Promise<RawRecord[]> {
    const all: RawRecord[] = [];
    let cursor: string | null = null;
    const MAX_PAGES = 50; // TODO: raise if the source is large; keep a ceiling to avoid runaway loops.

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(this.endpoint);
      if (cursor) url.searchParams.set("cursor", cursor);

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: "GET",
          headers: this.buildHeaders(),
        });
      } catch (err) {
        throw new NetworkError(`Network failure calling ${this.name}`, err);
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after")) || undefined;
        throw new RateLimitError(`${this.name} rate limited`, retryAfter);
      }
      if (response.status === 401 || response.status === 403) {
        throw new AuthError(`${this.name} auth failed with ${response.status}`);
      }
      if (!response.ok) {
        throw new NetworkError(`${this.name} returned ${response.status}`);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (err) {
        throw new ParseError(`${this.name} returned invalid JSON`, err);
      }

      // TODO: adjust to the source's envelope shape.
      const payload = body as { items?: unknown[]; next_cursor?: string | null };
      const items = Array.isArray(payload.items) ? payload.items : [];
      for (const item of items) {
        // TODO: attach the source's stable id as `sourceRef` — this is
        // the dedupe key inside `osint_records`.
        const record = item as Record<string, unknown>;
        all.push({
          ...record,
          sourceRef: String(record["id"] ?? crypto.randomUUID()),
        });
      }

      cursor = payload.next_cursor ?? null;
      if (!cursor) break;
    }

    return all;
  }

  // ───────────────────────────────────────────────────────────────────
  //  SECTION 4: NORMALIZE
  // ───────────────────────────────────────────────────────────────────
  // Maps ONE raw payload to a SeaphoreRecord. Preserves the raw payload
  // verbatim on `rawData`. NEVER throws — return null for unparseable
  // input and the pipeline will skip it (and dead-letter the raw row).

  normalize(raw: RawRecord): SeaphoreRecord {
    try {
      // TODO: map fields from your source's schema.
      const entityId = String(raw["imo"] ?? raw["id"] ?? "");
      if (!entityId) {
        // Signal "unparseable" via an empty entityId; the shared
        // validator will reject the record and route it to the DLQ.
        return this.emptyRecord(raw);
      }

      const now = new Date().toISOString();
      const confidence = baseConfidence(this.provenance);

      return {
        sourceId: this.name,
        sourceRef: raw.sourceRef,
        entityType: "VESSEL", // TODO: pick the correct entity type.
        entityId,
        data: {
          // TODO: normalized fields your app will read.
          imo: raw["imo"],
          name: raw["name"],
          flag: raw["flag"],
          // Relationship-bearing fields must be normalized here, because
          // mapToGraph() reads `data` (never rawData) to emit edges.
          owner: raw["owner"],
          lastPort: raw["lastPort"],
        },

        rawData: raw as Record<string, unknown>,
        confidence,
        // Default confidenceLevel for raw OSINT is OBSERVED; override
        // only if the source is verified/audited by construction.
        confidenceLevel: this.provenance === "government"
          ? confidenceLevelFor(confidence)
          : "OBSERVED",
        fetchedAt: now,
        validFrom: now,
        validTo: null,
        tags: [this.name, this.category.toLowerCase()],
      };
    } catch {
      // Contract: normalize() must never throw.
      return this.emptyRecord(raw);
    }
  }

  private emptyRecord(raw: RawRecord): SeaphoreRecord {
    const now = new Date().toISOString();
    return {
      sourceId: this.name,
      sourceRef: raw.sourceRef ?? "unknown",
      entityType: "ALERT",
      entityId: "", // invalid → pipeline will DLQ
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

  // ───────────────────────────────────────────────────────────────────
  //  SECTION 5: INGEST
  // ───────────────────────────────────────────────────────────────────
  // Delegates to the shared ingestion pipeline. Do not reimplement
  // upsert / DLQ / entity-index logic here — the engine owns that.

  async ingest(records: SeaphoreRecord[]): Promise<IngestionResult> {
    return runSharedIngestionPipeline(this, records);
  }

  // ───────────────────────────────────────────────────────────────────
  //  SECTION 6: KNOWLEDGE GRAPH MAPPING
  // ───────────────────────────────────────────────────────────────────
  // Extract entities and relationships from a normalized record. The
  // scheduler collects these across the batch and upserts them into
  // `osint_graph_edges` (deduped on from+rel+to).

  mapToGraph(record: SeaphoreRecord): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const data = record.data as {
      owner?: { name?: string };
      flag?: string;
      lastPort?: string;
    };

    // TODO: emit only edges your source actually supports.
    if (record.entityType === "VESSEL" && data.owner?.name) {
      edges.push({
        fromEntityType: "VESSEL",
        fromEntityId: record.entityId,
        relationship: "VESSEL_OWNED_BY",
        toEntityType: "OWNER",
        toEntityId: data.owner.name,
        confidence: record.confidence,
      });
    }
    if (record.entityType === "VESSEL" && data.flag) {
      edges.push({
        fromEntityType: "VESSEL",
        fromEntityId: record.entityId,
        relationship: "VESSEL_FLAGGED_IN",
        toEntityType: "PORT",
        toEntityId: data.flag,
        confidence: record.confidence,
      });
    }
    if (record.entityType === "VESSEL" && data.lastPort) {
      edges.push({
        fromEntityType: "VESSEL",
        fromEntityId: record.entityId,
        relationship: "VESSEL_CALLED_AT",
        toEntityType: "PORT",
        toEntityId: data.lastPort,
        confidence: record.confidence,
      });
    }

    return edges;
  }

  /**
   * Adapter — the engine's scheduler calls `extractEdges`, but the
   * template contract exposes the more descriptive `mapToGraph`. Keep
   * both wired so this class works with the shared scheduler as-is.
   */
  extractEdges(record: SeaphoreRecord): GraphEdge[] {
    return this.mapToGraph(record);
  }

  // ───────────────────────────────────────────────────────────────────
  //  SECTION 7: HEALTH CHECK
  // ───────────────────────────────────────────────────────────────────
  // Lightweight probe (HEAD or cheap GET). Must return within 5s or
  // the connector is marked "down".

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(this.endpoint, {
        method: "HEAD",
        headers: this.buildHeaders(),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (response.status === 429) {
        return { status: "degraded", latencyMs, message: "rate limited" };
      }
      if (response.status >= 500) {
        return { status: "down", latencyMs, message: `HTTP ${response.status}` };
      }
      if (!response.ok && response.status !== 405) {
        // 405 = HEAD not supported; treat as reachable.
        return { status: "degraded", latencyMs, message: `HTTP ${response.status}` };
      }
      return { status: "healthy", latencyMs };
    } catch (err) {
      return {
        status: "down",
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Export a singleton — this is the value you register in
 * `src/lib/osint/connectors/index.ts`.
 */
export const templateConnector = new TemplateConnector();
