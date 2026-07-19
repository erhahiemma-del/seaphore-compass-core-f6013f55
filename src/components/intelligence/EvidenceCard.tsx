import { FileText, Image as ImageIcon, Radar, Table as TableIcon, Waypoints } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import type { EvidenceItem } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

const TYPE_ICON = {
  PDF: FileText,
  IMG: ImageIcon,
  AIS: Radar,
  CSV: TableIcon,
  GRAPH: Waypoints,
} as const;

const TYPE_COLOR = {
  PDF: "#C0392B",
  IMG: "#7C3AED",
  AIS: "#2563EB",
  CSV: "#0E7C7B",
  GRAPH: "#B06A00",
} as const;

/**
 * Shared evidence / file card. Used by Investigate, Decision Support, Share.
 */
export interface EvidenceCardProps {
  /** Build Bible: evidence record. */
  evidence?: EvidenceItem;
  /** @deprecated Use `evidence`. Kept for existing call sites. */
  item?: EvidenceItem;
  /** Build Bible: show linked investigation reference. Reserved for future rendering. */
  showInvestigation?: boolean;
  className?: string;
}

export function EvidenceCard({ evidence, item, className }: EvidenceCardProps) {
  const record = evidence ?? item;
  if (!record) return null;
  const Icon = TYPE_ICON[record.type];
  const color = TYPE_COLOR[record.type];
  const it = record;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-line bg-card p-3 shadow-card motion-fast hover:bg-surface-2/60",
        className,
      )}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
        style={{ color, backgroundColor: `${color}14` }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-foreground">{it.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate">
          <span>{it.type}</span>
          <span>·</span>
          <span className="truncate">{it.source}</span>
          <span>·</span>
          <span>{it.timestamp}</span>
          <span>·</span>
          <span>{it.size}</span>
        </div>
      </div>
      <ConfidenceChip tier={it.confidence} size={9} />
    </div>
  );
}
