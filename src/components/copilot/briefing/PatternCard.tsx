import { Activity } from "lucide-react";
import type { PatternCardData } from "./types";

const SIG_CLASS: Record<PatternCardData["significance"], string> = {
  informational: "bg-muted text-muted-foreground",
  notable: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  material: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
};

export function PatternCard({ pattern }: { pattern: PatternCardData }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">{pattern.pattern}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SIG_CLASS[pattern.significance]}`}
        >
          {pattern.significance}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {typeof pattern.observedCount === "number" && (
          <span>Observed ×{pattern.observedCount}</span>
        )}
        {pattern.firstSeen && <span>First: {pattern.firstSeen}</span>}
        {pattern.lastSeen && <span>Last: {pattern.lastSeen}</span>}
        {pattern.caseRefs && pattern.caseRefs.length > 0 && (
          <span>Cases: {pattern.caseRefs.join(", ")}</span>
        )}
      </div>
    </div>
  );
}
