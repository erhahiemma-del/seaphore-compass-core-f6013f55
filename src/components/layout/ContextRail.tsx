import { Link } from "@tanstack/react-router";
import { ArrowUpRight, X } from "lucide-react";

import { useFocusSubjectStore, type FocusSubjectKind } from "@/stores/focus-subject.store";
import { cn } from "@/lib/utils";

/**
 * Typed against the kind union rather than `Record<string, string>`, so
 * adding a focus kind without a label is a compile error instead of a
 * rail that silently reads "Subject" over a real vessel.
 */
const KIND_LABEL: Record<FocusSubjectKind, string> = {
  vessel: "Vessel",
  port: "Port",
  cargo: "Cargo",
  company: "Company",
  "risk-event": "Risk Event",
  voyage: "Voyage",
  manifest: "Manifest",
  incident: "Incident",
  investigation: "Investigation",
};

/**
 * Context Rail — the adaptive workspace's focus surface.
 *
 * Appears only when the officer has selected a subject. It renders facts the
 * calling surface already projected; it performs no acquisition, no scoring
 * and asserts no freshness of its own.
 */
export function ContextRail({
  className,
  onOpen,
}: {
  className?: string;
  /** Officer action for "Open in workspace" when the route needs params. */
  onOpen?: (subjectId: string) => void;
}) {
  const subject = useFocusSubjectStore((s) => s.subject);
  const clear = useFocusSubjectStore((s) => s.clearSubject);

  if (!subject) return null;

  return (
    <aside
      aria-label="Focused subject"
      className={cn(
        "rail-in w-full shrink-0 rounded-lg border border-line-strong bg-surface elev-1 lg:w-[320px]",
        className,
      )}
    >
      <div className="flex items-start gap-2 border-b border-line bg-[color:var(--navy-050)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="type-label text-slate">{KIND_LABEL[subject.kind] ?? "Subject"}</div>
          <div className="type-title mt-0.5 truncate text-foreground">{subject.title}</div>
          {subject.descriptor && (
            <div className="type-mono mt-0.5 truncate text-slate">{subject.descriptor}</div>
          )}
        </div>
        <button
          type="button"
          onClick={clear}
          aria-label="Clear focus"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate hover:bg-surface-2 hover:text-foreground motion-fast"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {subject.facts && subject.facts.length > 0 && (
        <dl className="divide-y divide-[color:var(--line-soft)]">
          {subject.facts.map((f) => (
            <div key={f.label} className="flex items-baseline gap-3 px-4 py-2.5">
              <dt className="type-small w-[42%] shrink-0 text-slate">{f.label}</dt>
              <dd className="min-w-0 flex-1 text-right">
                <span className="type-mono font-semibold text-foreground">{f.value}</span>
                {f.confidence && (
                  <span className="ml-2 rounded-sm border border-[color:var(--status-inactive-edge)] bg-[color:var(--status-inactive-tint)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--status-inactive)]">
                    {f.confidence}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="border-t border-line px-4 py-3">
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(subject.id)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 type-small font-semibold text-foreground hover:border-[color:var(--ocean)]/60 motion-fast"
          >
            Open in workspace
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        ) : subject.href ? (
          <Link
            to={subject.href}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 type-small font-semibold text-foreground hover:border-[color:var(--ocean)]/60 motion-fast"
          >
            Open in workspace
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="type-small text-slate">
            System recommends; officer decides. Open the relevant centre to act on this subject.
          </p>
        )}
      </div>
    </aside>
  );
}
