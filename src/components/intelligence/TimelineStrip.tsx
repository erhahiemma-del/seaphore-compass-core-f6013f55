import { ConfidenceChip, type ConfidenceTier } from "./ConfidenceChip";

/**
 * TimelineStrip — horizontal event ribbon (voyages, port calls, signals).
 * Domain-agnostic: caller supplies typed events.
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

export function TimelineStrip({ events, selectedId, onSelect }: TimelineStripProps) {
  if (events.length === 0) {
    return <div className="rounded-md border border-line bg-surface-1 p-3 text-[12px] text-slate">No events observed.</div>;
  }
  return (
    <ol className="flex gap-3 overflow-x-auto pb-1">
      {events.map((e) => {
        const selected = e.id === selectedId;
        const interactive = Boolean(onSelect);
        const cls = `min-w-[180px] rounded-md border p-3 ${selected ? "border-accent bg-surface-2" : "border-line bg-surface-1"} ${interactive ? "cursor-pointer hover:bg-surface-2" : ""}`;
        const content = (
          <>
            <div className="type-mono text-[10px] text-slate">{new Date(e.at).toISOString().slice(0, 16).replace("T", " ")}</div>
            <div className="mt-1 text-[12px] font-semibold text-foreground">{e.label}</div>
            {e.detail && <div className="text-[11px] text-slate">{e.detail}</div>}
            {e.confidence && (
              <div className="mt-2">
                <ConfidenceChip tier={e.confidence} size={9} />
              </div>
            )}
          </>
        );
        return interactive ? (
          <li key={e.id}>
            <button type="button" className={`${cls} text-left w-full`} onClick={() => onSelect?.(e.id)}>{content}</button>
          </li>
        ) : (
          <li key={e.id} className={cls}>{content}</li>
        );
      })}
    </ol>
  );
}
