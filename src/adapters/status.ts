/**
 * Data Source Matrix — canonical status contracts.
 *
 * Every adapter in `src/adapters/**` MUST declare its status through the
 * matrix defined in `matrix.ts`. This file defines the shared vocabulary so
 * feature code and UI can uniformly render a source's honesty state
 * (status + confidence + last-updated) alongside any data it returns.
 *
 * Rules enforced downstream:
 * - ACTIVE       → adapter returns live data
 * - PARTIAL      → adapter returns only the fields it can verify; others null
 * - PLANNED      → adapter throws {@link PlannedSourceError}; UI shows
 *                  "Data unavailable" with the last-known timestamp
 * - INFERRED     → adapter returns computed data with an INFERRED chip
 * - NOT_IN_SCOPE → adapter refuses; feature is not shipped
 */

export type SourceStatus =
  | "ACTIVE"
  | "PARTIAL"
  | "PLANNED"
  | "INFERRED"
  | "NOT_IN_SCOPE";

export type SourceKind =
  | "ais"
  | "ais_history"
  | "vessel_ref"
  | "company_reg"
  | "sanctions"
  | "upload"
  | "trade"
  | "model"
  | "revenue"
  | "market"
  | "flag"
  | "ownership"
  | "insurance"
  | "weather"
  | "ocr"
  | "ai";

export type SourceScope =
  | "osint"
  | "commercial"
  | "internal"
  | "user"
  | "ai";

export type ConfidenceLabel =
  | "VERIFIED"
  | "AUDITED"
  | "CORROBORATED"
  | "DECLARED"
  | "OBSERVED"
  | "INFERRED";

export interface SourceRegistryEntry {
  /** Stable slug — matches public.data_sources.id */
  id: string;
  dataType: string;
  provider: string;
  status: SourceStatus;
  kind: SourceKind;
  defaultConfidence: ConfidenceLabel;
  citation: string;
  scope: SourceScope;
  notes?: string;
}

/** Thrown when feature code calls a PLANNED source. Never rendered as data. */
export class PlannedSourceError extends Error {
  readonly code = "SOURCE_PLANNED";
  constructor(public readonly sourceId: string, public readonly provider: string) {
    super(
      `[Seaphore] Source "${sourceId}" (${provider}) is PLANNED. ` +
        `No live data available — UI must show last-known + timestamp.`,
    );
  }
}

/** Thrown when feature code calls a source explicitly out of scope. */
export class OutOfScopeSourceError extends Error {
  readonly code = "SOURCE_OUT_OF_SCOPE";
  constructor(public readonly sourceId: string) {
    super(`[Seaphore] Source "${sourceId}" is NOT_IN_SCOPE and must not be used.`);
  }
}

/** Envelope every adapter returns, so UI can render honesty metadata. */
export interface SourcedResult<T> {
  data: T | null;
  source: SourceRegistryEntry;
  observedAt: string; // ISO timestamp of the underlying observation
  fetchedAt: string;  // ISO timestamp when Seaphore retrieved it
  confidence: ConfidenceLabel;
  /** True when {@link data} was computed by Seaphore, not observed. */
  inferred?: boolean;
  /** Non-fatal degradation reason (e.g. "cache hit", "partial fields"). */
  degradedReason?: string;
}
