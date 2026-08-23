/**
 * LAYER 5 — Executive Brief.
 *
 * The default response format. Built **from `IntelligenceFinding`s**, never
 * from raw connector output, so every line an officer reads traces to
 * evidence that can be opened.
 *
 * ## It computes nothing
 *
 * Confidence comes from `reasoning` via the finding's assessment, priority
 * from OSAE, evidence grade from the OSINT engine, freshness from
 * `geospatial/freshness`. This module counts, orders and phrases. Where a
 * number appears, it was copied.
 *
 * ## Shape
 *
 * Summary first, in countable lines rather than paragraphs — an officer
 * scanning for a decision should not have to parse prose to find the
 * count. Unknowns and counter-hypotheses are sections in their own right,
 * at the same weight as the findings, because a brief that hides what it
 * does not know is worse than no brief.
 */
import {
  byPriority,
  collectEvidence,
  type FindingSet,
  type IntelligenceFinding,
} from "@/services/intelligence";
import type { OperationalPriority } from "@/services/osae";
import { formatAge, freshnessBandForAge, type FreshnessBand } from "@/services/geospatial";

import type { QueryUnderstanding } from "./understanding/types";

/** One scannable line of the summary. Never a paragraph. */
export interface SummaryLine {
  readonly text: string;
  /** Set when the line reports a count, so the UI can render it large. */
  readonly value: number | null;
  readonly tone: "neutral" | "attention" | "critical";
}

export interface BriefFinding {
  readonly id: string;
  readonly subject: string;
  readonly statement: string;
  readonly priority: OperationalPriority | null;
  /** Band from `reasoning`, copied. Null when nothing was assessed. */
  readonly confidenceBand: string | null;
  readonly evidenceCount: number;
  readonly freshness: FreshnessBand;
  readonly age: string;
  readonly module: string;
}

export interface EvidenceSummary {
  readonly totalRefs: number;
  /** Distinct providers behind the evidence. */
  readonly providers: readonly string[];
  /** Count per evidence grade, strongest first. */
  readonly byGrade: readonly { readonly grade: string; readonly count: number }[];
}

export interface RecommendedAction {
  readonly id: string;
  readonly action: string;
  /** The finding that justifies it. An action with no finding is not offered. */
  readonly findingId: string;
  readonly priority: OperationalPriority;
}

export interface ExecutiveBriefV2 {
  readonly query: string;
  readonly producedAt: string;
  readonly summary: readonly SummaryLine[];
  readonly keyFindings: readonly BriefFinding[];
  readonly evidence: EvidenceSummary;
  readonly confidence: {
    /** Findings that reached a conclusion, over findings attempted. */
    readonly supported: number;
    readonly attempted: number;
    /** Bands present across the set, copied from `reasoning`. */
    readonly bands: readonly string[];
  };
  readonly recommendedActions: readonly RecommendedAction[];
  /** What could not be established, and why. Never omitted when non-empty. */
  readonly unknowns: readonly string[];
  /** What would refute the confident findings, copied from `reasoning`. */
  readonly counterHypotheses: readonly { readonly findingId: string; readonly statement: string }[];
  /** The single thing to do next, or null when nothing warrants action. */
  readonly nextBestAction: RecommendedAction | null;
}

/** Priority → the verb an officer acts on. OSAE decided the priority. */
const ACTION_VERB: Readonly<Record<OperationalPriority, string>> = {
  urgent: "Review immediately",
  act: "Review",
  monitor: "Monitor",
  watch: "Note",
};

function toneFor(priority: OperationalPriority | null): SummaryLine["tone"] {
  if (priority === "urgent") return "critical";
  if (priority === "act") return "attention";
  return "neutral";
}

function briefFinding(finding: IntelligenceFinding): BriefFinding {
  const ageMs = finding.dataQuality.ageMs;
  return {
    id: finding.id,
    subject: finding.subject.displayName,
    statement: finding.statement,
    priority: finding.priority,
    confidenceBand: finding.assessment?.band ?? null,
    evidenceCount: finding.evidence.length,
    // Recomputed: a cached band makes a stale finding look fresh.
    freshness: freshnessBandForAge(ageMs),
    age: formatAge(ageMs),
    module: finding.module,
  };
}

/**
 * Build the brief for a query.
 *
 * `now` is injected so the same finding set renders identically in a test
 * and in a snapshot.
 */
export function buildExecutiveBrief(
  understanding: QueryUnderstanding,
  findings: FindingSet,
  now: number = Date.now(),
): ExecutiveBriefV2 {
  const supported = findings.findings.filter((f) => f.status === "supported");
  const prioritised = byPriority(supported);
  const evidenceRefs = collectEvidence(supported);

  /* ── Summary: counts, not prose ─────────────────────────────── */
  const summary: SummaryLine[] = [];
  const urgent = prioritised.filter((f) => f.priority === "urgent").length;
  const act = prioritised.filter((f) => f.priority === "act").length;

  summary.push({
    text: `${supported.length} finding${supported.length === 1 ? "" : "s"} supported by evidence.`,
    value: supported.length,
    tone: "neutral",
  });
  if (urgent > 0) {
    summary.push({
      text: `${urgent} require${urgent === 1 ? "s" : ""} immediate attention.`,
      value: urgent,
      tone: "critical",
    });
  }
  if (act > 0) {
    summary.push({
      text: `${act} awaiting officer review.`,
      value: act,
      tone: "attention",
    });
  }

  const pending = findings.contributions.filter((c) => c.status === "pending-source").length;
  if (pending > 0) {
    // Stated in the summary, not buried: an officer reading "2 findings"
    // needs to know how many dimensions nobody could check.
    summary.push({
      text: `${pending} module${pending === 1 ? "" : "s"} could not be checked.`,
      value: pending,
      tone: "attention",
    });
  }

  if (supported.length === 0) {
    summary.push({
      text: "No finding reached the evidence threshold for this query.",
      value: null,
      tone: "neutral",
    });
  }

  /* ── Evidence ───────────────────────────────────────────────── */
  const gradeCounts = new Map<string, number>();
  const providers = new Set<string>();
  for (const ref of evidenceRefs) {
    gradeCounts.set(ref.grade, (gradeCounts.get(ref.grade) ?? 0) + 1);
    providers.add(ref.provenance.provider);
  }
  const GRADE_ORDER = ["AUDITED", "VERIFIED", "CORROBORATED", "INFERRED", "DECLARED", "OBSERVED"];

  /* ── Actions: one per prioritised finding, never free-standing ─ */
  const recommendedActions: RecommendedAction[] = prioritised
    .filter(
      (f): f is IntelligenceFinding & { priority: OperationalPriority } => f.priority !== null,
    )
    .map((finding) => ({
      id: `action-${finding.id}`,
      action: `${ACTION_VERB[finding.priority]} ${finding.subject.displayName}`,
      findingId: finding.id,
      priority: finding.priority,
    }));

  /* ── Unknowns: absences, stated ─────────────────────────────── */
  const unknowns: string[] = [];
  for (const contribution of findings.contributions) {
    if (contribution.unavailableReason) {
      unknowns.push(`${contribution.label}: ${contribution.unavailableReason}`);
    }
  }
  for (const gap of understanding.plan.unavailable) {
    unknowns.push(gap.reason);
  }
  for (const finding of supported) {
    for (const gap of finding.dataQuality.gaps) {
      unknowns.push(`${finding.subject.displayName}: ${gap}`);
    }
  }

  /* ── Counter-hypotheses: copied from `reasoning` ─────────────── */
  const counterHypotheses = supported
    .filter((f) => f.assessment?.counterHypothesis)
    .map((f) => ({
      findingId: f.id,
      statement: f.assessment!.counterHypothesis!.statement,
    }));

  return {
    query: understanding.query,
    producedAt: new Date(now).toISOString(),
    summary,
    keyFindings: prioritised.slice(0, 5).map(briefFinding),
    evidence: {
      totalRefs: evidenceRefs.length,
      providers: [...providers].sort(),
      byGrade: GRADE_ORDER.filter((g) => gradeCounts.has(g)).map((grade) => ({
        grade,
        count: gradeCounts.get(grade)!,
      })),
    },
    confidence: {
      supported: supported.length,
      attempted: findings.contributions.length,
      bands: [...new Set(supported.map((f) => f.assessment?.band).filter(Boolean))] as string[],
    },
    recommendedActions,
    unknowns: [...new Set(unknowns)],
    counterHypotheses,
    // The most urgent action, or nothing. An officer told to do something
    // when nothing warrants it learns to ignore the field.
    nextBestAction: recommendedActions[0] ?? null,
  };
}

/** Tone for a summary line, exported for the renderer. */
export { toneFor };
