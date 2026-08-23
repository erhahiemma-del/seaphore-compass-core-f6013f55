/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT MIG-01 — Dashboard Projection (pure model)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Turns the Canonical UIP (plus the DIAG-02 coverage report) into the
 *  numbers Mission Control shows. This module owns NO intelligence: it
 *  never acquires, fuses, scores or persists anything. Revenue findings
 *  are produced by `capability.revenue-leakage-detection`
 *  (`src/services/revenue-leakage`), manifest rows by the UIP's own
 *  `rawEvidence`. Here we only project.
 *
 *  Golden Rule: when there is no Canonical UIP, or no evidence in it, the
 *  dashboard reports the honest operational state — never a mock value
 *  and never a bare "0".
 * ─────────────────────────────────────────────────────────────────────
 */
import { freshnessBandForAge, type FreshnessBand } from "@/services/geospatial/freshness";
import type { NormalizedEvidence, EvidenceGrade } from "@/services/ial/types";
import type { LeakageFinding } from "@/services/revenue-leakage";
import type { KpiCoverage, KpiStateCode } from "./coverage-model";
import { KPI_STATE_META } from "./coverage-model";

export type PanelConfidence = "verified" | "observed" | "inferred" | "unconfirmed";

export interface PanelProjection<T> {
  readonly state: KpiStateCode;
  readonly stateLabel: string;
  readonly stateDetail: string;
  /** Present only when the projection is ACTIVE. */
  readonly data: T | null;
  readonly uipId: string | null;
  /** Capability that produced the numbers — never duplicated here. */
  readonly capabilityId: string;
  readonly capabilityHref: string;
}

export interface RevenuePanelData {
  readonly findings: number;
  readonly currency: string;
  readonly estimatedLeakage: number;
  readonly criticalOrHigh: number;
  readonly approved: number;
  readonly confidence: PanelConfidence;
  readonly drivers: ReadonlyArray<{ name: string; amount: number; confidence: PanelConfidence }>;
}

export interface ManifestPanelData {
  readonly metrics: ReadonlyArray<{
    key: string;
    label: string;
    value: number;
    confidence: PanelConfidence;
  }>;
  readonly confidence: PanelConfidence;
}

const GRADE_TO_TIER: Record<EvidenceGrade, PanelConfidence> = {
  VERIFIED: "verified",
  CORROBORATED: "verified",
  OBSERVED: "observed",
  REPORTED: "observed",
  INFERRED: "inferred",
  UNKNOWN: "unconfirmed",
};

const GRADE_RANK: Record<EvidenceGrade, number> = {
  UNKNOWN: 0,
  INFERRED: 1,
  REPORTED: 2,
  OBSERVED: 3,
  CORROBORATED: 4,
  VERIFIED: 5,
};

export function gradeToTier(grade: EvidenceGrade | undefined): PanelConfidence {
  return grade ? GRADE_TO_TIER[grade] : "unconfirmed";
}

function weakest(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  return grades.reduce((min, g) => (GRADE_RANK[g] < GRADE_RANK[min] ? g : min), grades[0]);
}

function stateFrom(
  coverage: KpiCoverage | undefined,
  uipId: string | null,
  hasEvidence: boolean,
): { state: KpiStateCode; detail: string } {
  if (!coverage) {
    return {
      state: "PROJECTION_MISSING",
      detail:
        "No coverage declaration reached this panel. The dashboard cannot claim a number it cannot trace.",
    };
  }
  if (coverage.dashboardStatus === "MAPPING_ERROR") {
    return { state: "DASHBOARD_MAPPING_ERROR", detail: coverage.rootCauseDetail };
  }
  if (!uipId) {
    return {
      state:
        coverage.state === "ACTIVE" || coverage.state === "NO_EVIDENCE"
          ? "NO_EVIDENCE"
          : coverage.state,
      detail:
        coverage.state === "ACTIVE" || coverage.state === "NO_EVIDENCE"
          ? "No Canonical UIP in this session yet. Run a Copilot investigation to populate the dashboard."
          : coverage.stateDetail,
    };
  }
  if (!hasEvidence) {
    return {
      state: coverage.state === "ACTIVE" ? "NO_EVIDENCE" : coverage.state,
      detail:
        coverage.state === "ACTIVE"
          ? "The Canonical UIP carries no evidence for this capability yet."
          : coverage.stateDetail,
    };
  }
  return { state: "ACTIVE", detail: coverage.stateDetail };
}

/** Revenue Intelligence → capability.revenue-leakage-detection */
export function projectRevenueIntelligence(input: {
  uipId: string | null;
  findings: ReadonlyArray<LeakageFinding>;
  coverage: KpiCoverage | undefined;
}): PanelProjection<RevenuePanelData> {
  const { uipId, findings, coverage } = input;
  const { state, detail } = stateFrom(coverage, uipId, findings.length > 0);
  const base = {
    stateLabel: KPI_STATE_META[state].label,
    stateDetail: detail,
    uipId,
    capabilityId: "capability.revenue-leakage-detection",
    capabilityHref: "/revenue-leakage",
  };
  if (state !== "ACTIVE") return { ...base, state, data: null };

  const sorted = [...findings].sort((a, b) => b.magnitude - a.magnitude);
  const data: RevenuePanelData = {
    findings: findings.length,
    currency: sorted[0]?.magnitudeCurrency ?? "USD",
    estimatedLeakage: findings.reduce((s, f) => s + f.magnitude, 0),
    criticalOrHigh: findings.filter((f) => f.priority === "critical" || f.priority === "high")
      .length,
    approved: findings.filter((f) => f.humanApproved).length,
    confidence: gradeToTier(weakest(findings.map((f) => f.confidence))),
    drivers: sorted.slice(0, 4).map((f) => ({
      name: f.subjectLabel || f.headline,
      amount: f.magnitude,
      confidence: gradeToTier(f.confidence),
    })),
  };
  return { ...base, state, data };
}

/* ── Intelligence Feed ──────────────────────────────────────────────── */

/** One observed signal. Every field traces to a real finding. */
export interface FeedSignal {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly subjectId: string;
  /** Grade of the evidence behind it — never averaged with anything. */
  readonly confidence: PanelConfidence;
  readonly observedAt: string;
}

export interface FeedPanelData {
  readonly signals: readonly FeedSignal[];
  /**
   * Currency of the newest signal, from the shared freshness bands.
   *
   * Kept as a separate axis from `PanelProjection.state` on purpose.
   * Availability ("is the capability reporting?") and currency ("how old
   * is what it reported?") are independent questions, and a single enum
   * that mixed them would make LIVE-but-stale inexpressible — which is
   * precisely the condition an officer most needs to see.
   */
  readonly freshness: FreshnessBand;
  /**
   * True when at least one finding could not be graded — the panel is
   * reporting, but not on everything it was asked about.
   */
  readonly partial: boolean;
}

/**
 * Intelligence Feed → real leakage findings.
 *
 * Previously a hardcoded array of invented signals ("MV Ocean Pearl ·
 * signal lost 2h 14m") rendered under a confidence chip, which presented
 * fixtures as observed intelligence. The feed now shows findings the
 * detection capability actually produced, and shows nothing when it
 * produced nothing.
 *
 * No finding is synthesised to fill the panel: an empty feed is a true
 * statement about the operating picture, and a fabricated one is not.
 */
export function projectIntelligenceFeed(input: {
  uipId: string | null;
  findings: ReadonlyArray<LeakageFinding>;
  coverage: KpiCoverage | undefined;
  /** Injected so freshness is deterministic under test. */
  now?: number;
}): PanelProjection<FeedPanelData> {
  const { uipId, findings, coverage, now = Date.now() } = input;
  const { state, detail } = stateFrom(coverage, uipId, findings.length > 0);
  const base = {
    stateLabel: KPI_STATE_META[state].label,
    stateDetail: detail,
    uipId,
    capabilityId: "capability.revenue-leakage-detection",
    capabilityHref: "/detect",
  };
  if (state !== "ACTIVE") return { ...base, state, data: null };

  const signals = [...findings]
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
    .map((finding): FeedSignal => ({
      id: finding.id,
      title: finding.headline,
      subtitle: finding.explanation,
      subjectId: finding.subjectId,
      // The finding's own grade, carried through rather than restated.
      confidence: gradeToTier(finding.confidence),
      observedAt: finding.detectedAt,
    }));

  // Freshness of the newest signal, using the shared bands rather than a
  // staleness rule invented here.
  const newest = signals.reduce<number | null>((best, signal) => {
    const parsed = Date.parse(signal.observedAt);
    if (!Number.isFinite(parsed)) return best;
    return best === null || parsed > best ? parsed : best;
  }, null);
  const freshness = freshnessBandForAge(newest === null ? null : now - newest);

  return {
    ...base,
    state,
    data: {
      signals,
      freshness,
      partial: signals.some((signal) => signal.confidence === "unconfirmed"),
    },
  };
}

/* ── Today's Priorities ─────────────────────────────────────────────── */

export interface PriorityItem {
  readonly id: string;
  readonly entityName: string;
  readonly rationale: string;
  readonly priority: LeakageFinding["priority"];
  readonly confidence: PanelConfidence;
  /** True when an officer has already signed off. */
  readonly approved: boolean;
}

export interface PrioritiesPanelData {
  readonly items: readonly PriorityItem[];
}

/**
 * Today's Priorities → findings that actually warrant attention.
 *
 * Only `critical` and `high` findings qualify, and the priority is the
 * one the detection capability assigned. Nothing here re-ranks or
 * re-scores: a panel that computed its own urgency would be a second
 * opinion wearing the first one's clothes.
 *
 * "No high-priority actions require attention" is a real operational
 * state, not an empty container to be filled.
 */
export function projectTodaysPriorities(input: {
  uipId: string | null;
  findings: ReadonlyArray<LeakageFinding>;
  coverage: KpiCoverage | undefined;
}): PanelProjection<PrioritiesPanelData> {
  const { uipId, findings, coverage } = input;
  const urgent = findings.filter(
    (finding) => finding.priority === "critical" || finding.priority === "high",
  );
  // Coverage is judged on whether any finding exists at all. A healthy
  // scan that surfaced nothing urgent is ACTIVE with an empty list —
  // which reads as "nothing needs you", not as "we have no data".
  const { state, detail } = stateFrom(coverage, uipId, findings.length > 0);
  const base = {
    stateLabel: KPI_STATE_META[state].label,
    stateDetail: detail,
    uipId,
    capabilityId: "capability.revenue-leakage-detection",
    capabilityHref: "/revenue-leakage",
  };
  if (state !== "ACTIVE") return { ...base, state, data: null };

  const order: Record<string, number> = { critical: 0, high: 1 };
  const items = [...urgent]
    .sort(
      (a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9) || b.magnitude - a.magnitude,
    )
    .map((finding): PriorityItem => ({
      id: finding.id,
      entityName: finding.subjectLabel || finding.headline,
      rationale: finding.headline,
      priority: finding.priority,
      confidence: gradeToTier(finding.confidence),
      approved: finding.humanApproved,
    }));

  return { ...base, state, data: { items } };
}

/** Manifest Intelligence → Canonical UIP rawEvidence (cargo + voyage records). */
export function projectManifestIntelligence(input: {
  uipId: string | null;
  evidence: ReadonlyArray<NormalizedEvidence>;
  coverage: KpiCoverage | undefined;
}): PanelProjection<ManifestPanelData> {
  const { uipId, evidence, coverage } = input;
  const cargo = evidence.filter((e) => e.kind === "cargo");
  const voyages = evidence.filter((e) => e.kind === "voyage");
  const portCalls = evidence.filter((e) => e.kind === "port-call");
  const relevant = cargo.length + voyages.length + portCalls.length;
  const { state, detail } = stateFrom(coverage, uipId, relevant > 0);
  const base = {
    stateLabel: KPI_STATE_META[state].label,
    stateDetail: detail,
    uipId,
    capabilityId: "kpi.manifest-intelligence",
    capabilityHref: "/manifest",
  };
  if (state !== "ACTIVE") return { ...base, state, data: null };

  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const mismatches = [...cargo, ...voyages].filter((e) => {
    const declared = num(e.fields["declaredTonnage"]) ?? num(e.fields["manifestTonnage"]);
    const actual = num(e.fields["actualTonnage"]);
    return declared !== undefined && actual !== undefined && Math.abs(actual - declared) > 0;
  }).length;

  const tier = gradeToTier(weakest([...cargo, ...voyages, ...portCalls].map((e) => e.grade)));
  const data: ManifestPanelData = {
    confidence: tier,
    metrics: [
      { key: "cargo", label: "Cargo declarations in UIP", value: cargo.length, confidence: tier },
      { key: "voyages", label: "Voyage records", value: voyages.length, confidence: tier },
      {
        key: "port-calls",
        label: "Port calls observed",
        value: portCalls.length,
        confidence: tier,
      },
      {
        key: "mismatch",
        label: "Declared vs actual mismatches",
        value: mismatches,
        confidence: mismatches > 0 ? tier : "inferred",
      },
    ],
  };
  return { ...base, state, data };
}

/* ── Panels with no connected provider ──────────────────────────── */

/**
 * Port operations, compliance screening and past briefings.
 *
 * All three shipped as static fixtures that asserted their own
 * confidence — congestion indices marked `observed`, sanctions counts
 * marked `verified`, neither backed by anything. The numbers were
 * invented, and the confidence tier attached to them made the invention
 * read as measurement.
 *
 * None has a connected provider today:
 *
 *   port congestion   NPA SHIPPOS is registered but NOT_CONFIGURED
 *   compliance join   needs sanctions *and* arrivals; arrivals are absent
 *   briefings         no store persists a generated brief
 *
 * So each projects `NO_PROVIDER` and renders through the shared
 * `PanelStateNotice`. Manufacturing a number to fill the card is the one
 * option not available: an officer reading "Apapa 88 · Critical ·
 * observed" would be reading fiction with a confidence badge on it.
 *
 * Each becomes ACTIVE the moment its provider is configured — the
 * projection is the seam, so no panel needs rewriting when access lands.
 */
function noProviderPanel<T>(
  capabilityId: string,
  capabilityHref: string,
  uipId: string | null,
  detail: string,
): PanelProjection<T> {
  return {
    state: "NO_PROVIDER",
    stateLabel: KPI_STATE_META.NO_PROVIDER.label,
    stateDetail: detail,
    uipId,
    capabilityId,
    capabilityHref,
    data: null,
  };
}

export function projectPortOperations(input: { uipId: string | null }): PanelProjection<never> {
  return noProviderPanel(
    "capability.port-operations",
    "/data-sources",
    input.uipId,
    "No port operations provider is connected. NPA SHIPPOS is registered as the Tier 1 Nigerian source but has no machine-readable route configured, so berth occupancy and congestion cannot be observed. Nothing here should be read as a measure of current port activity.",
  );
}

export function projectComplianceWatchlist(input: {
  uipId: string | null;
}): PanelProjection<never> {
  return noProviderPanel(
    "capability.compliance-screening",
    "/data-sources",
    input.uipId,
    "Compliance counts require both a sanctions list and a record of arrivals. Sanctions screening is available, but no arrivals source is connected, so no vessel can be matched against it. An empty count here would claim that nothing arrived, which is not something Seaphore currently knows.",
  );
}

export function projectRecentBriefings(input: { uipId: string | null }): PanelProjection<never> {
  return noProviderPanel(
    "capability.briefing-history",
    "/copilot",
    input.uipId,
    "No briefing history is stored. Executive briefs are generated on demand and are not yet persisted, so there is no archive to list. This is a missing capability, not an absence of past activity.",
  );
}
