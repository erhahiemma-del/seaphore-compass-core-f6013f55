/**
 * Feeding the Copilot what the officer is actually looking at.
 *
 * `copilot.store` has carried a `CopilotContext` and the `ContextBar`
 * that renders it since before this phase. Nothing ever called
 * `setContext`, so the Copilot opened knowing nothing about the work in
 * front of the officer — they had to re-explain their own screen.
 *
 * This wires the contract to the things the application already knows:
 * the route, the Mission Mode, the Focus Subject, and — since Phase 3 —
 * the open case for that subject when there is one. It creates no second
 * Copilot state and no new store; it writes to the existing one and
 * nothing else reads it differently.
 *
 * ## It reports context; it does not claim capability
 *
 * Everything here is a statement about *what the officer is doing*.
 * Nothing asserts what the Copilot can answer, what data it can reach,
 * or what evidence exists — those depend on providers that are, at the
 * time of writing, unconnected. A context line saying "focused on a
 * vessel" is true. A line promising "I can summarise this vessel's
 * intelligence profile" would not be.
 *
 * ## Focus outranks mode for the *subject*
 *
 * The kind describes what is being examined, so a focused vessel makes
 * it a vessel context even in Revenue Assurance. The mode is carried in
 * `detail` instead, because it describes how the officer is reading —
 * which is genuinely secondary when there is a subject in hand.
 */
import { useEffect } from "react";

import { useCopilotStore, type CopilotContext } from "@/stores/copilot.store";
import { useFocusSubjectStore, type FocusSubjectKind } from "@/stores/focus-subject.store";

import { useFocusWorkspace } from "@/features/focus-workspace/useFocusWorkspace";

import { useMissionMode } from "./useMissionMode";
import type { MissionMode } from "./modes";

/**
 * Focus kinds the Copilot context vocabulary can express.
 *
 * `CopilotContextKind` is narrower than `FocusSubjectKind` — it knows
 * vessels, ports, investigations and cases. A cargo or company subject
 * has no matching kind, and is deliberately *not* coerced into one:
 * telling the Copilot a company is a vessel would be worse than telling
 * it nothing. Those fall back to the mode-only context below.
 */
const FOCUS_TO_COPILOT: Readonly<Partial<Record<FocusSubjectKind, CopilotContext["kind"]>>> = {
  vessel: "vessel",
  port: "port",
  /*
   * A focused investigation is a case, and `case` is the vocabulary
   * member that means exactly that. Mapping it to `investigation` would
   * be indistinguishable from the no-subject fallback below, which uses
   * that kind for "working from this lens, on nothing in particular".
   */
  investigation: "case",
};

/**
 * Derive the context from mode and focus.
 *
 * Pure and exported so the mapping is testable without mounting a
 * component or touching either store.
 */
export function deriveCopilotContext(
  mode: MissionMode,
  focus: { kind: FocusSubjectKind; title: string; descriptor?: string } | null,
  /**
   * The open case for the focused subject, when one exists.
   *
   * Passed in rather than read here, so this stays pure and so the
   * binding cannot accidentally report a workflow that belongs to a
   * different subject. Absent means no case is open — which is the
   * normal state, and is reported by saying nothing about workflow
   * rather than by claiming there is none.
   */
  work?: { readonly caseTitle: string; readonly stage: string } | null,
): CopilotContext {
  if (focus) {
    const kind = FOCUS_TO_COPILOT[focus.kind];
    if (kind) {
      /*
       * Detail is assembled only from parts that are real. The mode is
       * always true; the descriptor exists when the calling surface
       * projected one; the workflow line appears only when a case is
       * genuinely open. Telling the Copilot about a workflow that does
       * not exist would be the exact failure this binding was written to
       * avoid.
       */
      const parts = [
        focus.descriptor,
        work ? `${work.caseTitle} · ${work.stage}` : null,
        mode.label,
      ].filter((p): p is string => !!p);
      return { kind, label: focus.title, detail: parts.join(" · ") };
    }
  }
  /*
   * No subject, or one the vocabulary cannot express.
   *
   * Reported as an investigation context carrying the lens: it is the
   * closest honest description of "the officer is working, on this
   * perspective, on nothing in particular yet".
   */
  return { kind: "investigation", label: mode.label, detail: mode.purpose };
}

/**
 * Keep the Copilot's context in step with the officer's screen.
 *
 * Mounted once by Mission Control. Deliberately not mounted globally in
 * the root: other surfaces set their own context — an investigation
 * page knows more about its case than this could infer — and a global
 * binding would overwrite them.
 */
export function useCopilotContextBinding(): void {
  const { mode } = useMissionMode();
  const subject = useFocusSubjectStore((s) => s.subject);
  const setContext = useCopilotStore((s) => s.setContext);

  /*
   * The workflow comes from the Focus Workspace model rather than a
   * second lookup against the case store. `buildFocusWorkspace` already
   * decides which case belongs to this subject — including refusing to
   * match one whose kind differs — and a second copy of that rule here
   * would eventually disagree with it about which case the officer is
   * looking at.
   */
  const { model } = useFocusWorkspace();
  const work = model?.work.state === "present" ? model.work.data : null;

  /*
   * Depended on as primitives rather than as `work`.
   *
   * The model is rebuilt whenever its inputs change identity, so the
   * work object is a new reference each time even when the case is the
   * same. Listing it directly would re-run this effect — and rewrite the
   * Copilot's context — on renders where nothing about the officer's
   * situation changed.
   */
  const caseTitle = work?.caseTitle ?? null;
  const stage = work?.stage ?? null;

  useEffect(() => {
    setContext(
      deriveCopilotContext(
        mode,
        subject
          ? { kind: subject.kind, title: subject.title, descriptor: subject.descriptor }
          : null,
        caseTitle && stage ? { caseTitle, stage } : null,
      ),
    );
  }, [mode, subject, caseTitle, stage, setContext]);
}
