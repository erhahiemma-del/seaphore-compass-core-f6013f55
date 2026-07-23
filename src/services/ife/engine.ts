/**
 * Intelligence Fusion Engine — public entry point.
 *
 * `fuseEvidence(pkg)` takes an IAL `EvidencePackage` (or any equivalent
 * `{ records }` bag) and returns a `FusedEvidencePackage`. The OIE never
 * sees the raw multi-provider records — only the canonical view the IFE
 * produces here.
 */
import type {
  ConnectorId,
  EvidenceGrade,
  EvidencePackage,
  SourceAttribution,
} from "@/services/ial/types";
import { correlate } from "./correlator";
import { buildCanonicalRecord } from "./canonical-builder";
import { packageConfidence } from "./confidence-engine";
import { buildContradictionReport } from "./report";
import { profileFor, sourceWeight } from "./source-ranking";
import type {
  Contradiction,
  FusedEntityRecord,
  FusedEvidencePackage,
  FusedSourceAttribution,
  FusionInput,
} from "./types";

export function fuseEvidence(input: FusionInput): FusedEvidencePackage {
  const records = "records" in input ? input.records : input.verified;
  const missing = ("missing" in input && input.missing) ? input.missing : [];
  const inputSources: ReadonlyArray<SourceAttribution> =
    "sources" in input && input.sources
      ? input.sources
      : deriveSourceAttribution(records);

  const buckets = correlate(records);

  const canonical: FusedEntityRecord[] = [];
  const contradictions: Contradiction[] = [];
  for (const b of buckets) {
    const out = buildCanonicalRecord(b.entity, b.byField);
    canonical.push(out.record);
    contradictions.push(...out.contradictions);
  }

  const { confidence, grade } = packageConfidence(canonical, contradictions);

  const sources: FusedSourceAttribution[] = inputSources.map((s) => {
    const agreementScore = computeAgreementScore(s.connectorId, canonical);
    const avgFresh =
      average(records.filter((r) => r.source === s.connectorId).map((r) => r.freshnessSeconds));
    const weight = sourceWeight(s.connectorId, avgFresh);
    return { ...s, agreementScore, weight };
  });

  const stats = {
    inputRecords: records.length,
    canonicalEntities: canonical.length,
    contradictions: contradictions.length,
    sourcesQueried: inputSources.length,
    sourcesResponded: inputSources.filter((s) => s.records > 0).length,
    averageFreshnessSeconds: average(records.map((r) => r.freshnessSeconds)),
  };

  const report = buildContradictionReport(canonical, contradictions, missing, confidence);

  const packageId = "ife_" + hashString(canonical.map((c) => c.entity.id).join("|"));
  return {
    id: packageId,
    createdAt: new Date().toISOString(),
    sourcePackageId: "id" in input ? input.id : packageId,
    canonical,
    contradictions,
    sources,
    report,
    missing: [...missing],
    confidence,
    grade,
    stats,
  };
}

function deriveSourceAttribution(
  records: ReadonlyArray<{ source: ConnectorId; sourceName: string; grade: EvidenceGrade }>,
): SourceAttribution[] {
  const byId = new Map<ConnectorId, SourceAttribution>();
  for (const r of records) {
    const existing = byId.get(r.source);
    if (existing) {
      byId.set(r.source, { ...existing, records: existing.records + 1 });
    } else {
      byId.set(r.source, {
        connectorId: r.source,
        sourceName: r.sourceName,
        records: 1,
        grade: r.grade,
        latencyMs: profileFor(r.source).latencyMsP50,
      });
    }
  }
  return Array.from(byId.values());
}

function computeAgreementScore(
  connectorId: ConnectorId,
  canonical: ReadonlyArray<FusedEntityRecord>,
): number {
  let supporting = 0;
  let dissenting = 0;
  for (const rec of canonical) {
    for (const f of rec.fields) {
      if (f.supportingSources.includes(connectorId)) supporting += 1;
      if (f.dissentingSources.includes(connectorId)) dissenting += 1;
    }
  }
  const total = supporting + dissenting;
  if (total === 0) return 0;
  return Math.round((supporting / total) * 100) / 100;
}

function average(nums: ReadonlyArray<number>): number {
  const finite = nums.filter((n) => Number.isFinite(n));
  if (finite.length === 0) return 0;
  return Math.round(finite.reduce((a, b) => a + b, 0) / finite.length);
}

function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Type guard exported for consumers that route straight from the IAL. */
export function isEvidencePackage(x: unknown): x is EvidencePackage {
  return (
    !!x &&
    typeof x === "object" &&
    "verified" in x &&
    Array.isArray((x as { verified: unknown }).verified)
  );
}
