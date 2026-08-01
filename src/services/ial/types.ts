/**
 * Intelligence Acquisition Layer (IAL) — canonical types.
 *
 * The IAL is the single gateway between external data providers and the
 * Operational Intelligence Engine (OIE). Every provider — AIS, Equasis,
 * IMO, MarineTraffic, OpenSanctions, NOAA, GFW, Customs, NIMASA, and
 * future commercial APIs — MUST return values that conform to
 * `NormalizedEvidence`, and the OIE MUST consume evidence exclusively via
 * an `EvidencePackage` produced by the Evidence Package Builder.
 */

/** Providers the IAL currently knows about. Adding a provider does not
 *  require touching the OIE — only registering a connector. */
export type ConnectorId =
  | "ais"
  | "equasis"
  | "imo-gisis"
  | "marinetraffic"
  | "opensanctions"
  | "noaa"
  | "gfw"
  | "customs"
  | "nimasa"
  | (string & {});

/** Seaphore-canonical entity kinds. */
export type EntityKind = "vessel" | "company" | "person" | "port" | "cargo" | "voyage";

/** OC-001 confidence grades — kept in lockstep with the compliance rules. */
export type EvidenceGrade =
  | "VERIFIED"
  | "CORROBORATED"
  | "OBSERVED"
  | "REPORTED"
  | "INFERRED"
  | "UNKNOWN";

export interface CanonicalEntityRef {
  readonly kind: EntityKind;
  /** Canonical id, e.g. `vessel:imo:9438291`, `company:cac:RC-123`,
   *  `port:unlocode:NGLOS`. */
  readonly id: string;
  /** Preferred display label. */
  readonly label?: string;
}

/**
 * The Seaphore Evidence Model — every provider normalises into this.
 *
 * Field values are always Seaphore-canonical: SI units (metres, knots,
 * tonnes), ISO 8601 UTC timestamps, ISO 3166 country codes, IMO numbers as
 * 7-digit strings, UN/LOCODE for ports.
 */
export interface NormalizedEvidence {
  readonly id: string;
  readonly source: ConnectorId;
  readonly sourceName: string;
  readonly grade: EvidenceGrade;

  readonly entity: CanonicalEntityRef;
  readonly kind:
    | "identity"
    | "position"
    | "voyage"
    | "ownership"
    | "cargo"
    | "sanctions"
    | "compliance"
    | "port-call"
    | "inspection"
    | "incident"
    | "weather"
    | "other";

  /** Normalised, Seaphore-canonical fields. Providers translate their
   *  native fields into this map — never the other way around. */
  readonly fields: Readonly<Record<string, EvidenceFieldValue>>;

  /** ISO 8601 UTC. When the fact was true, not when it was fetched. */
  readonly observedAt: string;
  /** ISO 8601 UTC. When the IAL retrieved / cached the record. */
  readonly retrievedAt: string;
  /** Seconds since `observedAt`; recomputed by the Package Builder. */
  readonly freshnessSeconds: number;

  /** Content hash over the normalised payload — used for dedupe and
   *  citation stability. */
  readonly hash: string;
  /** Provider-native primary key, kept for traceability. */
  readonly providerRecordId?: string;
  readonly units?: Readonly<Record<string, string>>;
  readonly excerpt?: string;
}

export type EvidenceFieldValue = string | number | boolean | null | ReadonlyArray<string | number>;

/** A single validation issue attached to an evidence record; the pipeline
 *  never drops a record on validation failure — it flags it. */
export interface ValidationIssue {
  readonly evidenceId: string;
  readonly code:
    | "missing-required"
    | "stale"
    | "unit-mismatch"
    | "timestamp-drift"
    | "duplicate"
    | "low-source-confidence";
  readonly message: string;
  readonly severity: "info" | "warn" | "error";
}

/** Result of a single connector call. */
export interface ConnectorResult {
  readonly connectorId: ConnectorId;
  readonly ok: boolean;
  readonly records: ReadonlyArray<NormalizedEvidence>;
  readonly error?: string;
  readonly latencyMs: number;
}

/** IAL query — connector-agnostic, entity-shaped. */
export interface AcquisitionQuery {
  readonly entity?: CanonicalEntityRef;
  /** Free-text query for search-oriented connectors (sanctions, OSINT). */
  readonly text?: string;
  /** Which evidence kinds the caller cares about. Empty = all. */
  readonly kinds?: ReadonlyArray<NormalizedEvidence["kind"]>;
  /** Optional connector allowlist; empty = every registered connector. */
  readonly connectors?: ReadonlyArray<ConnectorId>;
  /** Force a bypass of the local cache. */
  readonly forceRefresh?: boolean;
}

/**
 * The single artefact the OIE receives from the IAL.
 *
 * The OIE remains provider-independent because it only ever reads from
 * `verified` / `conflicting` / `missing`, plus the summary metadata.
 */
export interface EvidencePackage {
  readonly id: string;
  readonly createdAt: string;
  readonly query: AcquisitionQuery;

  /** Records that passed validation and reached a resolved canonical
   *  entity. Sorted by grade DESC, freshness ASC. */
  readonly verified: ReadonlyArray<NormalizedEvidence>;
  /** Records that describe the same field on the same entity with
   *  divergent values. */
  readonly conflicting: ReadonlyArray<EvidenceConflict>;
  /** Evidence kinds requested but not returned by any connector. */
  readonly missing: ReadonlyArray<NormalizedEvidence["kind"]>;
  /** Every validation issue collected across the pipeline. */
  readonly issues: ReadonlyArray<ValidationIssue>;

  readonly sources: ReadonlyArray<SourceAttribution>;
  readonly canonicalEntities: ReadonlyArray<CanonicalEntityRef>;
  readonly summary: EvidenceSummary;
}

export interface EvidenceConflict {
  readonly entity: CanonicalEntityRef;
  readonly field: string;
  readonly values: ReadonlyArray<{
    readonly value: EvidenceFieldValue;
    readonly evidenceId: string;
    readonly source: ConnectorId;
    readonly grade: EvidenceGrade;
  }>;
}

export interface SourceAttribution {
  readonly connectorId: ConnectorId;
  readonly sourceName: string;
  readonly records: number;
  readonly grade: EvidenceGrade;
  readonly latencyMs: number;
}

export interface EvidenceSummary {
  readonly totalRecords: number;
  readonly verifiedCount: number;
  readonly corroboratedCount: number;
  readonly conflictCount: number;
  readonly sourcesQueried: number;
  readonly sourcesResponded: number;
  readonly cacheHits: number;
  readonly averageFreshnessSeconds: number;
}

/** Connector runtime health — surfaced only to administrators. */
export interface ConnectorHealth {
  readonly connectorId: ConnectorId;
  readonly available: boolean;
  readonly authenticated: boolean;
  readonly latencyMsP50: number;
  readonly failureRate: number; // 0..1
  readonly quotaRemaining: number | null;
  readonly lastSuccessAt: string | null;
  readonly lastError: string | null;
}
