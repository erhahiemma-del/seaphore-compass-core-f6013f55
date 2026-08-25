/**
 * Intelligence Events — a compact horizontal timeline.
 *
 * Presentation only. Events are the signals the existing intelligence feed
 * projection produced, in the order the capability reported them. No
 * decorative activity is added to fill the strip: an unavailable capability
 * shows its own state instead.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { PanelStateNotice } from "@/components/intelligence/PanelStateNotice";
import { PanelCard } from "@/components/panel-card";
import type { FeedPanelData, PanelProjection } from "@/lib/intelligence/dashboard-projection";

export function IntelligenceEventsStrip({
  projection,
  onOpen,
}: {
  projection: PanelProjection<FeedPanelData>;
  onOpen: (subjectId: string, signalId: string) => void;
}) {
  const signals = projection.data?.signals ?? [];

  return (
    <PanelCard className="flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="type-h1 text-foreground">Intelligence Events</h2>
          <p className="type-small text-slate">Observed signals, in the order reported</p>
        </div>
        <Link
          to="/detect"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[color:var(--ocean)] hover:underline"
        >
          View full timeline <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {projection.state !== "ACTIVE" || signals.length === 0 ? (
        <PanelStateNotice
          state={projection.state}
          detail={projection.stateDetail}
          href="/detect"
          hrefLabel="Open Detect"
        />
      ) : (
        <div className="relative overflow-x-auto pb-1">
          <div
            aria-hidden
            className="absolute inset-x-0 top-[10px] h-px bg-[color:var(--line-soft)]"
          />
          <ol className="relative flex min-w-full gap-3">
            {signals.slice(0, 8).map((signal) => (
              <li key={signal.id} className="w-[220px] shrink-0">
                <button
                  type="button"
                  onClick={() => onOpen(signal.subjectId, signal.id)}
                  className="group w-full rounded-md border border-line bg-surface p-2.5 pt-4 text-left motion-fast hover:border-[color:var(--ocean)]/60 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ocean)]/40"
                >
                  <span className="mb-2 block h-2 w-2 rounded-full bg-[color:var(--ocean)]" />
                  <span className="block truncate type-h2 text-foreground">{signal.title}</span>
                  <span className="mt-1 line-clamp-2 block type-small leading-relaxed text-slate">
                    {signal.subtitle}
                  </span>
                  <span className="mt-2 block">
                    <ConfidenceChip tier={signal.confidence} size={9} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </PanelCard>
  );
}
