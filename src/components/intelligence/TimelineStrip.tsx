import { useMemo } from "react";
import { ConfidenceChip, type ConfidenceTier } from "./ConfidenceChip";

/**
 * TimelineStrip — horizontal event ribbon (voyages, port calls, AIS signals).
 *
 * Guarantees required by the AIS timeline UX contract:
 *   1. Events render in strict chronological order (newest → oldest by `at`).
 *   2. Events sharing an identical ISO instant collapse into a single visual
 *      card annotated with a `+N` badge, so operators never see duplicated
 *      rows for the same moment in time.
 */
export interface TimelineEvent {
  id: string;
  at: string; // ISO
  label: string;
  detail?: string;
  confidence?: ConfidenceTier;
}

export interface TimelineStripProps {
  events: TimelineEvent[];
  /** Build Bible: highlight selected event. */
  selectedId?: string;
  /** Build Bible: fired when an event is clicked. */
  onSelect?: (id: string) => void;
}

interface CollapsedEvent extends TimelineEvent {
  duplicates: number; // number of additional events at the same instant
  ids: string[]; // all underlying event ids sharing this instant
}

function orderAndDedupe(events: TimelineEvent[]): CollapsedEvent[] {
  // Stable newest-first ordering keyed on the parsed ISO instant.
  const sorted = [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const byInstant = new Map<number, CollapsedEvent>();
  const order: number[] = [];
  for (const ev of sorted) {
    const key = new Date(ev.at).getTime();
    const existing = byInstant.get(key);
    if (existing) {
      existing.duplicates += 1;
      existing.ids.push(ev.id);
    } else {
      byInstant.set(key, { ...ev, duplicates: 0, ids: [ev.id] });
      order.push(key);
    }
  }
  return order.map((k) => byInstant.get(k)!);
}

export function TimelineStrip({ events, selectedId, onSelect }: TimelineStripProps) {
  const collapsed = useMemo(() => orderAndDedupe(events), [events]);

  if (collapsed.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface-1 p-3 text-[12px] text-slate">
        No events observed.
      </div>
    );
  }
  return (
    <ol className="flex gap-3 overflow-x-auto pb-1" data-testid="ais-timeline">
      {collapsed.map((e) => {
        const selected = e.ids.includes(selectedId ?? "");
        const interactive = Boolean(onSelect);
        const cls = `relative min-w-[180px] rounded-md border p-3 ${selected ? "border-accent bg-surface-2" : "border-line bg-surface-1"} ${interactive ? "cursor-pointer hover:bg-surface-2" : ""}`;
        const content = (
          <>
            <div className="type-mono text-[10px] text-slate">
              {new Date(e.at).toISOString().slice(0, 16).replace("T", " ")}
            </div>
            <div className="mt-1 text-[12px] font-semibold text-foreground">{e.label}</div>
            {e.detail && <div className="text-[11px] text-slate">{e.detail}</div>}
            {e.confidence && (
              <div className="mt-2">
                <ConfidenceChip tier={e.confidence} size={9} />
              </div>
            )}
            {e.duplicates > 0 && (
              <span
                data-testid={`ais-timeline-dupe-${e.id}`}
                aria-label={`${e.duplicates} additional event${e.duplicates === 1 ? "" : "s"} at the same instant`}
                className="absolute right-2 top-2 rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-slate"
              >
                +{e.duplicates}
              </span>
            )}
          </>
        );
        return interactive ? (
          <li key={e.id} data-testid={`ais-timeline-item-${e.id}`} data-at={e.at}>
            <button
              type="button"
              className={`${cls} text-left w-full`}
              onClick={() => onSelect?.(e.id)}
            >
              {content}
            </button>
          </li>
        ) : (
          <li key={e.id} className={cls} data-testid={`ais-timeline-item-${e.id}`} data-at={e.at}>
            {content}
          </li>
        );
      })}
    </ol>
  );
}
