/**
 * useConfidenceExplainer
 *
 * Reusable hook that turns a projected recommendation (or any shape that
 * carries a confidence badge + supporting/discarded evidence) into an
 * explainable confidence breakdown for the officer.
 *
 * Golden Rule: every recommendation must project *why* its confidence is
 * what it is — supporting count, corroboration, discarded evidence,
 * freshness, and any residual gap. This hook is the single source of that
 * derivation so every surface renders the same explanation.
 *
 * Presentation-only: no reasoning, no fetches. Pure projection of data
 * already produced by the backend (OIE recommendation confidence, ICE
 * grades, workspace REJECTED bucket, mission gaps).
 */
import { useMemo } from "react";
import type { ConfidenceLevel, ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import type {
  DiscardedEvidence,
  LineageEvidence,
  RecommendationLineage,
} from "@/lib/lineage/types";
import type { EvidenceGrade } from "@/components/copilot/briefing";

export interface ConfidenceExplainerInput {
  /** Free-form badge from the backend (e.g. "high", "medium", "VERIFIED"). */
  confidenceBadge?: string;
  supporting?: LineageEvidence[];
  discarded?: DiscardedEvidence[];
  /** Optional composite score (0..1) from the briefing classification. */
  compositeConfidence?: number;
}

export interface ConfidenceFactor {
  key: string;
  label: string;
  detail: string;
  tone: "supporting" | "neutral" | "detracting";
}

export interface ConfidenceExplanation {
  tier: ConfidenceTier;
  level: ConfidenceLevel;
  compositeScore: number | null;
  supportingCount: number;
  corroboratedCount: number;
  discardedCount: number;
  /** ISO of the most recent piece of supporting evidence, if any. */
  freshestAt: string | null;
  /** Human-readable freshness label (e.g. "2h ago", "8d ago"). */
  freshnessLabel: string | null;
  factors: ConfidenceFactor[];
  /** One-line summary suitable for a tooltip title. */
  summary: string;
}

/* ─────────────── mapping helpers ─────────────── */

const GRADE_TIER: Record<EvidenceGrade, ConfidenceTier> = {
  VERIFIED: "verified",
  CORROBORATED: "verified",
  OBSERVED: "observed",
  REPORTED: "inferred",
  INFERRED: "inferred",
  UNKNOWN: "unconfirmed",
};

const TIER_RANK: Record<ConfidenceTier, number> = {
  verified: 3,
  observed: 2,
  inferred: 1,
  unconfirmed: 0,
};

const RANK_TIER: ConfidenceTier[] = ["unconfirmed", "inferred", "observed", "verified"];

function tierFromBadge(badge?: string): ConfidenceTier | null {
  if (!badge) return null;
  const b = badge.trim().toLowerCase();
  if (["verified", "high", "strong"].includes(b)) return "verified";
  if (["observed", "medium", "moderate"].includes(b)) return "observed";
  if (["inferred", "low", "weak", "reported"].includes(b)) return "inferred";
  if (["unconfirmed", "none", "unknown"].includes(b)) return "unconfirmed";
  return null;
}

function tierFromScore(score?: number): ConfidenceTier | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 0.8) return "verified";
  if (score >= 0.6) return "observed";
  if (score >= 0.35) return "inferred";
  return "unconfirmed";
}

function tierFromGrades(supporting: LineageEvidence[]): ConfidenceTier {
  if (supporting.length === 0) return "unconfirmed";
  // Dominant grade wins; ties resolve to the higher tier.
  const counts = new Map<ConfidenceTier, number>();
  for (const e of supporting) {
    const t = GRADE_TIER[e.grade] ?? "unconfirmed";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let bestTier: ConfidenceTier = "unconfirmed";
  let bestCount = -1;
  for (const [t, c] of counts) {
    if (c > bestCount || (c === bestCount && TIER_RANK[t] > TIER_RANK[bestTier])) {
      bestTier = t;
      bestCount = c;
    }
  }
  return bestTier;
}

function tierToLevel(t: ConfidenceTier): ConfidenceLevel {
  return t.toUpperCase() as ConfidenceLevel;
}

function downgradeIfSparse(
  base: ConfidenceTier,
  supportingCount: number,
  discardedCount: number,
): ConfidenceTier {
  let rank = TIER_RANK[base];
  if (supportingCount === 0) rank = Math.min(rank, 0);
  else if (supportingCount === 1 && rank > 1) rank -= 1;
  if (discardedCount > supportingCount && discardedCount >= 2 && rank > 0) rank -= 1;
  return RANK_TIER[rank] ?? "unconfirmed";
}

function corroboratedGradeCount(supporting: LineageEvidence[]): number {
  return supporting.filter((e) => e.grade === "VERIFIED" || e.grade === "CORROBORATED").length;
}

function mostRecent(supporting: LineageEvidence[]): string | null {
  let best: number | null = null;
  for (const e of supporting) {
    if (!e.collectedAt) continue;
    const t = Date.parse(e.collectedAt);
    if (Number.isFinite(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

function relativeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const delta = Date.now() - t;
  if (delta < 0) return "just now";
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/* ─────────────── hook ─────────────── */

export function useConfidenceExplainer(input: ConfidenceExplainerInput): ConfidenceExplanation {
  const { confidenceBadge, supporting = [], discarded = [], compositeConfidence } = input;

  return useMemo<ConfidenceExplanation>(() => {
    const supportingCount = supporting.length;
    const corroboratedCount = corroboratedGradeCount(supporting);
    const discardedCount = discarded.length;
    const freshestAt = mostRecent(supporting);
    const freshnessLabel = relativeLabel(freshestAt);

    // Resolve tier — badge > score > grade distribution — then downgrade for
    // sparse or heavily-contested evidence so the chip never overclaims.
    const baseTier =
      tierFromBadge(confidenceBadge) ??
      tierFromScore(compositeConfidence) ??
      tierFromGrades(supporting);
    const tier = downgradeIfSparse(baseTier, supportingCount, discardedCount);
    const level = tierToLevel(tier);

    const factors: ConfidenceFactor[] = [];

    if (supportingCount === 0) {
      factors.push({
        key: "no-evidence",
        label: "No citation-level evidence attached",
        detail: "Recommendation is not yet anchored to a verifiable source.",
        tone: "detracting",
      });
    } else {
      factors.push({
        key: "supporting",
        label: `${supportingCount} supporting source${supportingCount === 1 ? "" : "s"}`,
        detail:
          supporting
            .slice(0, 3)
            .map((e) => `${e.source} · ${e.grade}`)
            .join(" · ") || "Sources attached to this recommendation.",
        tone: "supporting",
      });
    }

    if (corroboratedCount >= 2) {
      factors.push({
        key: "corroborated",
        label: `${corroboratedCount} verified / corroborated`,
        detail: "Multiple independent sources agree on the finding.",
        tone: "supporting",
      });
    } else if (corroboratedCount === 0 && supportingCount > 0) {
      factors.push({
        key: "not-corroborated",
        label: "No verified corroboration",
        detail: "Supporting evidence is observed or reported, not verified.",
        tone: "detracting",
      });
    }

    if (discardedCount > 0) {
      factors.push({
        key: "discarded",
        label: `${discardedCount} discarded item${discardedCount === 1 ? "" : "s"}`,
        detail:
          discarded
            .slice(0, 3)
            .map((d) => `${d.label}: ${d.reason}`)
            .join(" · ") || "Contradicted or rejected evidence noted.",
        tone: "detracting",
      });
    }

    if (freshnessLabel) {
      factors.push({
        key: "freshness",
        label: `Freshest evidence ${freshnessLabel}`,
        detail: freshestAt ?? "",
        tone: "neutral",
      });
    }

    if (compositeConfidence != null && Number.isFinite(compositeConfidence)) {
      factors.push({
        key: "composite",
        label: `Composite confidence ${Math.round(compositeConfidence * 100)}%`,
        detail: "Weighted score across all evidence sources.",
        tone: "neutral",
      });
    }

    const summary =
      supportingCount === 0
        ? "Unconfirmed — no citation-level evidence yet."
        : `${level} · ${supportingCount} source${supportingCount === 1 ? "" : "s"}${
            corroboratedCount >= 2 ? ", multi-source corroboration" : ""
          }${discardedCount > 0 ? `, ${discardedCount} discarded` : ""}${
            freshnessLabel ? `, freshest ${freshnessLabel}` : ""
          }.`;

    return {
      tier,
      level,
      compositeScore:
        compositeConfidence != null && Number.isFinite(compositeConfidence)
          ? compositeConfidence
          : null,
      supportingCount,
      corroboratedCount,
      discardedCount,
      freshestAt,
      freshnessLabel,
      factors,
      summary,
    };
  }, [confidenceBadge, supporting, discarded, compositeConfidence]);
}

/**
 * Convenience wrapper for callers holding a full RecommendationLineage.
 */
export function useRecommendationConfidence(
  rec: RecommendationLineage,
  compositeConfidence?: number,
): ConfidenceExplanation {
  return useConfidenceExplainer({
    confidenceBadge: rec.confidenceBadge,
    supporting: rec.supporting,
    discarded: rec.discarded,
    compositeConfidence,
  });
}
