import { FileText } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import type { CopilotEvidence } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/**
 * Evidence renderer — every Copilot observation and recommendation must
 * be rendered with its supporting evidence (HR-11).
 */
export function EvidenceList({
  items,
  className,
}: {
  items: readonly CopilotEvidence[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("mt-1.5 space-y-1", className)}>
      {items.map((e) => (
        <li key={e.id} className="flex items-center gap-1.5 text-[10.5px] text-slate">
          <FileText className="h-3 w-3 shrink-0 text-slate/70" />
          <span className="truncate">
            <span className="text-foreground/80">{e.label}</span>
            <span className="text-slate/70"> · {e.source}</span>
          </span>
          <ConfidenceChip tier={e.confidence} size={9} />
        </li>
      ))}
    </ul>
  );
}
