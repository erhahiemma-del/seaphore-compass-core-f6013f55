/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-GOV-01 — Government Maritime Evidence Foundation
 *  Agency-agnostic adapter contract.
 * ─────────────────────────────────────────────────────────────────────
 *
 *  ONE Evidence Provider serves every Nigerian government maritime
 *  authority. Each authority is an ADAPTER behind that provider — the
 *  same shape the Environmental Intelligence Provider uses for its
 *  sources. No agency-specific logic ever enters the provider.
 *
 *  This module declares types only. It creates no cache, no registry,
 *  no orchestration, and touches none of the frozen layers (Evidence
 *  Provider Framework, Connector Framework, Provider Resolver, IAL,
 *  IFE, Canonical UIP, OKL, OIE, MIBC, Authentication,
 *  CAPABILITY.CARGO v1.0).
 * ─────────────────────────────────────────────────────────────────────
 */
import type { EvidenceFieldValue } from "@/services/ial/types";

/** Government authorities this foundation can carry. Open by design. */
export type GovernmentAgencyCode = "NCS" | "NIMASA" | "NPA" | (string & {});

/**
 * Authoritative government evidence classes required by EP-GOV-01.
 * These are the ONLY record types the provider projects; an adapter that
 * cannot map a payload into one of them returns nothing for it.
 */
export type GovernmentRecordType =
  | "customs-declaration"
  | "cargo-declaration"
  | "manifest-return"
  | "revenue-assessment"
  | "inspection-record"
  | "voyage-report"
  | "port-clearance"
  | "container-event";

export const GOVERNMENT_RECORD_TYPES: ReadonlyArray<GovernmentRecordType> = [
  "customs-declaration",
  "cargo-declaration",
  "manifest-return",
  "revenue-assessment",
  "inspection-record",
  "voyage-report",
  "port-clearance",
  "container-event",
];

/**
 * One authoritative record, already translated by the adapter into the
 * agency-neutral government vocabulary. The provider maps this — and
 * only this — into canonical Cargo evidence.
 */
export interface GovernmentEvidenceRecord {
  readonly agency: GovernmentAgencyCode;
  readonly agencyName: string;
  readonly recordType: GovernmentRecordType;
  /** Agency-native primary key, preserved for traceability and replay. */
  readonly recordId: string;
  /** Officer-facing label for the subject of the record. */
  readonly label?: string;
  /** ISO 8601 UTC — when the fact was true, not when it was fetched. */
  readonly occurredAt?: string;
  /** ISO 8601 UTC — when the agency last amended the record. */
  readonly updatedAt?: string;
  /** Canonical CAPABILITY.CARGO fields. Adapters translate into these. */
  readonly fields: Readonly<Record<string, EvidenceFieldValue>>;
  /** Canonical entity references (`rel.*` keys without the prefix). */
  readonly links?: Readonly<Record<string, string | null>>;
  readonly units?: Readonly<Record<string, string>>;
  readonly excerpt?: string;
  /** Raw agency payload retained ONLY for lineage hashing. */
  readonly raw?: unknown;
}

/** Runtime context an adapter receives. It owns no I/O of its own. */
export interface GovernmentAdapterContext {
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
  /** Resolved from the adapter's declared base-URL env names. */
  readonly baseUrl: string | null;
  /** Resolved from the adapter's declared credential env names. */
  readonly credential: string | null;
}

/** Agency-neutral acquisition request handed to every adapter. */
export interface GovernmentAdapterQuery {
  /** Free-text subject: SAD number, B/L, container, IMO, vessel name. */
  readonly term: string;
  /** Optional canonical entity id when the caller already resolved one. */
  readonly entityId?: string;
  /** Record types the caller cares about. Empty = all supported. */
  readonly recordTypes?: ReadonlyArray<GovernmentRecordType>;
}

/** Adapter acquisition outcome. Failure is reported, never simulated. */
export interface GovernmentAdapterResult {
  readonly agency: GovernmentAgencyCode;
  readonly ok: boolean;
  readonly records: ReadonlyArray<GovernmentEvidenceRecord>;
  readonly error?: string;
  readonly latencyMs: number;
}

/** Configuration state of an agency integration, honestly reported. */
export interface GovernmentAdapterStatus {
  readonly agency: GovernmentAgencyCode;
  readonly agencyName: string;
  readonly configured: boolean;
  readonly authenticated: boolean;
  readonly baseUrlEnv: ReadonlyArray<string>;
  readonly credentialEnv: ReadonlyArray<string>;
  readonly recordTypes: ReadonlyArray<GovernmentRecordType>;
  /** Why acquisition is impossible right now, when it is. */
  readonly reason: string | null;
}

/**
 * The reusable Government Adapter contract. Adding NCS, NIMASA, NPA or
 * any future authority means adding one file that implements this — the
 * provider, the framework, and CAPABILITY.CARGO stay untouched.
 */
export interface GovernmentAgencyAdapter {
  readonly agency: GovernmentAgencyCode;
  readonly agencyName: string;
  /** Env names carrying the agency endpoint. First name is canonical. */
  readonly baseUrlEnv: ReadonlyArray<string>;
  /** Env names carrying the agency credential. First name is canonical. */
  readonly credentialEnv: ReadonlyArray<string>;
  /** Record types this authority is the source for. */
  readonly recordTypes: ReadonlyArray<GovernmentRecordType>;
  /**
   * Statutory trust weight, 0..1. Government authorities of record sit at
   * the top of the Cargo Confidence Model.
   */
  readonly trustWeight: number;
  /** Liveness probe path appended to the resolved base URL. */
  readonly healthPath: string;
  /** Acquire authoritative records. Throws on transport/auth failure. */
  fetchRecords(
    query: GovernmentAdapterQuery,
    ctx: GovernmentAdapterContext,
  ): Promise<ReadonlyArray<GovernmentEvidenceRecord>>;
}
