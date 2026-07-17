import type { SignalDomain } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

interface Row {
  domain: SignalDomain;
  High: number;
  Medium: number;
  Low: number;
}

const COL_COLOR: Record<"High" | "Medium" | "Low", string> = {
  High: "#C0392B",
  Medium: "#B06A00",
  Low: "#1E6B3A",
};

/**
 * DET-5 signal risk heatmap — domains × risk levels.
 * Cell tint is severity colour at intensity ∝ count.
 */
export function RiskHeatmap({
  rows,
  className,
}: {
  rows: Row[];
  className?: string;
}) {
  const maxByCol = {
    High: Math.max(...rows.map((r) => r.High), 1),
    Medium: Math.max(...rows.map((r) => r.Medium), 1),
    Low: Math.max(...rows.map((r) => r.Low), 1),
  };
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-1.5 text-[11px]",
        className,
      )}
    >
      <div />
      {(["High", "Medium", "Low"] as const).map((c) => (
        <div key={c} className="type-label text-center text-slate">
          {c}
        </div>
      ))}
      {rows.map((r) => (
        <RowFragment key={r.domain} row={r} maxByCol={maxByCol} />
      ))}
    </div>
  );
}

function RowFragment({
  row,
  maxByCol,
}: {
  row: Row;
  maxByCol: Record<"High" | "Medium" | "Low", number>;
}) {
  return (
    <>
      <div className="flex items-center px-2 py-2 text-[12px] font-medium text-foreground/85">
        {row.domain}
      </div>
      {(["High", "Medium", "Low"] as const).map((c) => {
        const count = row[c];
        const alpha = Math.max(0.08, Math.min(0.9, count / maxByCol[c]));
        const hex = COL_COLOR[c];
        return (
          <div
            key={c}
            className="flex items-center justify-center rounded-md py-2 font-bold"
            style={{
              backgroundColor: `${hex}${Math.round(alpha * 255)
                .toString(16)
                .padStart(2, "0")}`,
              color: alpha > 0.4 ? "#fff" : hex,
            }}
          >
            {count}
          </div>
        );
      })}
    </>
  );
}
