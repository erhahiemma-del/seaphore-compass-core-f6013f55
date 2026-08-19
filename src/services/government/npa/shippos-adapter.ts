/**
 * NpaShipposAdapter — Nigerian Ports Authority, SHIPPOS.
 *
 * ## Ships inert, by design
 *
 * No acquisition route is configured, so every fetch returns zero records
 * and a stated reason. That is not a stub: the normalisation, validation,
 * deduplication and lifecycle logic are complete and tested. What is
 * missing is permission, and permission is not something code can supply.
 *
 * The moment NPA provides an export URL or an API, `configureRoute()`
 * turns this on with no other change.
 *
 * ## What it will never do
 *
 * Scrape. SHIPPOS returns HTTP 403 to automated agents and NPA's
 * robots.txt disallows AI crawlers; parsing that HTML would mean evading
 * a control the operator has stated. It is also the worst production
 * architecture available — a table redesign breaks it silently, and
 * silent breakage on a port schedule means an officer sees "no vessels
 * expected" when the truth is "we can no longer read the page".
 */
import { stableHash } from "@/services/ial/hash";

import {
  notConfigured,
  selectRoute,
  type DiscoveryReport,
  type FetchResult,
  type GovernmentDataAdapter,
  type RouteConfig,
} from "../adapter";
import { NPA_SHIPPOS } from "../registry";
import type { AcquisitionRoute, GovernmentDataSource, SourceHealth } from "../types";
import { NPA_SCHEMA_VERSION, type PortCallStage, type PortSchedule } from "./models";

/** Dataset ids this adapter serves. */
export const NPA_DATASETS = {
  expected: "npa.vessels-expected",
  awaitingBerth: "npa.awaiting-berth",
  atBerth: "npa.at-berth",
  departed: "npa.departed",
} as const;

export type NpaDatasetId = (typeof NPA_DATASETS)[keyof typeof NPA_DATASETS];

/** Which lifecycle stage each dataset reports. */
const DATASET_STAGE: Readonly<Record<string, PortCallStage>> = {
  [NPA_DATASETS.expected]: "EXPECTED",
  [NPA_DATASETS.awaitingBerth]: "AWAITING_BERTH",
  [NPA_DATASETS.atBerth]: "AT_BERTH",
  [NPA_DATASETS.departed]: "DEPARTED",
};

const NOT_CONFIGURED_REASON =
  "NPA SHIPPOS is not connected. The public portal is available to people, but no machine-readable route (public export URL, official API or authorized feed) has been supplied to Seaphore. No conclusion should be drawn about vessel movements from the absence of records here.";

/* ── Field parsing ─────────────────────────────────────────────── */

/** IMO check digit per IMO Res. A.1078(28): weights 7…2 over the first six. */
export function isValidImo(value: string): boolean {
  if (!/^\d{7}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 6).reduce((acc, digit, i) => acc + digit * (7 - i), 0);
  return sum % 10 === digits[6];
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return typeof value === "number" ? String(value) : null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "-" && trimmed !== "N/A" ? trimmed : null;
}

function decimal(value: unknown): number | null {
  const raw = text(value);
  if (raw === null) return null;
  // Tonnage and lengths arrive with thousands separators and units.
  const cleaned = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(cleaned) ? cleaned : null;
}

/**
 * Parse a date as NPA publishes it.
 *
 * Returns null rather than guessing. A misread ETA is worse than a
 * missing one: an officer can act on a gap, but acts wrongly on a date
 * that is silently a month out because the format was day-first.
 */
export function parseNpaDate(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;

  // ISO first — unambiguous.
  const iso = Date.parse(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !Number.isNaN(iso)) {
    return new Date(iso).toISOString();
  }

  // DD/MM/YYYY or DD-MM-YYYY, optionally with HH:mm. Day-first is the
  // Nigerian convention; assuming month-first would silently shift most
  // dates by weeks.
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(raw);
  if (match) {
    const [, d, m, y, hh = "0", mm = "0"] = match;
    const day = Number(d);
    const month = Number(m);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = Date.UTC(Number(y), month - 1, day, Number(hh), Number(mm));
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  return null;
}

/* ── Adapter ───────────────────────────────────────────────────── */

export class NpaShipposAdapter implements GovernmentDataAdapter<PortSchedule> {
  readonly sourceId = "npa-shippos";
  readonly source: GovernmentDataSource = NPA_SHIPPOS;

  private routes: RouteConfig[] = [];

  /**
   * Supply a sanctioned acquisition route.
   *
   * Called at the composition root once NPA provides access. Until then
   * the adapter has none, and reports that rather than inventing one.
   */
  configureRoute(config: RouteConfig): this {
    this.routes = [...this.routes.filter((r) => r.route !== config.route), config];
    return this;
  }

  clearRoutes(): void {
    this.routes = [];
  }

  discover(): DiscoveryReport {
    const allowed = this.source.integrationMethod;
    const configured = allowed.filter((route) =>
      this.routes.some((r) => r.route === route && r.url),
    );
    return {
      sourceId: this.sourceId,
      configuredRoutes: configured,
      unconfiguredRoutes: allowed.filter((route) => !configured.includes(route)),
      notes:
        configured.length === 0
          ? [
              NOT_CONFIGURED_REASON,
              "NPA_API_DOCUMENTATION_NOT_FOUND — no official developer documentation was located through permitted search.",
              "Acquisition priority when access arrives: PUBLIC_EXPORT → OFFICIAL_API → OFFICIAL_FEED → AUTHORIZED_INSTITUTIONAL_FEED.",
            ]
          : [`Configured routes: ${configured.join(", ")}.`],
    };
  }

  async healthCheck(): Promise<{ health: SourceHealth; detail: string }> {
    if (this.routes.length === 0) {
      return {
        health: "NOT_CONFIGURED",
        detail: NOT_CONFIGURED_REASON,
      };
    }
    if (this.source.license.reviewRequired) {
      return {
        health: "LICENSE_REVIEW",
        detail:
          "A route is configured but NPA's terms have not been reviewed. Publicly accessible does not imply commercially reusable.",
      };
    }
    return { health: "UP", detail: "Route configured." };
  }

  getStatus(): SourceHealth {
    return this.routes.length === 0 ? "NOT_CONFIGURED" : "UP";
  }

  getMetadata(): GovernmentDataSource {
    return this.source;
  }

  /* ── Dataset accessors ───────────────────────────────────────── */

  fetchExpectedVessels(): Promise<FetchResult<PortSchedule>> {
    return this.fetch(NPA_DATASETS.expected);
  }

  fetchAwaitingBerth(): Promise<FetchResult<PortSchedule>> {
    return this.fetch(NPA_DATASETS.awaitingBerth);
  }

  fetchAtBerth(): Promise<FetchResult<PortSchedule>> {
    return this.fetch(NPA_DATASETS.atBerth);
  }

  fetchDeparted(): Promise<FetchResult<PortSchedule>> {
    return this.fetch(NPA_DATASETS.departed);
  }

  async fetch(datasetId: string): Promise<FetchResult<PortSchedule>> {
    return this.fetchExport(datasetId);
  }

  async fetchIncremental(datasetId: string, _sinceIso: string): Promise<FetchResult<PortSchedule>> {
    void _sinceIso;
    return this.fetchExport(datasetId);
  }

  async fetchHistorical(
    datasetId: string,
    _fromIso: string,
    _toIso: string,
  ): Promise<FetchResult<PortSchedule>> {
    void _fromIso;
    void _toIso;
    const started = Date.now();
    return notConfigured<PortSchedule>(
      this.sourceId,
      datasetId,
      "Historical NPA shipping positions are observable as published PDF documents, but no systematic historical export has been provided. Retrieving the archive requires NPA authorization.",
      started,
    );
  }

  /**
   * The single acquisition path.
   *
   * Every other fetch method routes here, so there is one place where
   * access is decided and one place to audit.
   */
  async fetchExport(datasetId: string): Promise<FetchResult<PortSchedule>> {
    const started = Date.now();

    if (!DATASET_STAGE[datasetId]) {
      return notConfigured<PortSchedule>(
        this.sourceId,
        datasetId,
        `Unknown NPA dataset "${datasetId}".`,
        started,
      );
    }

    const route = selectRoute(this.routes, this.source.integrationMethod);
    if (!route?.url) {
      return notConfigured<PortSchedule>(this.sourceId, datasetId, NOT_CONFIGURED_REASON, started);
    }

    // Reached only once NPA supplies a route. The transport is deliberately
    // thin — the value in this adapter is the normalisation below, which is
    // already exercised by tests against fixture payloads.
    try {
      const url = new URL(route.url);
      for (const [key, value] of Object.entries(route.params ?? {})) {
        url.searchParams.set(key, value);
      }
      const response = await fetch(url, { method: route.method ?? "GET" });
      if (!response.ok) {
        return {
          sourceId: this.sourceId,
          datasetId,
          records: [],
          route: route.route,
          health: response.status === 401 || response.status === 403 ? "AUTH_REQUIRED" : "DOWN",
          unavailableReason: `NPA export returned HTTP ${response.status}.`,
          sourceTimestamp: null,
          retrievedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
        };
      }

      const payload = route.format === "CSV" ? await response.text() : await response.json();
      const records = this.deduplicate(this.normalize(payload, datasetId));

      return {
        sourceId: this.sourceId,
        datasetId,
        records,
        route: route.route,
        health: "UP",
        unavailableReason: null,
        sourceTimestamp: records[0]?.sourceTimestamp ?? null,
        retrievedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        sourceId: this.sourceId,
        datasetId,
        records: [],
        route: route.route,
        health: "DOWN",
        unavailableReason: `NPA export failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        sourceTimestamp: null,
        retrievedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      };
    }
  }

  /* ── Normalisation ───────────────────────────────────────────── */

  /**
   * Map raw rows to `PortSchedule`.
   *
   * Tolerant of column naming because the field list is operator-supplied
   * and unverified against the wire: `IMO Number`, `imo_number` and `imo`
   * must all land in the same place, or the first schema surprise drops
   * every identifier silently.
   */
  normalize(raw: unknown, datasetId: string): readonly PortSchedule[] {
    const rows = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { data?: unknown[] } | null)?.data)
        ? (raw as { data: unknown[] }).data
        : [];

    const stage = DATASET_STAGE[datasetId] ?? "EXPECTED";
    const retrievedAt = new Date().toISOString();

    return rows
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => this.normalizeRow(row, datasetId, stage, retrievedAt))
      .filter((record): record is PortSchedule => record !== null);
  }

  private normalizeRow(
    row: Record<string, unknown>,
    datasetId: string,
    stage: PortCallStage,
    retrievedAt: string,
  ): PortSchedule | null {
    const pick = (...keys: string[]): unknown => {
      for (const key of keys) {
        const direct = row[key];
        if (direct !== undefined && direct !== null) return direct;
        // Case- and separator-insensitive fallback.
        const found = Object.keys(row).find(
          (k) =>
            k.toLowerCase().replace(/[\s_-]/g, "") === key.toLowerCase().replace(/[\s_-]/g, ""),
        );
        if (found && row[found] !== undefined && row[found] !== null) return row[found];
      }
      return undefined;
    };

    const vesselName = text(pick("vessel", "vessel_name", "vesselname", "name"));
    // A row with no vessel names nothing. Dropped rather than kept as a
    // schedule entry for an unnamed ship.
    if (!vesselName) return null;

    const rawImo = text(pick("imo_number", "imo", "imonumber"));
    // An IMO failing its check digit is recorded as absent, not as a bad
    // identifier: a wrong IMO would merge two different vessels.
    const imo = rawImo && isValidImo(rawImo) ? rawImo : null;

    const record: Omit<PortSchedule, "contentHash"> = {
      id: `${this.sourceId}:${datasetId}:${imo ?? vesselName}:${text(pick("eta", "arrival_date")) ?? retrievedAt}`,
      source: this.sourceId,
      datasetId,
      vessel: {
        name: vesselName,
        imo,
        mmsi: text(pick("mmsi")),
        callSign: text(pick("call_sign", "callsign")),
        lengthM: decimal(pick("length", "loa", "length_overall")),
      },
      portId: null,
      portName: text(pick("port", "port_name")),
      terminalId: null,
      terminalName: text(pick("terminal", "terminal_name")),
      berthId: null,
      berthName: text(pick("berth", "berth_no", "berth_number")),
      stage,
      eta: parseNpaDate(pick("eta", "expected_arrival")),
      etd: parseNpaDate(pick("etd", "expected_departure")),
      arrivalDate: parseNpaDate(pick("arrival_date", "arrived", "date_of_arrival")),
      berthDate: parseNpaDate(pick("berth_date", "berthed")),
      departureDate: parseNpaDate(pick("departure_date", "departed")),
      scheduledDate: parseNpaDate(pick("scheduled_date", "schedule_date", "date")),
      agent: text(pick("agent", "shipping_agent")),
      cargo: text(pick("cargo")),
      commodity: text(pick("commodity")),
      tonnage: decimal(pick("tonnage", "gross_tonnage", "cargo_tonnage")),
      rotation: text(pick("rotation")),
      shipToFollow: text(pick("ship_to_follow", "shiptofollow")),
      location: text(pick("location")),
      status: text(pick("status")),
      sourceUrl: this.source.officialUrl,
      sourceRecordId: text(pick("id", "record_id")),
      sourceTimestamp: parseNpaDate(pick("source_timestamp", "updated_at", "as_of")),
      retrievedAt,
      schemaVersion: NPA_SCHEMA_VERSION,
      // Confidence that the ROW was parsed correctly — not that the vessel
      // will arrive. A row carrying a valid IMO and a parsed ETA is
      // unambiguous; one identified only by name is not.
      confidence: imo ? 0.95 : 0.6,
    };

    return { ...record, contentHash: stableHash(record) };
  }

  validate(records: readonly PortSchedule[]): {
    valid: readonly PortSchedule[];
    rejected: readonly { record: PortSchedule; reason: string }[];
  } {
    const valid: PortSchedule[] = [];
    const rejected: { record: PortSchedule; reason: string }[] = [];

    for (const record of records) {
      if (!record.vessel.name) {
        rejected.push({ record, reason: "No vessel name" });
        continue;
      }
      if (record.tonnage !== null && record.tonnage < 0) {
        rejected.push({ record, reason: "Negative tonnage" });
        continue;
      }
      if (record.vessel.lengthM !== null && record.vessel.lengthM > 500) {
        // The longest vessel ever built was 458 m. Beyond 500 m the field
        // is a unit error or a misparsed column.
        rejected.push({ record, reason: `Implausible length ${record.vessel.lengthM} m` });
        continue;
      }
      if (record.eta && record.etd && Date.parse(record.etd) < Date.parse(record.eta)) {
        rejected.push({ record, reason: "ETD precedes ETA" });
        continue;
      }
      valid.push(record);
    }

    return { valid, rejected };
  }

  /** De-duplicate by content hash. Same row twice is one observation. */
  deduplicate(records: readonly PortSchedule[]): readonly PortSchedule[] {
    const seen = new Map<string, PortSchedule>();
    for (const record of records) {
      if (!seen.has(record.contentHash)) seen.set(record.contentHash, record);
    }
    return [...seen.values()];
  }
}

/** Process-wide instance. Unconfigured until NPA grants access. */
export const npaShippos = new NpaShipposAdapter();

/** Routes this adapter would accept, in priority order. */
export const NPA_ACCEPTED_ROUTES: readonly AcquisitionRoute[] = NPA_SHIPPOS.integrationMethod;
