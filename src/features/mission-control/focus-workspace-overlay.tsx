/**
 * Focus Workspace overlay — a contextual layer over Mission Control.
 *
 * Presentation only. The subject, its facts and every officer action come
 * from the existing focus-subject store and `ContextRail`; this component
 * adds the slide-in surface, backdrop dimming and Escape handling so the
 * officer never loses orientation to the page underneath.
 */
import { useEffect } from "react";

import { ContextRail } from "@/components/layout/ContextRail";
import { useFocusSubjectStore } from "@/stores/focus-subject.store";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export function FocusWorkspaceOverlay({ onOpen }: { onOpen: (subjectId: string) => void }) {
  const subject = useFocusSubjectStore((s) => s.subject);
  const clear = useFocusSubjectStore((s) => s.clearSubject);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject, clear]);

  if (!subject) return null;

  return (
    <div
      data-testid="focus-workspace-overlay"
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="false"
      aria-label={`Focus workspace — ${subject.title}`}
    >
      <button
        type="button"
        aria-label="Dismiss focus workspace"
        onClick={clear}
        className={cn(
          "absolute inset-0 bg-[color:var(--navy)]/25 backdrop-blur-[1px]",
          !reduced && "animate-in fade-in duration-150",
        )}
      />
      <div
        className={cn(
          "relative h-full w-full max-w-[380px] overflow-y-auto border-l border-line-strong bg-background p-3 shadow-pop",
          !reduced && "animate-in slide-in-from-right duration-200",
        )}
      >
        <ContextRail className="lg:w-full" onOpen={onOpen} />
      </div>
    </div>
  );
}
