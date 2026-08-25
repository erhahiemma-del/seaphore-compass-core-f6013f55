/**
 * Priority Queue — the right column beside the National Maritime Picture.
 *
 * Presentation only. Rows come from the existing priorities projection; the
 * queue neither ranks nor filters beyond what the capability produced, and
 * an unavailable capability shows its truthful state.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { PanelStateNotice } from "@/components/intelligence/PanelStateNotice";
import { PanelCard } from "@/components/panel-card";
import type { PanelProjection, PrioritiesPanelData } from "@/lib/intelligence/dashboard-projection";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<string, string> = {
  critical:
    "text-[color:var(--status-critical)] bg-[color:var(--status-critical-tint)] border-[color:var(--status-critical-edge)]",
  high: "text-[color:var(--status-review)] bg-[color:var(--status-review-tint)] border-[color:var(--status-review-edge)]",
  medium:
    "text-[color:var(--status-active)] bg-[color:var(--status-active-tint)] border-[color:var(--status-active-edge)]",
  low: "text-[color:var(--status-inactive)] bg-[color:var(--status-inactive-tint)] border-[color:var(--status-inactive-edge)]",
};

export function PriorityQueuePanel({
  projection,
  onOpen,
  className,
}: {
  projection: PanelProjection<PrioritiesPanelData>;
  onOpen: (subjectId: string) => void;
  className?: string;
}) {
  const items = projection.data?.items ?? [];
  const rows = items.slice(0, 4);
  const placeholders = Array.from({ length: Math.max(0, 4 - rows.length) }, (_, index) => index);

  return (
    <PanelCard variant="edge" className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-[color:var(--navy-050)] px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="type-h1 text-foreground">Priority Queue</h2>
          <p className="type-small text-slate">What happened · why it matters · what to do</p>
        </div>
        <Link
          to="/investigate"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[color:var(--ocean)] hover:underline"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ul className="grid h-full grid-rows-4 divide-y divide-line">
          {projection.state === "ACTIVE" && rows.length > 0
            ? rows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="group flex h-full w-full flex-col justify-center gap-1.5 px-4 py-3 text-left motion-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ocean)]/40"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em]",
                        PRIORITY_TONE[item.priority] ?? PRIORITY_TONE.low,
                      )}
                    >
                      {item.priority}
                    </span>
                    <span className="min-w-0 flex-1 truncate type-h2 text-foreground">
                      {item.entityName}
                    </span>
                  </span>
                  <span className="type-small leading-relaxed text-foreground/80">
                    {item.rationale}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="type-small text-slate">
                      {item.approved ? "Officer approved" : "Awaiting officer decision"}
                    </span>
                    <span className="flex items-center gap-2">
                      <ConfidenceChip tier={item.confidence} size={9} />
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[color:var(--ocean)]">
                        Review <ArrowRight className="h-3 w-3" />
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))
            : null}
          {projection.state !== "ACTIVE" ? (
            <li className="row-span-4 p-4">
              <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
            </li>
          ) : null}
          {projection.state === "ACTIVE" && rows.length === 0 ? (
            <li className="row-span-4 flex h-full flex-col items-center justify-center px-6 py-10 text-center">
              <AlertTriangle className="mb-2 h-5 w-5 text-slate/60" aria-hidden />
              <p className="type-h2 text-foreground">Queue clear</p>
              <p className="mt-1 max-w-[32ch] type-small leading-relaxed text-slate">
                The detection capability ran and surfaced nothing critical or high.
              </p>
            </li>
          ) : null}
          {projection.state === "ACTIVE" && rows.length > 0
            ? placeholders.map((index) => (
                <li key={`placeholder-${index}`} className="flex h-full flex-col justify-center px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-slate">
                      Clear
                    </span>
                    <span className="min-w-0 flex-1 truncate type-h2 text-foreground">
                      No additional priority
                    </span>
                  </div>
                  <p className="mt-1 type-small leading-relaxed text-slate">
                    No further critical or high finding is projected for this queue slot.
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="type-small text-slate">No officer action required</span>
                    <ConfidenceChip tier="observed" size={9} />
                  </div>
                </li>
              ))
            : null}
        </ul>
      </div>
    </PanelCard>
  );
}
