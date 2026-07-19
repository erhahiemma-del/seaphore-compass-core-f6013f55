/**
 * LAYER 2.10 — Evidence Fusion Engine.
 *
 * Reconciles ranked evidence. NEVER reasons about meaning.
 *  1. Normalization  — trim whitespace, ISO timestamps, canonical grades
 *  2. Deduplication  — by content hash within same source
 *  3. Conflict det.  — flag contradictory VERIFIED items on same entity
 *  4. Confidence     — weight = grade.weight × freshness × authority
 *  5. Ranking        — final ordered list for the Reasoning Engine
 *
 * Guardrails: HR-10 — grades are never merged. CORROBORATED requires >=2
 * independent sources with matching claim signatures.
 */
import { EVIDENCE_GRADES } from "./constants";
import type { EvidenceItem, FusedEvidence, RetrievalResult } from "./types";

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

const HOUR_MS = 3_600_000;

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

export function fuseEvidence(results: RetrievalResult[]): FusedEvidence {
  // 1. Gather + normalize
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

  // 2. Deduplicate within same source_system by content hash
  const seen = new Map<string, EvidenceItem>();
  for (const e of all) {
    const key = `${e.source_system}::${e.hash_sha256 ?? signature(e)}`;
    const prev = seen.get(key);
    if (!prev || (e.weight ?? 0) > (prev.weight ?? 0)) seen.set(key, e);
  }
  const deduped = Array.from(seen.values());

  // 3. Conflict detection — same entity, opposing VERIFIED content
  const conflicts: FusedEvidence["conflicts"] = [];
  const byEntity = new Map<string, EvidenceItem[]>();
  for (const e of deduped) {
    for (const ent of e.entity_ids) {
      const bucket = byEntity.get(ent) ?? [];
      bucket.push(e);
      byEntity.set(ent, bucket);
    }
  }
  for (const [, items] of byEntity) {
    const verified = items.filter((i) => i.grade === "VERIFIED");
    for (let i = 0; i < verified.length; i++) {
      for (let j = i + 1; j < verified.length; j++) {
        const a = verified[i];
        const b = verified[j];
        if (a.source_system !== b.source_system && a.content !== b.content) {
          conflicts.push({ a: a.id, b: b.id, reason: "VERIFIED disagreement on same entity" });
          a.conflicts_with = [...(a.conflicts_with ?? []), b.id];
          b.conflicts_with = [...(b.conflicts_with ?? []), a.id];
        }
      }
    }
  }

  // 4. Corroboration counting — >=2 independent sources sharing signature.
  //    HR-10: grades are NEVER merged; corroboration is a metric, not a grade upgrade.
  const bySignature = new Map<string, Set<string>>();
  for (const e of deduped) {
    const sig = signature(e);
    const src = bySignature.get(sig) ?? new Set<string>();
    src.add(e.source_system);
    bySignature.set(sig, src);
  }
  const corroboratedSignatures = Array.from(bySignature.values()).filter((s) => s.size >= 2).length;

  // 5. Rank descending by fused weight
  const ranked = deduped.slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const sources_queried = results.length;
  const sources_responded = results.filter((r) => r.responded).length;

  return {
    ranked,
    conflicts,
    sources_queried,
    sources_responded,
    sources_corroborated: corroboratedSignatures,
  };
}
