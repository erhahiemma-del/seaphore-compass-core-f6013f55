import { useCallback, useEffect } from "react";

import {
  useFocusSubjectStore,
  type FocusSubject,
  type FocusSubjectKind,
} from "@/stores/focus-subject.store";

/**
 * Shared focus/recede/dismiss behaviour for Intelligence Centres.
 *
 * PRESENTATION ONLY. The centre passes the subject it has already
 * projected; this hook only mirrors it into the workspace focus store so
 * every centre focuses, recedes and dismisses identically:
 *
 *   · selecting a subject promotes it (SubjectHeader + Context Rail)
 *   · unrelated panels recede via `isReceded(kind)`
 *   · Esc or the header dismiss clears focus
 */
export function useCentreFocus(subject: FocusSubject | null) {
  const setSubject = useFocusSubjectStore((s) => s.setSubject);
  const clearSubject = useFocusSubjectStore((s) => s.clearSubject);
  const focused = useFocusSubjectStore((s) => s.subject);

  useEffect(() => {
    if (subject) setSubject(subject);
  }, [subject, setSubject]);

  // Leaving the centre must not leave a stale subject in focus.
  useEffect(() => () => clearSubject(), [clearSubject]);

  const dismiss = useCallback(() => clearSubject(), [clearSubject]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      clearSubject();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSubject]);

  const isReceded = useCallback(
    (kind: FocusSubjectKind | FocusSubjectKind[]) => {
      if (!focused) return false;
      const kinds = Array.isArray(kind) ? kind : [kind];
      return !kinds.includes(focused.kind);
    },
    [focused],
  );

  return { focused, dismiss, isReceded, isFocused: !!focused };
}
