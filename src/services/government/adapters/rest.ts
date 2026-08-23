/**
 * Shared REST plumbing for Government Adapters (Sprint EP-GOV-01).
 *
 * Every Nigerian maritime authority exposes a token-authenticated JSON
 * API over HTTPS. This module holds the ONE implementation of that
 * transport so each agency file contains mapping logic only.
 *
 * No cache, no registry, no state — the frozen EvidenceCache used by the
 * provider is the only cache in the path.
 */
import { timedFetch } from "@/connectors/implementations/shared/provider-io";
import type { EvidenceFieldValue } from "@/services/ial/types";
import type {
  GovernmentAdapterContext,
  GovernmentAdapterQuery,
  GovernmentAgencyAdapter,
  GovernmentAgencyCode,
  GovernmentEvidenceRecord,
  GovernmentRecordType,
} from "../types";

export type AgencyRow = Readonly<Record<string, unknown>>;

/** One agency endpoint bound to one authoritative record type. */
export interface AgencyEndpoint {
  readonly recordType: GovernmentRecordType;
  /** Path appended to the agency base URL. */
  readonly path: string;
  /** Query-string parameter carrying the search term. */
  readonly termParam: string;
  /** Translate one agency row into the agency-neutral vocabulary. */
  readonly map: (row: AgencyRow, ctx: MapContext) => GovernmentEvidenceRecord | null;
}

export interface MapContext {
  readonly agency: GovernmentAgencyCode;
  readonly agencyName: string;
  readonly recordType: GovernmentRecordType;
}

export interface RestAdapterSpec {
  readonly agency: GovernmentAgencyCode;
  readonly agencyName: string;
  readonly baseUrlEnv: ReadonlyArray<string>;
  readonly credentialEnv: ReadonlyArray<string>;
  readonly trustWeight: number;
  readonly healthPath: string;
  readonly endpoints: ReadonlyArray<AgencyEndpoint>;
}

export function str(row: AgencyRow, ...keys: ReadonlyArray<string>): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function num(row: AgencyRow, ...keys: ReadonlyArray<string>): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/** ISO 8601 UTC or null — never a fabricated timestamp. */
export function iso(row: AgencyRow, ...keys: ReadonlyArray<string>): string | null {
  const raw = str(row, ...keys);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Drop null/undefined so completeness scoring stays honest. */
export function compact(
  fields: Readonly<Record<string, EvidenceFieldValue | null | undefined>>,
): Readonly<Record<string, EvidenceFieldValue>> {
  const out: Record<string, EvidenceFieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    out[key] = value;
  }
  return out;
}

function rowsFrom(payload: unknown): ReadonlyArray<AgencyRow> {
  if (Array.isArray(payload)) return payload as ReadonlyArray<AgencyRow>;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "results", "records", "items", "declarations", "returns"]) {
      const value = obj[key];
      if (Array.isArray(value)) return value as ReadonlyArray<AgencyRow>;
    }
    return [obj as AgencyRow];
  }
  return [];
}

/**
 * Build a Government Adapter from a declarative endpoint spec.
 * Everything agency-specific lives in the spec's `map` functions.
 */
export function createRestGovernmentAdapter(spec: RestAdapterSpec): GovernmentAgencyAdapter {
  const recordTypes = spec.endpoints.map((e) => e.recordType);

  return {
    agency: spec.agency,
    agencyName: spec.agencyName,
    baseUrlEnv: spec.baseUrlEnv,
    credentialEnv: spec.credentialEnv,
    recordTypes,
    trustWeight: spec.trustWeight,
    healthPath: spec.healthPath,

    async fetchRecords(
      query: GovernmentAdapterQuery,
      ctx: GovernmentAdapterContext,
    ): Promise<ReadonlyArray<GovernmentEvidenceRecord>> {
      if (!ctx.baseUrl) {
        throw new Error(`${spec.agencyName} endpoint not configured — set ${spec.baseUrlEnv[0]}`);
      }
      if (!ctx.credential) {
        throw new Error(
          `${spec.agencyName} credential not configured — set ${spec.credentialEnv[0]}`,
        );
      }

      const wanted =
        query.recordTypes && query.recordTypes.length > 0
          ? spec.endpoints.filter((e) => query.recordTypes?.includes(e.recordType))
          : spec.endpoints;

      const out: GovernmentEvidenceRecord[] = [];
      for (const endpoint of wanted) {
        const base = ctx.baseUrl.replace(/\/+$/, "");
        const url = `${base}${endpoint.path}?${endpoint.termParam}=${encodeURIComponent(query.term)}`;
        const response = await timedFetch(ctx.fetchImpl, url, ctx.timeoutMs, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${ctx.credential}`,
          },
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error(`${spec.agencyName} rejected the credential (${response.status})`);
        }
        if (response.status === 404) continue;
        if (!response.ok) {
          throw new Error(`${spec.agencyName} ${endpoint.recordType} HTTP ${response.status}`);
        }
        const payload: unknown = await response.json();
        const mapCtx: MapContext = {
          agency: spec.agency,
          agencyName: spec.agencyName,
          recordType: endpoint.recordType,
        };
        for (const row of rowsFrom(payload)) {
          const mapped = endpoint.map(row, mapCtx);
          if (mapped) out.push(mapped);
        }
      }
      return out;
    },
  };
}
