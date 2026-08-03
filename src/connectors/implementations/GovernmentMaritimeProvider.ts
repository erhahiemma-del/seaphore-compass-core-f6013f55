/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-GOV-01 — Government Maritime Evidence Provider
 *  ONE certified provider for every Nigerian maritime authority.
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Implements the frozen Evidence Provider Specification v1.0 and
 *  declares CAPABILITY.CARGO. Each authority (NCS, NIMASA, NPA and any
 *  future agency) sits behind a Government Adapter — the provider itself
 *  contains ZERO agency-specific logic.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → GovernmentMaritimeProvider → EvidencePackage
 *      → IFE → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  HONESTY NOTE — every Nigerian government maritime system is
 *  credentialed with no public API. With no endpoint or credential
 *  configured, this provider reports an explicit acquisition failure and
 *  the officer surface reads "Awaiting Credentials". It never simulates a
 *  declaration, a manifest line, a duty figure or an inspection outcome.
 *
 *  Never: persists, resolves identity, dedupes entities, scores risk,
 *  publishes a UIP, or modifies IAL / IFE / OIE / OKL / MIBC / the
 *  Connector Framework / CAPABILITY.CARGO v1.0. It imports no Supabase
 *  client and writes nothing anywhere.
 * ─────────────────────────────────────────────────────────────────────
 */
import { BaseEvidenceProvider } from "@/connectors/framework/BaseEvidenceProvider";
import type { ProviderValidation } from "@/connectors/framework/spec";
import type { EvidenceCache } from "@/services/ial/cache";
import { stableHash } from "@/services/ial/hash";
import { normalizeRecord } from "@/services/ial/normalizer";
import { validateRecords } from "@/services/ial/validator";
import type { ConnectorCapability } from "@/services/ial/connectors/base";
import type { ProviderMetadata } from "@/services/ial/connectors/provider-metadata";
import type {
  AcquisitionQuery,
  ConnectorId,
  ConnectorResult,
  EntityKind,
  EvidenceFieldValue,
  NormalizedEvidence,
  ValidationIssue,
} from "@/services/ial/types";
import { GOVERNMENT_ADAPTERS } from "@/services/government/adapters";
import {
  aggregateConfidence,
  completeness,
  scoreGovernmentRecord,
  type CargoConfidence,
} from "@/services/government/confidence";
import { buildLineage, type GovernmentLineage } from "@/services/government/lineage";
import type {
  GovernmentAdapterQuery,
  GovernmentAdapterResult,
  GovernmentAdapterStatus,
  GovernmentAgencyAdapter,
  GovernmentEvidenceRecord,
  GovernmentRecordType,
} from "@/services/government/types";
import { readFirstProviderCredential, type ProviderOptions } from "./shared/provider-io";

const TIMEOUT_MS = 12_000;

/** Government records are authority-of-record and change slowly. */
export const GOVERNMENT_MARITIME_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export const GOVERNMENT_MARITIME_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  /** Authority of record — top priority for CARGO evidence. */
  priority: 110,
  environment: "both",
  enabled: true,
};

/** Canonical evidence kind for each authoritative government record. */
const EVIDENCE_KIND: Readonly<Record<GovernmentRecordType, NormalizedEvidence["kind"]>> = {
  "customs-declaration": "compliance",
  "cargo-declaration": "cargo",
  "manifest-return": "cargo",
  "revenue-assessment": "compliance",
  "inspection-record": "inspection",
  "voyage-report": "voyage",
  "port-clearance": "port-call",
  "container-event": "cargo",
};

interface SubjectRef {
  readonly kind: EntityKind;
  readonly nativeId: string;
  readonly label?: string;
}

function subjectOf(record: GovernmentEvidenceRecord): SubjectRef {
  const f = record.fields;
  const links = record.links ?? {};
  const pick = (...keys: ReadonlyArray<string>): string | null => {
    for (const key of keys) {
      const value = f[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return null;
  };

  switch (record.recordType) {
    case "inspection-record":
    case "voyage-report":
    case "port-clearance": {
      const imo = links["vesselImo"];
      const nativeId = imo ?? pick("vesselName") ?? record.recordId;
      return { kind: "vessel", nativeId, label: pick("vesselName") ?? record.label };
    }
    default: {
      const nativeId =
        pick("declarationNumber", "manifestNumber", "containerNumber", "assessmentNumber") ??
        links["billOfLading"] ??
        record.recordId;
      return { kind: "cargo", nativeId, label: record.label };
    }
  }
}

/** Count other records in the same acquisition describing the same subject. */
function corroborationCounts(
  records: ReadonlyArray<GovernmentEvidenceRecord>,
): Map<string, number> {
  const bySubject = new Map<string, string[]>();
  for (const r of records) {
    const key = `${subjectOf(r).kind}:${subjectOf(r).nativeId}`;
    bySubject.set(key, [...(bySubject.get(key) ?? []), r.recordId]);
  }
  const out = new Map<string, number>();
  for (const r of records) {
    const key = `${subjectOf(r).kind}:${subjectOf(r).nativeId}`;
    const siblings = (bySubject.get(key) ?? []).filter((id) => id !== r.recordId);
    const distinctAgencies = new Set(
      records
        .filter((o) => siblings.includes(o.recordId))
        .map((o) => `${o.agency}:${o.recordType}`),
    );
    out.set(r.recordId, distinctAgencies.size);
  }
  return out;
}

export interface GovernmentMaritimeOptions extends ProviderOptions {
  /** Adapter set override — tests inject stubs; production uses the catalog. */
  readonly adapters?: ReadonlyArray<GovernmentAgencyAdapter>;
  /** Explicit base URLs / credentials, bypassing the environment read. */
  readonly config?: Readonly<Record<string, string>>;
}

export class GovernmentMaritimeProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "gov-maritime";
  readonly displayName = "Government Maritime Evidence Provider";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = ["CARGO", "COMPLIANCE"];
  readonly provider: ProviderMetadata = GOVERNMENT_MARITIME_METADATA;
  readonly projectionContractId = "ial.government-maritime-evidence-provider";

  private readonly adapters: ReadonlyArray<GovernmentAgencyAdapter>;
  private readonly fetchImpl: typeof fetch;
  private readonly configOverride: Readonly<Record<string, string>>;
  private lineageByEvidenceId = new Map<string, GovernmentLineage>();
  private confidenceByEvidenceId = new Map<string, CargoConfidence>();
  private lastAgencyResults: ReadonlyArray<GovernmentAdapterResult> = [];
  private lastIssues: ReadonlyArray<ValidationIssue> = [];

  constructor(opts: GovernmentMaritimeOptions = {}) {
    super({
      cache: opts.cache as EvidenceCache | undefined,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? GOVERNMENT_MARITIME_CACHE_TTL_MS,
    });
    this.adapters = opts.adapters ?? GOVERNMENT_ADAPTERS;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.configOverride = opts.config ?? {};
  }

  /** Configuration state of every agency behind this provider. */
  get agencyStatuses(): ReadonlyArray<GovernmentAdapterStatus> {
    return this.adapters.map((adapter) => {
      const baseUrl = this.resolve(adapter.baseUrlEnv);
      const credential = this.resolve(adapter.credentialEnv);
      const configured = Boolean(baseUrl && credential);
      const missing = [
        ...(baseUrl ? [] : [adapter.baseUrlEnv[0]]),
        ...(credential ? [] : [adapter.credentialEnv[0]]),
      ];
      return {
        agency: adapter.agency,
        agencyName: adapter.agencyName,
        configured,
        authenticated: configured,
        baseUrlEnv: adapter.baseUrlEnv,
        credentialEnv: adapter.credentialEnv,
        recordTypes: adapter.recordTypes,
        reason: configured ? null : `Awaiting credentials — set ${missing.join(" and ")}`,
      };
    });
  }

  /** Per-agency outcome of the most recent acquisition. */
  get lastAgencyOutcomes(): ReadonlyArray<GovernmentAdapterResult> {
    return this.lastAgencyResults;
  }

  /** Validation issues raised by the most recent acquisition. */
  get lastValidationIssues(): ReadonlyArray<ValidationIssue> {
    return this.lastIssues;
  }

  /** Full provenance chain for one piece of government evidence. */
  lineageFor(evidenceId: string): GovernmentLineage | null {
    return this.lineageByEvidenceId.get(evidenceId) ?? null;
  }

  /** Cargo Confidence Model breakdown for one piece of evidence. */
  confidenceFor(evidenceId: string): CargoConfidence | null {
    return this.confidenceByEvidenceId.get(evidenceId) ?? null;
  }

  /** Package-level confidence across the most recent acquisition. */
  get packageConfidence(): CargoConfidence {
    return aggregateConfidence(
      Array.from(this.confidenceByEvidenceId.values()).map((confidence) => ({ confidence })),
    );
  }

  override async connect(): Promise<void> {
    await super.connect();
    this.authed = this.agencyStatuses.some((s) => s.configured);
  }

  override async authenticate(): Promise<boolean> {
    const any = this.agencyStatuses.some((s) => s.configured);
    this.authed = any;
    if (!any) {
      this.lastError =
        "No government maritime authority is configured — awaiting agency endpoints and credentials";
    }
    return any;
  }

  /**
   * Normalise one agency-neutral government record into canonical Cargo
   * evidence. Grade comes from the Cargo Confidence Model — an
   * authority-of-record with a complete, corroborated, fresh record
   * reaches VERIFIED; a thin one honestly does not.
   */
  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const record = raw as GovernmentEvidenceRecord | null;
    if (!record || typeof record !== "object" || !record.recordType || !record.recordId) return null;
    const adapter = this.adapters.find((a) => a.agency === record.agency);
    const confidence = scoreGovernmentRecord(record, {
      trustWeight: adapter?.trustWeight ?? 0.9,
      corroborationCount: 0,
      now: this.now(),
    });
    return this.toEvidence(record, confidence);
  }

  override validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    const base = validateRecords(records);
    const extra: ValidationIssue[] = [];
    const seen = new Map<string, string>();

    for (const record of records) {
      const previous = seen.get(record.hash);
      if (previous) {
        extra.push({
          evidenceId: record.id,
          code: "duplicate",
          message: `Duplicate government record — identical content to ${previous}. Retained for audit; not counted twice.`,
          severity: "info",
        });
      } else {
        seen.set(record.hash, record.id);
      }

      const confidence = this.confidenceByEvidenceId.get(record.id);
      if (confidence && confidence.missingFields.length > 0) {
        extra.push({
          evidenceId: record.id,
          code: "missing-required",
          message: `Incomplete government record — missing ${confidence.missingFields.join(", ")}.`,
          severity: "warn",
        });
      }
      if (confidence && confidence.score < 0.6) {
        extra.push({
          evidenceId: record.id,
          code: "low-source-confidence",
          message: `Government record scored ${confidence.score} (${confidence.grade}). ${confidence.rationale}`,
          severity: "warn",
        });
      }
    }

    const issues = [...base.issues, ...extra];
    this.lastIssues = issues;
    return { issues };
  }

  // ── Acquisition ─────────────────────────────────────────────────────

  protected override cacheKey(query: AcquisitionQuery): string {
    const subject = (query.entity?.id ?? query.entity?.label ?? query.text ?? "").toLowerCase();
    return `${this.id}:${subject}:${(query.kinds ?? []).join(",")}`;
  }

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    const term = (query.entity?.label ?? query.entity?.id ?? query.text ?? "").trim();
    if (!term) throw new Error("Government maritime acquisition requires a subject");

    const statuses = this.agencyStatuses;
    const configured = this.adapters.filter(
      (a) => statuses.find((s) => s.agency === a.agency)?.configured,
    );
    if (configured.length === 0) {
      throw new Error(
        `No government maritime authority is configured. ${statuses
          .map((s) => `${s.agency}: ${s.reason ?? "ready"}`)
          .join(" · ")}`,
      );
    }

    const adapterQuery: GovernmentAdapterQuery = {
      term,
      ...(query.entity?.id ? { entityId: query.entity.id } : {}),
    };

    const outcomes: GovernmentAdapterResult[] = [];
    const collected: GovernmentEvidenceRecord[] = [];

    for (const adapter of configured) {
      const started = this.now();
      try {
        const records = await adapter.fetchRecords(adapterQuery, {
          fetchImpl: this.fetchImpl,
          timeoutMs: TIMEOUT_MS,
          baseUrl: this.resolve(adapter.baseUrlEnv),
          credential: this.resolve(adapter.credentialEnv),
        });
        outcomes.push({
          agency: adapter.agency,
          ok: true,
          records,
          latencyMs: Math.max(0, Math.round(this.now() - started)),
        });
        collected.push(...records);
      } catch (err) {
        outcomes.push({
          agency: adapter.agency,
          ok: false,
          records: [],
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Math.max(0, Math.round(this.now() - started)),
        });
      }
    }

    this.lastAgencyResults = outcomes;
    if (collected.length === 0 && outcomes.every((o) => !o.ok)) {
      throw new Error(
        outcomes.map((o) => `${o.agency}: ${o.error ?? "no records"}`).join(" · ") ||
          "Government acquisition failed",
      );
    }

    this.lineageByEvidenceId = new Map();
    this.confidenceByEvidenceId = new Map();

    const corroboration = corroborationCounts(collected);
    const out: NormalizedEvidence[] = [];
    for (const record of collected) {
      const adapter = this.adapters.find((a) => a.agency === record.agency);
      const confidence = scoreGovernmentRecord(record, {
        trustWeight: adapter?.trustWeight ?? 0.9,
        corroborationCount: corroboration.get(record.recordId) ?? 0,
        now: this.now(),
      });
      const evidence = this.toEvidence(record, confidence);
      if (!evidence) continue;
      this.confidenceByEvidenceId.set(evidence.id, confidence);
      this.lineageByEvidenceId.set(
        evidence.id,
        buildLineage(record, {
          evidenceId: evidence.id,
          retrievedAt: evidence.retrievedAt,
          endpointEnv: adapter?.baseUrlEnv[0] ?? "unknown",
        }),
      );
      out.push(evidence);
    }
    return out;
  }

  // ── Internals ───────────────────────────────────────────────────────

  private toEvidence(
    record: GovernmentEvidenceRecord,
    confidence: CargoConfidence,
  ): NormalizedEvidence | null {
    const subject = subjectOf(record);
    const { missing } = completeness(record);
    const fields: Record<string, EvidenceFieldValue> = {
      ...record.fields,
      agency: record.agency,
      agencyName: record.agencyName,
      recordType: record.recordType,
      confidenceScore: confidence.score,
      confidenceRationale: confidence.rationale,
      ...(missing.length > 0 ? { incompleteFields: [...missing] } : {}),
    };
    for (const [key, value] of Object.entries(record.links ?? {})) {
      if (typeof value === "string" && value.trim().length > 0) fields[`rel.${key}`] = value.trim();
    }
    fields["provenanceHash"] = stableHash(record.raw ?? record.fields);

    return normalizeRecord({
      source: this.id,
      sourceName: record.agencyName,
      grade: confidence.grade,
      entity: {
        kind: subject.kind,
        nativeId: subject.nativeId,
        ...(subject.label ? { label: subject.label } : {}),
      },
      kind: EVIDENCE_KIND[record.recordType] ?? "other",
      fields,
      observedAt: record.occurredAt ?? new Date(this.now()).toISOString(),
      providerRecordId: record.recordId,
      ...(record.excerpt ? { excerpt: record.excerpt } : {}),
      ...(record.units ? { units: { ...record.units } } : {}),
    });
  }

  /** Resolve the first present value from declared env names or overrides. */
  private resolve(names: ReadonlyArray<string>): string | null {
    for (const name of names) {
      const override = this.configOverride[name];
      if (override && override.trim().length > 0) return override.trim();
    }
    return readFirstProviderCredential(names)?.value ?? null;
  }
}

/** Singleton used by the catalog and the registration gate. */
export const governmentMaritimeProvider = new GovernmentMaritimeProvider();

/** Convenience re-export so callers never reach past the provider. */
export type { GovernmentAdapterStatus, GovernmentLineage, CargoConfidence, ConnectorResult };
