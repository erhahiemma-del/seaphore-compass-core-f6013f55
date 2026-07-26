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
      { key: "port-calls", label: "Port calls observed", value: portCalls.length, confidence: tier },
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
