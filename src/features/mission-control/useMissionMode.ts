/**
 * The active Mission Control lens.
 *
 * A store rather than props because two regions need it — the ribbon,
 * which orders KPIs and renders the selector, and the panel grid, which
 * orders itself — and threading it between them would mean passing a
 * value through the page body purely to reach two leaves.
 *
 * ## Why this is not "a second global state system"
 *
 * It holds one enum and nothing else. It is deliberately *not* merged
 * into `focus-subject.store`, because mode and focus answer different
 * questions and must be able to vary independently:
 *
 *   mission mode   how should the officer read the environment?
 *   focus subject  which entity are they examining?
 *
 * Merging them would make selecting a vessel change the lens, or
 * changing the lens clear the subject — neither of which the officer
 * asked for. Combining the two is the *reader's* job: a component takes
 * both and decides what to emphasise, and `contextualEmphasis` below is
 * the one place that combination is expressed.
 *
 * It owns no intelligence, fetches nothing and derives nothing.
 */
import { create } from "zustand";

import type { FocusSubjectKind } from "@/stores/focus-subject.store";
import {
  DEFAULT_MISSION_MODE,
  MISSION_MODES,
  resolveMissionMode,
  type MissionMode,
  type MissionModeId,
} from "./modes";

interface MissionModeState {
  readonly modeId: MissionModeId;
  setModeId: (id: MissionModeId) => void;
  /** Restore from an untrusted string — a URL, a stored preference. */
  restoreMode: (id: string | null | undefined) => void;
}

const useMissionModeStore = create<MissionModeState>((set) => ({
  modeId: DEFAULT_MISSION_MODE,
  setModeId: (modeId) => set({ modeId }),
  restoreMode: (id) => set({ modeId: resolveMissionMode(id).id }),
}));

export function useMissionMode(): {
  modeId: MissionModeId;
  mode: MissionMode;
  setModeId: (id: MissionModeId) => void;
  restoreMode: (id: string | null | undefined) => void;
} {
  const modeId = useMissionModeStore((s) => s.modeId);
  const setModeId = useMissionModeStore((s) => s.setModeId);
  const restoreMode = useMissionModeStore((s) => s.restoreMode);
  return { modeId, mode: MISSION_MODES[modeId], setModeId, restoreMode };
}

/**
 * What a mode and a focused subject, together, suggest emphasising.
 *
 * Pure, and takes both as arguments rather than reading either store, so
 * the combination rule is testable and so neither store gains a
 * dependency on the other.
 *
 * The rule is deliberately conservative: focus *narrows* what the lens
 * already emphasises, and never overrides it. Investigation + a vessel
 * is still an investigation view, pointed at that hull. Port
 * Intelligence + a vessel is still the port lens, with that vessel's
 * calls brought forward. Neither reassigns the other's meaning.
 */
export function contextualEmphasis(
  mode: MissionMode,
  focusKind: FocusSubjectKind | null,
): {
  readonly mode: MissionModeId;
  readonly focus: FocusSubjectKind | null;
  /** One line an officer can read to know why the surface looks like this. */
  readonly summary: string;
} {
  if (!focusKind) {
    return Object.freeze({
      mode: mode.id,
      focus: null,
      summary: `${mode.label} — no subject focused.`,
    });
  }
  return Object.freeze({
    mode: mode.id,
    focus: focusKind,
    summary: `${mode.label}, focused on a ${focusKind}.`,
  });
}
