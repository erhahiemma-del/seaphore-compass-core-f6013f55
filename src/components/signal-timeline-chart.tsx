import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TimelineBucket } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

const COLORS = {
  High: "#C0392B",
  Medium: "#B06A00",
  Low: "#1E6B3A",
  Info: "#2563EB",
} as const;

export type TimelineRange = "6H" | "24H" | "7D";

const RANGE_META: Record<TimelineRange, { unit: string }> = {
  "6H": { unit: "hour" },
  "24H": { unit: "hour" },
  "7D": { unit: "day" },
};

/**
 * DET-3 stacked bar signal timeline.
 * Fully contained inside its PanelCard: fixed chart height + ResponsiveContainer.
 */
export function SignalTimelineChart({
  data,
  range,
  onRangeChange,
  className,
}: {
  data: TimelineBucket[];
  range: TimelineRange;
  onRangeChange: (r: TimelineRange) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-slate">
          <LegendSwatch color={COLORS.High} label="High" />
          <LegendSwatch color={COLORS.Medium} label="Medium" />
          <LegendSwatch color={COLORS.Low} label="Low" />
          <LegendSwatch color={COLORS.Info} label="Info" />
        </div>
        <div className="flex items-center gap-1">
          {(["6H", "24H", "7D"] as TimelineRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-semibold motion-fast",
                range === r
                  ? "bg-[color:var(--color-navy)] text-white"
                  : "text-slate hover:bg-surface-2",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
            barCategoryGap="22%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="label"
              fontSize={11}
              stroke="var(--color-slate)"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              fontSize={11}
              stroke="var(--color-slate)"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "rgba(11,31,58,0.05)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: 8,
                fontSize: 12,
                padding: "6px 10px",
              }}
              labelFormatter={(l) => `${l} · ${RANGE_META[range].unit}`}
              formatter={(value: number, name: string) => [`${value} signals`, name]}
            />
            <Bar dataKey="High" stackId="s" fill={COLORS.High} isAnimationActive animationDuration={350} />
            <Bar dataKey="Medium" stackId="s" fill={COLORS.Medium} isAnimationActive animationDuration={350} />
            <Bar dataKey="Low" stackId="s" fill={COLORS.Low} isAnimationActive animationDuration={350} />
            <Bar dataKey="Info" stackId="s" fill={COLORS.Info} radius={[3, 3, 0, 0]} isAnimationActive animationDuration={350} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      <span className="text-foreground/80">{label}</span>
    </span>
  );
}
