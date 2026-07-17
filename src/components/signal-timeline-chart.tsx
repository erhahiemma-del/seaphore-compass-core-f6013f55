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

/**
 * DET-3 stacked bar signal timeline.
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
    <div className={cn("flex h-full flex-col", className)}>
      <div className="mb-2 flex items-center gap-1">
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
      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="label" fontSize={11} stroke="var(--color-slate)" tickLine={false} axisLine={false} />
            <YAxis fontSize={11} stroke="var(--color-slate)" tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(11,31,58,0.05)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
            <Bar dataKey="High" stackId="s" fill={COLORS.High} />
            <Bar dataKey="Medium" stackId="s" fill={COLORS.Medium} />
            <Bar dataKey="Low" stackId="s" fill={COLORS.Low} />
            <Bar dataKey="Info" stackId="s" fill={COLORS.Info} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
