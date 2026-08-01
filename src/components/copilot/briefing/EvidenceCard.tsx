import { CalendarClock, FileText } from "lucide-react";
import { gradeVisual } from "./grade-styles";
import { GradeChip } from "./primitives";
import type { EvidenceCardData } from "./types";

interface Props {
  evidence: EvidenceCardData;
  onOpen?: (evidence: EvidenceCardData) => void;
}

/** Layer 2.9 evidence card — grade-graded left border. */
export function EvidenceCard({ evidence, onOpen }: Props) {
  const v = gradeVisual(evidence.grade);
  const Wrapper = onOpen ? "button" : "div";
  return (
    <Wrapper
      type={onOpen ? "button" : undefined}
      onClick={onOpen ? () => onOpen(evidence) : undefined}
      aria-label={`Evidence: ${evidence.title}`}
      className={`group flex w-full flex-col gap-2 rounded-md border border-l-4 bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${v.border} ${
        onOpen ? "hover:bg-muted/40" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <GradeChip grade={evidence.grade} />
        {evidence.observedAt && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" aria-hidden />
            {evidence.observedAt}
          </span>
        )}
      </div>
      <p className="text-sm font-medium leading-snug text-foreground">{evidence.title}</p>
      {evidence.summary && <p className="text-xs text-muted-foreground">{evidence.summary}</p>}
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" aria-hidden />
          {evidence.source}
        </span>
        {evidence.hash && (
          <code className="truncate font-mono">sha256:{evidence.hash.slice(0, 10)}…</code>
        )}
      </div>
    </Wrapper>
  );
}
