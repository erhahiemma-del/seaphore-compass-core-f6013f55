/**
 * SourceStatusBadge — canonical honesty chip for a Data Source Matrix entry.
 * Renders provider, status, confidence, last-updated timestamp.
 */
import type { DataSourceRow } from "@/services/data-sources.service";
import type { SourceStatus } from "@/adapters/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<SourceStatus, string> = {
  ACTIVE:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  PARTIAL:      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PLANNED:      "bg-slate-500/15 text-slate-300 border-slate-500/30",
  INFERRED:     "bg-violet-500/15 text-violet-300 border-violet-500/30",
  NOT_IN_SCOPE: "bg-zinc-700/40 text-zinc-400 border-zinc-600/40 line-through",
};

const HEALTH_STYLES = {
  OK:             "bg-emerald-500",
  DEGRADED:       "bg-amber-500",
  DOWN:           "bg-rose-500",
  UNKNOWN:        "bg-slate-500",
  NOT_APPLICABLE: "bg-zinc-600",
} as const;

export function SourceStatusBadge({
  source,
  compact = false,
  className,
}: {
  source: Pick<DataSourceRow, "id" | "provider" | "status" | "defaultConfidence" | "latestHealth">;
  compact?: boolean;
  className?: string;
}) {
  const health = source.latestHealth;
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs", className)}>
      <Badge variant="outline" className={cn("font-medium uppercase tracking-wide", STATUS_STYLES[source.status])}>
        {source.status.replace("_", " ")}
      </Badge>
      {!compact && (
        <>
          <span className="text-muted-foreground">{source.provider}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="uppercase tracking-wide text-muted-foreground">{source.defaultConfidence}</span>
        </>
      )}
      <span
        aria-label={`Health: ${health?.state ?? "UNKNOWN"}`}
        className={cn("inline-block h-2 w-2 rounded-full", HEALTH_STYLES[health?.state ?? "UNKNOWN"])}
      />
      {!compact && health?.checkedAt && (
        <span className="text-muted-foreground/70">
          checked {new Date(health.checkedAt).toLocaleString(undefined, { hour12: false })}
        </span>
      )}
    </span>
  );
}
