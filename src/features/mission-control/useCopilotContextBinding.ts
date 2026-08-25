/**
 * Feeding the Copilot what the officer is actually looking at.
 *
 * `copilot.store` has carried a `CopilotContext` and the `ContextBar`
 * that renders it since before this phase. Nothing ever called
 * `setContext`, so the Copilot opened knowing nothing about the work in
 * front of the officer — they had to re-explain their own screen.
 *
 * This wires the contract to the three things the application already
 * knows: the route, the Mission Mode, and the Focus Subject. It creates
 * no second Copilot state and no new store; it writes to the existing
 * one and nothing else reads it differently.
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
): CopilotContext {
  if (focus) {
    const kind = FOCUS_TO_COPILOT[focus.kind];
    if (kind) {
      return {
        kind,
        label: focus.title,
        // The lens, as secondary context — how they are reading it.
        detail: focus.descriptor ? `${focus.descriptor} · ${mode.label}` : mode.label,
      };
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

  useEffect(() => {
    setContext(
      deriveCopilotContext(
        mode,
        subject
          ? { kind: subject.kind, title: subject.title, descriptor: subject.descriptor }
          : null,
      ),
    );
  }, [mode, subject, setContext]);
}
