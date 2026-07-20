/**
 * Evidence grade → Tailwind class map. No inline styles.
 * Colors track the spec's 6 grade palette: Green, Teal, Blue,
 * Orange, Purple, Gray. All classes are colour-blind safe when
 * paired with the grade label — colour is never the only signal.
 */
import type { EvidenceGrade } from "./types";

export interface GradeVisual {
  label: string;
  border: string;
  chip: string;
  dot: string;
}

export const GRADE_VISUALS: Record<EvidenceGrade, GradeVisual> = {
  VERIFIED: {
    label: "Verified",
    border: "border-l-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    dot: "bg-emerald-500",
  },
  CORROBORATED: {
    label: "Corroborated",
    border: "border-l-teal-500",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/40",
    dot: "bg-teal-500",
  },
  OBSERVED: {
    label: "Observed",
    border: "border-l-sky-500",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
    dot: "bg-sky-500",
  },
  REPORTED: {
    label: "Reported",
    border: "border-l-orange-500",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40",
    dot: "bg-orange-500",
  },
  INFERRED: {
    label: "Inferred",
    border: "border-l-purple-500",
    chip: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40",
    dot: "bg-purple-500",
  },
  UNKNOWN: {
    label: "Unknown",
    border: "border-l-muted-foreground/40",
    chip: "bg-muted text-muted-foreground border-muted-foreground/30",
    dot: "bg-muted-foreground/50",
  },
};

export function gradeVisual(grade: EvidenceGrade): GradeVisual {
  return GRADE_VISUALS[grade] ?? GRADE_VISUALS.UNKNOWN;
}
