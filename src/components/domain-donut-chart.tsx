import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { DomainSlice } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#0E7C7B",
  "#2563EB",
  "#B06A00",
  "#7C3AED",
  "#C0392B",
  "#1E6B3A",
  "#0B1F3A",
  "#5A6B7B",
];

/**
 * DET-4 signals-by-domain donut with legend.
 */
export function DomainDonutChart({
  data,
  className,
}: {
  data: DomainSlice[];
  className?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]", className)}>
      <div className="min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number, _n, p) => [
                `${v} · ${((v / total) * 100).toFixed(0)}%`,
                p?.payload?.domain,
              ]}
            />
            <Pie
              data={data}
              dataKey="count"
              nameKey="domain"
              innerRadius="55%"
              outerRadius="85%"
              stroke="var(--color-surface)"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 pr-1 text-[11px]">
        {data.map((d, i) => {
          const pct = ((d.count / total) * 100).toFixed(0);
          return (
            <li key={d.domain} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground/80">
                {d.domain}
              </span>
              <span className="font-semibold text-foreground">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
