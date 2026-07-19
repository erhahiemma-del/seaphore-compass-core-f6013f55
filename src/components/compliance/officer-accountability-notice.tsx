import { AlertTriangle } from "lucide-react";

import { OFFICER_ACCOUNTABILITY_NOTICE } from "@/lib/compliance/rules";
import { cn } from "@/lib/utils";

/**
 * HR-4 — the Officer Decision form always makes officer accountability clear.
 * The string is hard-coded here; consumers cannot override it. Removing this
 * component from any decision form is a build defect.
 */
export function OfficerAccountabilityNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      data-testid="officer-accountability-notice"
      className={cn(
        "flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3",
        className,
      )}
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="type-label text-foreground">{OFFICER_ACCOUNTABILITY_NOTICE}</p>
    </div>
  );
}
