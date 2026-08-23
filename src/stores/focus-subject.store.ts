import { create } from "zustand";

/**
 * Adaptive workspace focus — PRESENTATION ONLY.
 *
 * Holds a reference to the subject the officer is currently working on
 * (vessel, port, cargo, company or risk event) so the workspace can bring
 * the relevant surface forward and let unrelated panels recede.
 *
 * It never fetches, derives, scores or caches intelligence. Every value the
 * Context Rail shows is passed in by the surface that already projected it
 * from the Canonical UIP.
 */
export type FocusSubjectKind = "vessel" | "port" | "cargo" | "company" | "risk-event";

export interface FocusSubjectFact {
  label: string;
  value: string;
  /** Confidence tier label already computed upstream — never invented here. */
  confidence?: string;
}

export interface FocusSubject {
  kind: FocusSubjectKind;
  id: string;
  title: string;
  /** Short identifier line (IMO, port code, BL number, RC number…). */
  descriptor?: string;
  /** Officer-facing facts, already projected by the calling surface. */
  facts?: FocusSubjectFact[];
  /** Route to open the subject's full workspace. */
  href?: string;
}

interface FocusSubjectState {
  subject: FocusSubject | null;
  setSubject: (subject: FocusSubject) => void;
  clearSubject: () => void;
}

export const useFocusSubjectStore = create<FocusSubjectState>((set) => ({
  subject: null,
  setSubject: (subject) => set({ subject }),
  clearSubject: () => set({ subject: null }),
}));

/** True when a subject is in focus and `kind` is not the focused kind. */
export function useIsReceded(kind: FocusSubjectKind | FocusSubjectKind[]): boolean {
  const subject = useFocusSubjectStore((s) => s.subject);
  if (!subject) return false;
  const kinds = Array.isArray(kind) ? kind : [kind];
  return !kinds.includes(subject.kind);
}
