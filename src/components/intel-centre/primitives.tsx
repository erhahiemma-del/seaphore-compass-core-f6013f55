import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section container used inside every centre's main workspace. */
export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-line/60 bg-surface/60 p-3", className)}>
      {(title || actions) && (
        <header className="mb-2 flex items-center justify-between gap-2">
          {title && (
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
              {title}
            </h3>
          )}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** Compact status pills reused across centres. */
export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "risk" | "warn" | "ok" | "info" | "neutral";
}) {
  const toneClass = {
    risk: "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]",
    warn: "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]",
    ok: "bg-[color:var(--color-green)]/15 text-[color:var(--color-green)]",
    info: "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]",
    neutral: "bg-slate/15 text-slate",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        toneClass,
      )}
    >
      {label}
    </span>
  );
}

/** Simple dense data table for centres. */
export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyLabel = "No records.",
  compact = false,
}: {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  emptyLabel?: string;
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-line/60 bg-surface/40 p-6 text-center text-[12px] text-slate">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-line/60">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-surface-2/40 text-[10.5px] uppercase tracking-[0.06em] text-slate">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "border-b border-line/60 px-2.5 py-2 font-semibold",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.align === "left" && "text-left",
                    !c.align && "text-left",
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={rowKey(r, i)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn(
                  "border-b border-line/40 last:border-b-0 hover:bg-surface-2/30",
                  onRowClick && "cursor-pointer",
                  compact ? "[&>td]:py-1.5" : "[&>td]:py-2",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-2.5 text-foreground/90",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                    )}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Horizontal scrollable timeline strip used by MAN-4, CAR-6, REV-9. */
export interface TimelineItem {
  id: string;
  time: string; // e.g. "09:20 UTC"
  title: string;
  subtitle?: string;
  tone: "risk" | "warn" | "ok" | "info";
}

export function TimelineStrip({
  items,
  selectedId,
  onSelect,
}: {
  items: TimelineItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const toneColour = (t: TimelineItem["tone"]) =>
    t === "risk" ? "#C0392B" : t === "warn" ? "#B06A00" : t === "ok" ? "#1E6B3A" : "#2563EB";
  return (
    <div className="relative">
      <div className="scrollbar-thin flex items-stretch gap-3 overflow-x-auto py-2">
        {items.map((it) => {
          const active = it.id === selectedId;
          return (
            <button
              key={it.id}
              onClick={() => onSelect?.(it.id)}
              className={cn(
                "relative min-w-[180px] shrink-0 rounded-md border p-2.5 text-left transition-colors",
                active
                  ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]/10"
                  : "border-line/60 bg-surface/50 hover:bg-surface/70",
              )}
            >
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: toneColour(it.tone) }}
                />
                {it.time}
              </div>
              <div className="mt-1 truncate text-[12.5px] font-semibold text-foreground">
                {it.title}
              </div>
              {it.subtitle && <div className="truncate text-[11px] text-slate">{it.subtitle}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
