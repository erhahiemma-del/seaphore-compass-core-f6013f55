/**
 * Cargo Confidence Model (GOV-02) — canonical, evidence-based, explainable.
 *
 * confidence = Σ (axisWeight × axisAchievement) over the eight cargo axes,
 * expressed 0–100 and graded A–E. Pure functions; no I/O, no state.
 *
 * Achievement per axis:
 *   absent            → 0
 *   present           → 0.6 baseline
 *   + quality         → up to 0.25 (completeness × freshness of the record)
 *   + corroboration   → up to 0.15 (independent sources on the same axis)
 *   conflicting       → achievement halved and the conflict surfaced
 *
 * A high-authority axis never masks a thin record: missing and conflicting
 * evidence are always returned so the officer sees what the score does not know.
 */
import type {
  CargoAxisContribution,
  CargoAxisObservation,
  CargoConfidenceAssessment,
  CargoConfidenceGrade,
  CargoEvidenceAxis,
} from "./types";

export const CARGO_AXIS_WEIGHTS: Readonly<Record<CargoEvidenceAxis, number>> = {
  government_declaration: 0.3,
  nimasa_return: 0.15,
  bill_of_lading: 0.13,
  ais_voyage: 0.12,
  company_verification: 0.1,
  revenue_assessment: 0.09,
  sanctions: 0.07,
  supporting_intelligence: 0.04,
};

export const CARGO_AXIS_LABELS: Readonly<Record<CargoEvidenceAxis, string>> = {
  government_declaration: "Government declaration",
  nimasa_return: "NIMASA return",
  bill_of_lading: "Bill of Lading",
  ais_voyage: "AIS / voyage evidence",
  company_verification: "Company verification",
  revenue_assessment: "Revenue assessment",
  sanctions: "Sanctions screening",
  supporting_intelligence: "Supporting intelligence",
};

export const CARGO_AXES = Object.keys(CARGO_AXIS_WEIGHTS) as ReadonlyArray<CargoEvidenceAxis>;

const BASELINE = 0.6;
const QUALITY_SHARE = 0.25;
const CORROBORATION_SHARE = 0.15;

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function gradeForScore(score: number): CargoConfidenceGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "E";
}

export function axisAchievement(obs: CargoAxisObservation): number {
  if (!obs.present) return 0;
  const quality = clamp01(obs.quality ?? 0.7);
  const corroboration = clamp01((obs.corroboration ?? 1) >= 3 ? 1 : ((obs.corroboration ?? 1) - 1) / 2);
  let achieved = BASELINE + QUALITY_SHARE * quality + CORROBORATION_SHARE * corroboration;
  if (obs.conflicting) achieved *= 0.5;
  return clamp01(achieved);
}

/**
 * Assess cargo confidence from whatever axes were observed. Axes not supplied
 * are treated as absent and reported under `missingEvidence`.
 */
export function assessCargoConfidence(
  observations: ReadonlyArray<CargoAxisObservation>,
): CargoConfidenceAssessment {
  const byAxis = new Map(observations.map((o) => [o.axis, o]));

  const breakdown: CargoAxisContribution[] = CARGO_AXES.map((axis) => {
    const obs = byAxis.get(axis) ?? { axis, present: false };
    const weight = CARGO_AXIS_WEIGHTS[axis];
    const achieved = axisAchievement(obs);
    return {
      axis,
      label: CARGO_AXIS_LABELS[axis],
      weight,
      achieved: round(achieved, 3),
      points: round(weight * achieved * 100),
      present: Boolean(obs.present),
      conflicting: Boolean(obs.conflicting),
      sourceIds: obs.sourceIds ?? [],
    };
  });

  const score = round(breakdown.reduce((s, c) => s + c.points, 0));
  const grade = gradeForScore(score);

  const missingEvidence = breakdown
    .filter((c) => !c.present)
    .map((c) => ({ axis: c.axis, label: c.label, impact: round(c.weight * 100) }))
    .sort((a, b) => b.impact - a.impact);

  const conflictingEvidence = breakdown
    .filter((c) => c.conflicting)
    .map((c) => ({ axis: c.axis, label: c.label }));

  const strongest = [...breakdown].filter((c) => c.present).sort((a, b) => b.points - a.points)[0];

  const parts = [
    `Confidence ${score}% (grade ${grade})`,
    strongest
      ? `led by ${strongest.label.toLowerCase()} (${strongest.points} pts)`
      : "no cargo evidence axis is present",
    missingEvidence.length > 0
      ? `missing ${missingEvidence
          .slice(0, 3)
          .map((m) => m.label.toLowerCase())
          .join(", ")}`
      : "all eight evidence axes present",
    conflictingEvidence.length > 0
      ? `${conflictingEvidence.length} axis conflict${conflictingEvidence.length === 1 ? "" : "s"} unresolved`
      : "no source conflicts detected",
  ];

  return {
    score,
    grade,
    breakdown,
    missingEvidence,
    conflictingEvidence,
    explanation: `${parts.join("; ")}. The system recommends; the officer decides.`,
  };
}
