/**
 * Unified Intelligence Package — the single artefact OIE consumes.
 *
 * Golden Rule: One entity. One fused intelligence view. Many evidence
 * sources. Zero duplicated or conflicting outputs.
 *
 * The Unified Intelligence Package is the terminal product of the IFE:
 *   IAL EvidencePackage
 *     → identity resolution (cross-connector merge)
 *     → fusion (canonical fields + contradictions)
 *     → OSAE assessments overlaid per entity
 *     → single artefact for OIE / Copilot / briefing
 *
 * OSAE remains the sole authority for operational priority. This module
 * NEVER computes priority — it only *carries* the OSAE assessment
 * alongside the fused evidence so the OIE can render one coherent brief.
 *
 * Connectors remain evidence providers only. Nothing here inspects the
 * connector-specific shape of an evidence record beyond the
 * `NormalizedEvidence` contract.
 */
import type { OsaeAssessment } from "@/services/osae";
import type { NormalizedEvidence } from "@/services/ial/types";
import { fuseEvidence } from "./engine";
import { resolveIdentities, type IdentityCluster } from "./identity-resolver";
import type { FusedEvidencePackage, FusionInput } from "./types";

export interface UnifiedIntelligencePackage {
  readonly id: string;
  readonly createdAt: string;
  /** The fused evidence — one canonical record per resolved entity. */
  readonly fused: FusedEvidencePackage;
  /** Identity clusters explaining how cross-connector records were merged. */
  readonly identity: ReadonlyArray<IdentityCluster>;
  /** OSAE assessments keyed by canonical entity id (vessel today, more later). */
  readonly osae: ReadonlyArray<{
    readonly entityId: string;
    readonly assessment: OsaeAssessment;
  }>;
  /** Provenance summary — the sources that contributed. */
  readonly provenance: ReadonlyArray<{
    readonly connectorId: string;
    readonly sourceName: string;
    readonly records: number;
    readonly agreementScore: number;
  }>;
  /** Freshness of the freshest evidence in the package, in seconds. */
  readonly freshestSeconds: number;
  /** True when at least one contradiction was surfaced. */
  readonly hasContradictions: boolean;
  /**
   * All normalised evidence records that fed this package. This is the
   * canonical NormalizedEvidence stream downstream capabilities (OKL, PIE,
   * Revenue, Evidence Explorer, MIW panels) consume — never a demo fixture.
   */
  readonly rawEvidence: ReadonlyArray<NormalizedEvidence>;
}

export interface BuildUnifiedInput {
  readonly input: FusionInput;
  /** OSAE assessments produced upstream (e.g. AIS continuity). Optional. */
  readonly osaeAssessments?: ReadonlyArray<OsaeAssessment>;
}

export function buildUnifiedIntelligencePackage({
  input,
  osaeAssessments = [],
}: BuildUnifiedInput): UnifiedIntelligencePackage {
  const rawRecords = "records" in input ? input.records : input.verified;
  const missing = "missing" in input && input.missing ? [...input.missing] : [];
  const conflicting = "conflicting" in input && input.conflicting ? input.conflicting : undefined;
  const sources = "sources" in input && input.sources ? input.sources : undefined;

  // 1. Resolve identities across connectors.
  const { records: resolved, clusters } = resolveIdentities(rawRecords);

  // 2. Fuse the (now identity-consolidated) records.
  const fused = fuseEvidence({
    records: resolved,
    sources,
    conflicting,
    missing,
  });

  // 3. Overlay OSAE assessments, keyed to the resolved canonical id.
  //    Look up each incoming vesselId against cluster aliasIds so an
  //    assessment produced from `vessel:mmsi:...` still attaches when the
  //    canonical id resolved to `vessel:imo:...`.
  const aliasToCanonical = new Map<string, string>();
  for (const c of clusters) {
    for (const alias of c.aliasIds) aliasToCanonical.set(alias, c.canonicalId);
    aliasToCanonical.set(c.canonicalId, c.canonicalId);
  }
  const osae = osaeAssessments.map((a) => ({
    entityId: aliasToCanonical.get(a.vesselId) ?? a.vesselId,
    assessment: a,
  }));

  const provenance = fused.sources.map((s) => ({
    connectorId: s.connectorId,
    sourceName: s.sourceName,
    records: s.records,
    agreementScore: s.agreementScore,
  }));

  const freshestSeconds =
    rawRecords.length === 0
      ? 0
      : Math.min(...rawRecords.map((r) => r.freshnessSeconds).filter(Number.isFinite));

  return {
    id: `uip_${fused.id}`,
    createdAt: fused.createdAt,
    fused,
    identity: clusters,
    osae,
    provenance,
    freshestSeconds: Number.isFinite(freshestSeconds) ? freshestSeconds : 0,
    hasContradictions: fused.contradictions.length > 0,
    rawEvidence: rawRecords,
  };
}
