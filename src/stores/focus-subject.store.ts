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
/**
 * What kind of thing the officer is working on.
 *
 * Extended in Phase 3 rather than replaced. Every kind added here is one
 * an existing vocabulary already recognises, because a focus kind the
 * rest of the application cannot resolve is a subject nothing can answer
 * questions about:
 *
 *   voyage         MapSelectionKind, MissionSliceKey
 *   manifest       MissionSliceKey, /manifest
 *   incident       MapSelectionKind, CaseSubjectKind
 *   investigation  MapSelectionKind, /investigate/$id, the workflow store
 *
 * `location` is deliberately absent despite being asked for. Nothing in
 * this system models a bare location as an entity — the map's spatial
 * kinds are zone, geofence, anchorage, berth, terminal and
 * infrastructure, each with its own identity and parent. Adding a
 * catch-all `location` would mean inventing a type only the Focus
 * Workspace believed in, and coercing six real kinds into it.
 */
export type FocusSubjectKind =
  | "vessel"
  | "port"
  | "cargo"
  | "company"
  | "risk-event"
  | "voyage"
  | "manifest"
  | "incident"
  | "investigation";

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
  /**
   * Whether the contextual Focus Workspace surface is open.
   *
   * Transient UI state, and separate from `subject` on purpose. The two
   * answer different questions: the subject is *what the officer is
   * working on*, the flag is *whether the drawer is currently showing*.
   * Collapsing them would make dismissing the drawer silently discard
   * the officer's subject, so the Context Rail, the map highlight and
   * the Copilot would all forget what was in hand because a panel was
   * closed.
   *
   * The institutional work state — the case, its evidence, its stage —
   * is not here at all. That belongs to the workflow store and survives
   * regardless of what this flag says.
   */
  workspaceOpen: boolean;
  /**
   * Focus a subject without opening the workspace.
   *
   * The pre-Phase-3 behaviour, unchanged. Intelligence Centres call this
   * through `useCentreFocus` to promote a subject into the Context Rail,
   * and they must keep working exactly as they did — a drawer suddenly
   * appearing on every centre selection would be a behaviour change to
   * surfaces this phase was not asked to touch.
   */
  setSubject: (subject: FocusSubject) => void;
  /** Focus a subject *and* open the workspace — the Phase 3 SELECT. */
  openWorkspace: (subject: FocusSubject) => void;
  /** Close the transient surface. The subject stays in focus. */
  dismissWorkspace: () => void;
  /** Drop the subject entirely, closing the surface with it. */
  clearSubject: () => void;
}

export const useFocusSubjectStore = create<FocusSubjectState>((set) => ({
  subject: null,
  workspaceOpen: false,
  setSubject: (subject) => set({ subject }),
  openWorkspace: (subject) => set({ subject, workspaceOpen: true }),
  dismissWorkspace: () => set({ workspaceOpen: false }),
  // A cleared subject cannot leave an open workspace behind it: the
  // surface would have nothing to render and no way to be closed.
  clearSubject: () => set({ subject: null, workspaceOpen: false }),
}));

/** True when a subject is in focus and `kind` is not the focused kind. */
export function useIsReceded(kind: FocusSubjectKind | FocusSubjectKind[]): boolean {
  const subject = useFocusSubjectStore((s) => s.subject);
  if (!subject) return false;
  const kinds = Array.isArray(kind) ? kind : [kind];
  return !kinds.includes(subject.kind);
}
