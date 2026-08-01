/**
 * Deterministic fusion rules.
 *
 * Given a field with one or more candidate values (each backed by a set of
 * records), pick a winner and grade the outcome. Rules are ordered — the
 * first one that fires wins, so behaviour is fully deterministic and
 * auditable.
 */
import type {
  ConnectorId,
  EvidenceFieldValue,
  EvidenceGrade,
  NormalizedEvidence,
} from "@/services/ial/types";
import type { FieldDisagreement } from "./conflict-detector";
import type { FusionConfidence } from "./types";
import { isOfficialSource, sourceWeight } from "./source-ranking";

export interface ValueCandidate {
  readonly value: EvidenceFieldValue;
  readonly records: ReadonlyArray<NormalizedEvidence>;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly weight: number;
}

export interface FusionOutcome {
  readonly winner: ValueCandidate;
  readonly losers: ReadonlyArray<ValueCandidate>;
  readonly confidence: FusionConfidence;
  readonly grade: EvidenceGrade;
  readonly resolution:
    | "official-source-preferred"
    | "majority-agreement"
    | "highest-authority"
    | "most-recent"
    | "sole-source"
    | "unanimous";
  readonly explanation: string;
}

/**
 * Fuse a single field. Inputs are already grouped by identical value.
 *
 * Ordered rules:
 *   R1 — Unanimous:                one distinct value, N sources agree.
 *   R2 — Official government/regulator source present → prefer it.
 *   R3 — Two commercial providers agree (AIS + MarineTraffic pattern) →
 *        prefer the majority, boost confidence.
 *   R4 — Three or more providers disagree → LOW confidence, pick highest
 *        weight but flag as `unresolved` upstream.
 *   R5 — Fallback: highest source-weight wins; explain why.
 */
export function fuseField(disagreement: FieldDisagreement | ValueCandidate[]): FusionOutcome {
  const candidates = normaliseCandidates(disagreement);

  if (candidates.length === 1) {
    const only = candidates[0];
    const supporters = only.sources.length;
    if (supporters >= 2) {
      return {
        winner: only,
        losers: [],
        confidence: "HIGH",
        grade: pickGrade(only, "HIGH"),
        resolution: "unanimous",
        explanation: `${supporters} providers agreed (${only.sources.join(", ")}).`,
      };
    }
    return {
      winner: only,
      losers: [],
      confidence: gradeToConfidence(only.records[0]?.grade ?? "OBSERVED"),
      grade: only.records[0]?.grade ?? "OBSERVED",
      resolution: "sole-source",
      explanation: `Single-source value from ${only.sources[0] ?? "unknown"}.`,
    };
  }

  // Rule R2 — official government/regulator source present wins.
  const officialCandidates = candidates.filter((c) => c.sources.some((s) => isOfficialSource(s)));
  if (officialCandidates.length === 1) {
    const winner = officialCandidates[0];
    const losers = candidates.filter((c) => c !== winner);
    return {
      winner,
      losers,
      confidence: "HIGH",
      grade: pickGrade(winner, "HIGH"),
      resolution: "official-source-preferred",
      explanation: `Official source (${winner.sources.find(isOfficialSource) ?? winner.sources[0]}) overrides ${losers.length} disagreeing commercial provider(s).`,
    };
  }

  // Rule R3 — two-of-N commercial providers agree.
  const sorted = [...candidates].sort((a, b) => b.sources.length - a.sources.length);
  const top = sorted[0];
  const totalSources = candidates.reduce((n, c) => n + c.sources.length, 0);
  if (top.sources.length >= 2 && top.sources.length > sorted[1].sources.length) {
    return {
      winner: top,
      losers: sorted.slice(1),
      confidence: "MEDIUM",
      grade: pickGrade(top, "MEDIUM"),
      resolution: "majority-agreement",
      explanation: `${top.sources.length} of ${totalSources} providers agreed on this value.`,
    };
  }

  // Rule R4 — three or more disagreeing candidates.
  if (candidates.length >= 3) {
    const byWeight = [...candidates].sort((a, b) => b.weight - a.weight);
    return {
      winner: byWeight[0],
      losers: byWeight.slice(1),
      confidence: "LOW",
      grade: "REPORTED",
      resolution: "highest-authority",
      explanation: `${candidates.length} providers disagreed — accepted highest-authority value from ${byWeight[0].sources[0]}; contradiction preserved.`,
    };
  }

  // Rule R5 — fallback (two-way disagreement, no official source).
  const byWeight = [...candidates].sort((a, b) => b.weight - a.weight);
  const winner = byWeight[0];
  return {
    winner,
    losers: byWeight.slice(1),
    confidence: "LOW",
    grade: "REPORTED",
    resolution: "highest-authority",
    explanation: `Two-way disagreement — accepted ${winner.sources[0]} (higher source weight); contradiction preserved.`,
  };
}

function normaliseCandidates(input: FieldDisagreement | ValueCandidate[]): ValueCandidate[] {
  if (Array.isArray(input)) return input;
  return input.groups.map((g) => toCandidate(g.value, g.records));
}

export function toCandidate(
  value: EvidenceFieldValue,
  records: ReadonlyArray<NormalizedEvidence>,
): ValueCandidate {
  const sources = Array.from(new Set(records.map((r) => r.source)));
  const weight = records.reduce((sum, r) => sum + sourceWeight(r.source, r.freshnessSeconds), 0);
  return { value, records, sources, weight };
}

const GRADE_RANK: Record<EvidenceGrade, number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};

function pickGrade(c: ValueCandidate, conf: FusionConfidence): EvidenceGrade {
  const highest =
    c.records.map((r) => r.grade).sort((a, b) => GRADE_RANK[b] - GRADE_RANK[a])[0] ?? "OBSERVED";
  if (conf === "HIGH") {
    // Corroborated by ≥2 sources → promote OBSERVED to CORROBORATED.
    if (c.sources.length >= 2 && GRADE_RANK[highest] < GRADE_RANK.CORROBORATED) {
      return "CORROBORATED";
    }
  }
  return highest;
}

function gradeToConfidence(g: EvidenceGrade): FusionConfidence {
  if (g === "VERIFIED" || g === "CORROBORATED") return "HIGH";
  if (g === "OBSERVED" || g === "REPORTED") return "MEDIUM";
  return "LOW";
}
