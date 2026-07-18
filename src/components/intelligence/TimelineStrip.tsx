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

export function TimelineStrip({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <div className="rounded-md border border-line bg-surface-1 p-3 text-[12px] text-slate">No events observed.</div>;
  }
  return (
    <ol className="flex gap-3 overflow-x-auto pb-1">
      {events.map((e) => (
        <li key={e.id} className="min-w-[180px] rounded-md border border-line bg-surface-1 p-3">
          <div className="type-mono text-[10px] text-slate">{new Date(e.at).toISOString().slice(0, 16).replace("T", " ")}</div>
          <div className="mt-1 text-[12px] font-semibold text-foreground">{e.label}</div>
          {e.detail && <div className="text-[11px] text-slate">{e.detail}</div>}
          {e.confidence && (
            <div className="mt-2">
              <ConfidenceChip tier={e.confidence} size={9} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
