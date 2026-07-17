import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PanelHead — required on every intelligence panel.
 * Title (type.h1) + meta (type.small, slate) on the left.
 * Working "View center →" handoff route on the right.
 */
export interface PanelHeadProps {
  title: string;
  meta?: string;
  /** Handoff route (required per spec on intelligence panels). */
  to?: LinkProps["to"];
  toLabel?: string;
  className?: string;
}

export function PanelHead({
  title,
  meta,
  to,
  toLabel = "View center",
  className,
}: PanelHeadProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 pb-3 mb-3 border-b border-line",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="type-h1 text-foreground truncate">{title}</h2>
        {meta && <div className="type-small text-slate mt-0.5">{meta}</div>}
      </div>
      {to && (
        <Link
          to={to}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--color-blue)] hover:underline motion-fast"
        >
          {toLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
