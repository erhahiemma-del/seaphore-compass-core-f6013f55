import type { CopilotMode } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const HEX: Record<CopilotMode, string> = {
  SEARCH: "#2563EB",
  RETRIEVE: "#0E7C7B",
  INTERPRET: "#7C3AED",
  ADVISE: "#B06A00",
};

export function ModeBadge({ mode, className }: { mode: CopilotMode; className?: string }) {
  const hex = HEX[mode];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
        className,
      )}
      style={{ color: hex, backgroundColor: `${hex}18` }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
      {mode}
    </span>
  );
}
