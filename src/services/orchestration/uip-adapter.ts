/**
 * Orchestration → Canonical UIP adapter.
 *
 * The live Copilot path fuses evidence via `services/orchestration/evidence-fusion.ts`,
 * which emits an `EvidenceItem`-shaped `FusedEvidence` object. The IFE UIP contract
 * (`UnifiedIntelligencePackage`) is the canonical Single Source of Truth that every
 * downstream capability resolves through `getUip(source_uip_id)`.
 *
 * This adapter is intentionally minimal: it preserves provenance, freshness, and
 * evidence identity so the UIP is retrievable and traceable. It does NOT rerun
 * identity resolution or IFE fusion — Slice 1 activates the registry; deeper
 * canonicalisation is a downstream slice.
 */
import type { FusedEvidence } from "./types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { FusedEntityRecord, FusedEvidencePackage } from "@/services/ife/types";

interface AdaptInput {
  readonly fused: FusedEvidence;
  readonly queryHash: string;
  readonly officerId: string;
  readonly query: string;
}

const NOW = () => new Date().toISOString();

function inferGrade(fused: FusedEvidence): FusedEvidencePackage["grade"] {
  const top = fused.ranked[0]?.grade;
  return (top ?? "UNKNOWN") as FusedEvidencePackage["grade"];
}

function inferConfidence(fused: FusedEvidence): FusedEvidencePackage["confidence"] {
  const w = fused.ranked[0]?.weight ?? 0;
  if (w >= 0.8) return "HIGH";
  if (w >= 0.5) return "MEDIUM";
  return "LOW";
}

function buildCanonical(fused: FusedEvidence): ReadonlyArray<FusedEntityRecord> {
  // Group ranked evidence by first entity id — one canonical record per entity.
  const byEntity = new Map<string, typeof fused.ranked>();
  for (const e of fused.ranked) {
    const eid = e.entity_ids?.[0] ?? "unknown";
    const bucket = byEntity.get(eid) ?? [];
    bucket.push(e);
    byEntity.set(eid, bucket);
  }
  const out: FusedEntityRecord[] = [];
  for (const [entityId, items] of byEntity) {
    out.push({
      entity: {
        kind: (entityId.startsWith("vessel") ? "vessel" : "company") as never,
        id: entityId,
      } as never,
      fields: {},
      contributingRecords: items.map((i) => i.id),
      confidence: inferConfidence({ ...fused, ranked: items }),
      grade: (items[0].grade ?? "UNKNOWN") as never,
      freshnessSeconds: items[0].collected_at
        ? Math.max(0, Math.floor((Date.now() - new Date(items[0].collected_at).getTime()) / 1000))
        : 0,
    } as unknown as FusedEntityRecord);
  }
  return out;
}

export function buildUipFromOrchestration({
  fused,
  queryHash,
  officerId,
  query,
}: AdaptInput): UnifiedIntelligencePackage {
  const created = NOW();
  const canonical = buildCanonical(fused);
  const sourceMap = new Map<string, number>();
  for (const e of fused.ranked) {
    sourceMap.set(e.source_system, (sourceMap.get(e.source_system) ?? 0) + 1);
  }
  const sources = Array.from(sourceMap.entries()).map(([sourceName, records]) => ({
    connectorId: sourceName,
    sourceName,
    records,
    agreementScore: fused.sources_corroborated > 0 ? 1 : 0,
    weight: 1,
  }));

  const freshestSeconds = fused.ranked.reduce((min, e) => {
    if (!e.collected_at) return min;
    const s = Math.max(0, Math.floor((Date.now() - new Date(e.collected_at).getTime()) / 1000));
    return Number.isFinite(s) ? Math.min(min, s) : min;
  }, Number.POSITIVE_INFINITY);

  const fusedPkg: FusedEvidencePackage = {
    id: `fused_${queryHash}`,
    createdAt: created,
    sourcePackageId: `orch_${queryHash}`,
    canonical,
    contradictions: [],
    sources: sources as never,
    report: {
      contradictions: [],
      evidenceStrength: inferConfidence(fused),
      missing: [],
      unknowns: [],
      summary: `Adapted from orchestration fusion for query "${query.slice(0, 120)}" by officer ${officerId}.`,
    },
    missing: [],
    confidence: inferConfidence(fused),
    grade: inferGrade(fused),
    stats: {
      inputRecords: fused.ranked.length,
      canonicalEntities: canonical.length,
      contradictions: fused.conflicts.length,
      sourcesQueried: fused.sources_queried,
      sourcesResponded: fused.sources_responded,
      averageFreshnessSeconds: Number.isFinite(freshestSeconds) ? freshestSeconds : 0,
    },
  };

  return {
    id: `uip_${queryHash}`,
    createdAt: created,
    fused: fusedPkg,
    identity: [],
    osae: [],
    provenance: sources.map((s) => ({
      connectorId: s.connectorId,
      sourceName: s.sourceName,
      records: s.records,
      agreementScore: s.agreementScore,
    })),
    freshestSeconds: Number.isFinite(freshestSeconds) ? freshestSeconds : 0,
    hasContradictions: fused.conflicts.length > 0,
  };
}
