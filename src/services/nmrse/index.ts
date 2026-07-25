/**
 * Sprint 1G — National Maritime Risk Scoring Engine (NMRSE).
 *
 * Continuously scores vessels, ports, operators, companies, and activities
 * on a 0–100 scale using explainable, weighted components derived from
 * fused intelligence (PIE predictions, OSAE priority, sanctions proximity,
 * compliance history, Knowledge-Graph connectivity, revenue leakage).
 * OSAE remains the sole authority for operational priority; NMRSE
 * produces a *national* risk view that composes OSAE with the other
 * signals. Every score carries a per-component breakdown and citations.
 *
 * Golden Rule: Detect. Decide. Act. Every operational recommendation must be
 * explainable, evidence-backed, and human-approved before execution.
 */
import { create } from "zustand";
import type { EvidenceGrade } from "@/services/ial/types";
import type { Prediction } from "@/services/pie";
import type { LeakageFinding } from "@/services/revenue-leakage";

export type ScoredEntityKind = "vessel" | "port" | "operator" | "company" | "activity";

export type RiskBand = "low" | "elevated" | "high" | "critical";

export interface RiskComponent {
  readonly key:
    | "pie-predictions"
    | "osae-priority"
    | "sanctions-proximity"
    | "compliance-history"
    | "graph-connectivity"
    | "revenue-leakage";
  readonly label: string;
  /** Raw contribution 0..1 before weighting. */
  readonly raw: number;
  /** Fixed weight applied to `raw`. */
  readonly weight: number;
  /** Points contributed to the composite (`raw * weight * 100`). */
  readonly points: number;
  readonly rationale: string;
  readonly evidenceIds: ReadonlyArray<string>;
}

export interface NationalRiskScore {
  readonly entityId: string;
  readonly entityLabel: string;
  readonly kind: ScoredEntityKind;
  readonly score: number; // 0..100
  readonly band: RiskBand;
  readonly confidence: EvidenceGrade;
  readonly components: ReadonlyArray<RiskComponent>;
  readonly computedAt: string;
}

export interface NmrseInputs {
  readonly predictions?: ReadonlyArray<Prediction>;
  readonly osaePriority?: "watch" | "monitor" | "act" | "urgent";
  readonly osaeEvidenceIds?: ReadonlyArray<string>;
  readonly sanctionsProximity?: {
    /** 0 = none, 1 = direct hit, 0.6 = indirect one hop, 0.4 = two hops. */
    readonly proximity: number;
    readonly evidenceIds?: ReadonlyArray<string>;
  };
  readonly complianceHistory?: {
    readonly detentions: number;
    readonly deficiencies: number;
    readonly evidenceIds?: ReadonlyArray<string>;
  };
  readonly graphConnectivity?: {
    /** Count of high-risk neighbors in the MKG. */
    readonly highRiskNeighbors: number;
    readonly totalNeighbors: number;
    readonly evidenceIds?: ReadonlyArray<string>;
  };
  readonly revenueLeakage?: ReadonlyArray<LeakageFinding>;
}

const WEIGHTS: Record<RiskComponent["key"], number> = {
  "pie-predictions": 0.25,
  "osae-priority": 0.2,
  "sanctions-proximity": 0.2,
  "compliance-history": 0.15,
  "graph-connectivity": 0.1,
  "revenue-leakage": 0.1,
};

const OSAE_RAW: Record<NonNullable<NmrseInputs["osaePriority"]>, number> = {
  watch: 0.15,
  monitor: 0.35,
  act: 0.7,
  urgent: 1,
};

const GRADE_RANK: Record<EvidenceGrade, number> = {
  UNKNOWN: 0,
  INFERRED: 1,
  REPORTED: 2,
  OBSERVED: 3,
  CORROBORATED: 4,
  VERIFIED: 5,
};

function weakest(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  return grades.reduce((min, g) => (GRADE_RANK[g] < GRADE_RANK[min] ? g : min), grades[0]);
}

function bandOf(score: number): RiskBand {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "elevated";
  return "low";
}

export function scoreEntity(
  entity: { id: string; label: string; kind: ScoredEntityKind },
  inputs: NmrseInputs,
  opts?: { now?: () => Date },
): NationalRiskScore {
  const now = (opts?.now ?? (() => new Date()))();

  const components: RiskComponent[] = [];
  const grades: EvidenceGrade[] = [];

  // PIE — average probability of alerting predictions.
  const alerting = (inputs.predictions ?? []).filter((p) => p.alert);
  const pieRaw =
    alerting.length === 0
      ? 0
      : alerting.reduce((s, p) => s + p.probability, 0) / alerting.length;
  components.push({
    key: "pie-predictions",
    label: "Predictive Intelligence",
    raw: pieRaw,
    weight: WEIGHTS["pie-predictions"],
    points: Math.round(pieRaw * WEIGHTS["pie-predictions"] * 100 * 100) / 100,
    rationale:
      alerting.length === 0
        ? "No alerting predictions for this entity."
        : `${alerting.length} alerting prediction(s); mean probability ${(pieRaw * 100).toFixed(0)}%.`,
    evidenceIds: alerting.flatMap((p) => p.citations.map((c) => c.evidenceId)).slice(0, 8),
  });
  alerting.forEach((p) => grades.push(p.confidence));

  // OSAE priority.
  const osaeRaw = inputs.osaePriority ? OSAE_RAW[inputs.osaePriority] : 0;
  components.push({
    key: "osae-priority",
    label: "OSAE Priority",
    raw: osaeRaw,
    weight: WEIGHTS["osae-priority"],
    points: Math.round(osaeRaw * WEIGHTS["osae-priority"] * 100 * 100) / 100,
    rationale: inputs.osaePriority
      ? `OSAE assigned priority: ${inputs.osaePriority}.`
      : "No OSAE assessment on file.",
    evidenceIds: inputs.osaeEvidenceIds ?? [],
  });

  // Sanctions proximity.
  const sancRaw = Math.max(0, Math.min(1, inputs.sanctionsProximity?.proximity ?? 0));
  components.push({
    key: "sanctions-proximity",
    label: "Sanctions Proximity",
    raw: sancRaw,
    weight: WEIGHTS["sanctions-proximity"],
    points: Math.round(sancRaw * WEIGHTS["sanctions-proximity"] * 100 * 100) / 100,
    rationale:
      sancRaw >= 1
        ? "Direct sanctions match."
        : sancRaw > 0
          ? `Indirect sanctions link (proximity ${(sancRaw * 100).toFixed(0)}%).`
          : "No sanctions link observed.",
    evidenceIds: inputs.sanctionsProximity?.evidenceIds ?? [],
  });
  if (sancRaw > 0) grades.push("VERIFIED");

  // Compliance history.
  const cd = inputs.complianceHistory?.detentions ?? 0;
  const defs = inputs.complianceHistory?.deficiencies ?? 0;
  const compRaw = Math.min(1, cd * 0.35 + defs * 0.05);
  components.push({
    key: "compliance-history",
    label: "Compliance History",
    raw: compRaw,
    weight: WEIGHTS["compliance-history"],
    points: Math.round(compRaw * WEIGHTS["compliance-history"] * 100 * 100) / 100,
    rationale: `${cd} detention(s), ${defs} deficiency record(s).`,
    evidenceIds: inputs.complianceHistory?.evidenceIds ?? [],
  });
  if (compRaw > 0) grades.push("VERIFIED");

  // Graph connectivity — share of high-risk neighbors.
  const gc = inputs.graphConnectivity;
  const gcRaw = gc && gc.totalNeighbors > 0 ? Math.min(1, gc.highRiskNeighbors / gc.totalNeighbors) : 0;
  components.push({
    key: "graph-connectivity",
    label: "Graph Connectivity (MKG)",
    raw: gcRaw,
    weight: WEIGHTS["graph-connectivity"],
    points: Math.round(gcRaw * WEIGHTS["graph-connectivity"] * 100 * 100) / 100,
    rationale: gc
      ? `${gc.highRiskNeighbors}/${gc.totalNeighbors} MKG neighbors are high-risk.`
      : "No graph neighborhood data.",
    evidenceIds: gc?.evidenceIds ?? [],
  });
  if (gcRaw > 0) grades.push("CORROBORATED");

  // Revenue leakage — normalize by 250k threshold.
  const leaks = inputs.revenueLeakage ?? [];
  const totalLeak = leaks.reduce((s, l) => s + l.magnitude, 0);
  const leakRaw = Math.min(1, totalLeak / 250_000);
  components.push({
    key: "revenue-leakage",
    label: "Revenue Leakage",
    raw: leakRaw,
    weight: WEIGHTS["revenue-leakage"],
    points: Math.round(leakRaw * WEIGHTS["revenue-leakage"] * 100 * 100) / 100,
    rationale:
      leaks.length === 0
        ? "No leakage findings for this entity."
        : `${leaks.length} finding(s); estimated ${totalLeak.toLocaleString()} in leakage.`,
    evidenceIds: leaks.flatMap((l) => l.citations.map((c) => c.evidenceId)).slice(0, 8),
  });
  leaks.forEach((l) => grades.push(l.confidence));

  const score = Math.round(components.reduce((s, c) => s + c.points, 0) * 10) / 10;

  return {
    entityId: entity.id,
    entityLabel: entity.label,
    kind: entity.kind,
    score,
    band: bandOf(score),
    confidence: weakest(grades),
    components,
    computedAt: now.toISOString(),
  };
}

interface NmrseState {
  scores: ReadonlyArray<NationalRiskScore>;
  score(entity: { id: string; label: string; kind: ScoredEntityKind }, inputs: NmrseInputs): NationalRiskScore;
  scoreMany(items: ReadonlyArray<{ entity: { id: string; label: string; kind: ScoredEntityKind }; inputs: NmrseInputs }>): NationalRiskScore[];
  find(entityId: string): NationalRiskScore | undefined;
  reset(): void;
}

export const useNmrseStore = create<NmrseState>((set, get) => ({
  scores: [],
  score(entity, inputs) {
    const s = scoreEntity(entity, inputs);
    set((state) => ({
      scores: [s, ...state.scores.filter((x) => x.entityId !== entity.id)],
    }));
    return s;
  },
  scoreMany(items) {
    const scored = items.map((i) => scoreEntity(i.entity, i.inputs));
    set(() => ({
      scores: [...scored].sort((a, b) => b.score - a.score),
    }));
    return scored;
  },
  find(id) {
    return get().scores.find((s) => s.entityId === id);
  },
  reset() {
    set({ scores: [] });
  },
}));
