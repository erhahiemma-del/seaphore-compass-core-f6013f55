/**
 * Fused Evidence Compat View.
 *
 * Slice 3 makes the canonical Unified Intelligence Package (UIP) — produced
 * by the IFE via identity resolution + canonical fusion — the single source
 * of truth for evidence. This module projects that UIP back into the legacy
 * `FusedEvidence` shape that the Reasoning Engine (`reason`) and Briefing
 * Builder (`buildBriefing`) still consume.
 *
 * Nothing here reasons about meaning. It only:
 *   - scores each retrieved item (grade × freshness × source authority)
 *   - deduplicates by content signature within a source
 *   - projects UIP contradictions into `conflicts`
 *   - projects UIP provenance into corroboration counts
 *
 * Grades are never merged (HR-10). Corroboration is a metric, not a grade
 * upgrade.
 */
import { EVIDENCE_GRADES } from "./constants";
import type { EvidenceItem, FusedEvidence, RetrievalResult } from "./types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";

const HOUR_MS = 3_600_000;

const AUTHORITY: Record<string, number> = {
  CAC: 1.0,
  IMO: 1.0,
  Customs: 0.95,
  "IMO GISIS + Certificates": 0.95,
  "Manifest + Customs": 0.9,
  "Cargo Manifests": 0.85,
  "Evidence Library": 0.8,
  OpenSanctions: 0.95,
  "Historical Cases": 0.6,
};

function freshnessScore(iso?: string): number {
  if (!iso) return 0.5;
  const age = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(age) || age < 0) return 0.5;
  const days = age / (24 * HOUR_MS);
  if (days < 1) return 1.0;
  if (days < 7) return 0.9;
  if (days < 30) return 0.75;
  if (days < 180) return 0.55;
  if (days < 365) return 0.4;
  return 0.25;
}

function signature(e: EvidenceItem): string {
  return `${e.grade}:${(e.content ?? "").trim().slice(0, 240).toLowerCase()}`;
}

/**
 * Score, dedupe, and rank the raw retrieved evidence for downstream UI
 * consumption (briefing findings, evidence sources panel). The
 * contradiction and corroboration signals are then overlaid from the
 * canonical UIP.
 */
export function projectFusedView(
  results: ReadonlyArray<RetrievalResult>,
  uip: UnifiedIntelligencePackage,
): FusedEvidence {
  // 1. Weight every item.
  const all: EvidenceItem[] = [];
  for (const r of results) {
    for (const e of r.evidence) {
      const authority = AUTHORITY[r.source_name] ?? 0.7;
      const freshness = freshnessScore(e.collected_at);
      const gradeWeight = EVIDENCE_GRADES[e.grade].weight;
      all.push({
        ...e,
        content: (e.content ?? "").trim(),
        authority,
        freshness,
        weight: Number((gradeWeight * authority * freshness).toFixed(3)),
      });
    }
  }

  // 2. Dedupe within source by content signature.
  const seen = new Map<string, EvidenceItem>();
  for (const e of all) {
    const key = `${e.source_system}::${e.hash_sha256 ?? signature(e)}`;
    const prev = seen.get(key);
    if (!prev || (e.weight ?? 0) > (prev.weight ?? 0)) seen.set(key, e);
  }
  const deduped = Array.from(seen.values());

  // 3. Conflicts — projected from canonical IFE contradictions.
  const idIndex = new Map(deduped.map((e) => [e.id, e] as const));
  const conflicts: FusedEvidence["conflicts"] = [];
  for (const c of uip.fused.contradictions) {
    if (c.values.length < 2) continue;
    const [a, b] = c.values;
    conflicts.push({
      a: a.evidenceId,
      b: b.evidenceId,
      reason: `IFE contradiction on ${c.field}`,
    });
    const ea = idIndex.get(a.evidenceId);
    const eb = idIndex.get(b.evidenceId);
    if (ea) ea.conflicts_with = [...(ea.conflicts_with ?? []), b.evidenceId];
    if (eb) eb.conflicts_with = [...(eb.conflicts_with ?? []), a.evidenceId];
  }

  // 4. Corroboration — count sources that agreed on the fused canonical
  //    view (agreementScore >= 0.5 with >1 record contributed).
  const sources_corroborated = uip.provenance.filter(
    (p) => p.records >= 1 && p.agreementScore >= 0.5,
  ).length;

  // 5. Rank descending by fused weight.
  const ranked = deduped.slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  return {
    ranked,
    conflicts,
    sources_queried: results.length,
    sources_responded: results.filter((r) => r.responded).length,
    sources_corroborated,
  };
}
