import { cn } from "@/lib/utils";

export interface DomainFilterTab {
  key: string;
  label: string;
  count: number;
}

/**
 * DET-1 domain filter tabs — every tab shows a count.
 * Reused as domain tabs on Investigate (INV-2).
 */
export function DomainFilterTabs({
  tabs,
  active,
  onChange,
  className,
  trailing,
}: {
  tabs: DomainFilterTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border border-line bg-card px-2 py-1.5 shadow-card",
        className,
      )}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold motion-fast",
              isActive
                ? "bg-[color:var(--color-navy)] text-white shadow-card"
                : "text-foreground/75 hover:bg-surface-2",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold",
                isActive
                  ? "bg-white/15 text-white"
                  : "bg-surface-2 text-slate",
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  );
}
