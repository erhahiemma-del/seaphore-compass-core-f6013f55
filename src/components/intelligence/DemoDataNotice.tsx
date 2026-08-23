/**
 * Marks a surface whose content is simulated.
 *
 * Deliberately a banner rather than a per-row badge. An officer scanning
 * a list of investigations reads the rows, not the chrome on each one —
 * the claim that matters ("none of this is real") has to sit where the
 * eye lands first, and it has to be true of everything below it.
 *
 * Restrained on purpose. This is not an error, and styling it as one
 * would train officers to dismiss it.
 */
import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

export function DemoDataNotice({ surface, className }: { surface: string; className?: string }) {
  return (
    <div
      role="note"
      data-testid="demo-data-notice"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-400/60 bg-amber-500/10 px-3 py-2",
        className,
      )}
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-800">
        Simulated
      </span>
      <span className="text-[11.5px] leading-relaxed text-amber-900/90">
        {surface} shows demonstration fixtures, not observations. No provider is connected, vessel
        identities are prefixed <span className="font-mono">DEMO-</span>, and nothing here should be
        acted on.
      </span>
    </div>
  );
}
