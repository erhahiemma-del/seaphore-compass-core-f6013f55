import { cn } from "@/lib/utils";

/**
 * Risk Pill — names a condition, never a verdict.
 * Colour + label always render together.
 */
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

const HEX: Record<RiskLevel, string> = {
  HIGH: "#C0392B",
  MEDIUM: "#B06A00",
  LOW: "#1E6B3A",
};

export interface RiskPillProps {
  level: RiskLevel;
  className?: string;
}

export function RiskPill({ level, className }: RiskPillProps) {
  const hex = HEX[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em]",
        className,
      )}
      style={{ color: hex, backgroundColor: `${hex}14` }}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: hex }}
      />
      {level}
    </span>
  );
}
