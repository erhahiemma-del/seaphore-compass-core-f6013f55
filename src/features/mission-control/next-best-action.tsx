/**
 * Next Best Action — the strongest decision surface on Mission Control.
 *
 * Presentation only. It renders the highest-priority item the existing
 * `projectTodaysPriorities` projection produced; it does not re-rank, score
 * or invent anything. When the projection has no data the panel states the
 * operational reason instead of a fabricated recommendation.
 */
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import type { PanelProjection, PrioritiesPanelData } from "@/lib/intelligence/dashboard-projection";
import { cn } from "@/lib/utils";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="type-label text-white/55">{label}</div>
      <div className="mt-1 min-w-0 text-[13px] font-semibold leading-snug text-white/90">
        {children}
      </div>
    </div>
  );
}

export function NextBestAction({
  projection,
  onAct,
}: {
  projection: PanelProjection<PrioritiesPanelData>;
  onAct: (subjectId: string) => void;
}) {
  const item = projection.data?.items[0] ?? null;

  if (!item) {
    return (
      <section
        aria-label="Next best action"
        data-testid="next-best-action"
        className="overflow-hidden rounded-lg border border-[color:var(--navy)] bg-[color:var(--navy)] elev-2"
      >
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,0.7fr))_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-label text-white/55">Next best action</span>
              <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white/70">
                {projection.stateLabel}
              </span>
            </div>
            <div className="mt-2 flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
                <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[18px] font-semibold tracking-tight text-white">
                  Action unavailable
                </h2>
                <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-white/70">
                  {projection.stateDetail}
                </p>
              </div>
            </div>
          </div>
          <Field label="Evidence">
            <ConfidenceChip tier="unconfirmed" size={9} />
          </Field>
          <Field label="Status">Awaiting evidence</Field>
          <Field label="Owner">Officer</Field>
          <Field label="Required action">Inspect capability</Field>
          <a
            href={projection.capabilityHref}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-white px-4 py-2.5 text-[13px] font-semibold text-[color:var(--navy)] motion-fast hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 lg:self-center"
          >
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Next best action"
      data-testid="next-best-action"
      className="overflow-hidden rounded-lg border border-[color:var(--navy)] bg-[color:var(--navy)] elev-2"
    >
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,0.7fr))_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-label text-white/55">Next best action</span>
            <span className="rounded-sm bg-[color:var(--status-review-tint)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--status-review)]">
              {item.priority}
            </span>
          </div>
          <div className="mt-2 flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
              <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[18px] font-semibold tracking-tight text-white">
                {item.entityName}
              </h2>
              <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-white/70">
                {item.rationale}
              </p>
            </div>
          </div>
        </div>

        <Field label="Evidence">
          <ConfidenceChip tier={item.confidence} size={9} />
        </Field>
        <Field label="Status">{item.approved ? "Officer approved" : "Awaiting decision"}</Field>
        <Field label="Owner">Officer</Field>
        <Field label="Required action">Review evidence</Field>

        <button
          type="button"
          onClick={() => onAct(item.id)}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-white px-4 py-2.5 text-[13px] font-semibold text-[color:var(--navy)] motion-fast hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 lg:self-center"
        >
          Review evidence
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
