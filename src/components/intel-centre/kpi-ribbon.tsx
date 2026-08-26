import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { ConfidenceChip, type ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { cn } from "@/lib/utils";

export interface KpiSpec {
  label: string;
  value: string;
  delta?: string; // e.g. "+3.4%" or "-₦120M"
  trend?: "up" | "down" | "flat";
  confidence: ConfidenceTier;
  series?: number[]; // for sparkline
  emphasis?: "risk" | "warn" | "ok";
}

/**
 * Reusable KPI ribbon for every Intelligence Centre.
 * MAN-1, CAR-1, REV-1 … each pass their own tiles.
 */
export function KpiRibbon({ items }: { items: KpiSpec[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
      {items.map((k) => (
        <KpiTile key={k.label} kpi={k} />
      ))}
    </div>
  );
}

function KpiTile({ kpi }: { kpi: KpiSpec }) {
  const TrendIcon = kpi.trend === "up" ? ArrowUp : kpi.trend === "down" ? ArrowDown : Minus;
  const trendColour =
    kpi.trend === "up"
      ? "text-[color:var(--color-red)]"
      : kpi.trend === "down"
        ? "text-[color:var(--color-green)]"
        : "text-slate";
  const emphColour =
    kpi.emphasis === "risk"
      ? "text-[color:var(--color-red)]"
      : kpi.emphasis === "warn"
        ? "text-[color:var(--color-amber)]"
        : kpi.emphasis === "ok"
          ? "text-[color:var(--color-green)]"
          : "text-foreground";

  return (
    <div className="group rounded-lg border border-line/60 bg-surface/60 p-2.5 shadow-[0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:bg-surface/80">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-slate">
            {kpi.label}
          </div>
          <div
            className={cn("mt-0.5 truncate text-[18px] font-semibold leading-tight", emphColour)}
          >
            {kpi.value}
          </div>
        </div>
        <ConfidenceChip tier={kpi.confidence} size={9} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {kpi.delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[10.5px] font-medium",
              trendColour,
            )}
          >
            <TrendIcon className="h-2.5 w-2.5" />
            {kpi.delta}
          </span>
        ) : (
          <span />
        )}
        {kpi.series && kpi.series.length > 1 && (
          <Sparkline data={kpi.series} trend={kpi.trend ?? "flat"} />
        )}
      </div>
    </div>
  );
}

export function Sparkline({
  data,
  trend = "flat",
  width = 60,
  height = 18,
  stroke: strokeOverride,
  opacity = 1,
}: {
  data: number[];
  trend?: "up" | "down" | "flat";
  width?: number;
  height?: number;
  /** Semantic stroke colour; falls back to the trend-derived colour. */
  stroke?: string;
  opacity?: number;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
  const stroke =
    strokeOverride ?? (trend === "up" ? "#C0392B" : trend === "down" ? "#1E6B3A" : "#5A6B7B");
  return (
    <svg width={width} height={height} opacity={opacity} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
