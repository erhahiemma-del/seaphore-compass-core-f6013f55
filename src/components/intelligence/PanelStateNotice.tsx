/**
 * SPRINT MIG-01 — honest panel state notice.
 *
 * Rendered instead of a number whenever a Mission Control panel has no
 * Canonical UIP projection to show. Names the operational state and the
 * capability the officer can open to inspect it.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { KPI_STATE_META, type KpiStateCode } from "@/lib/intelligence/coverage-model";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  good: "text-[color:var(--status-verified)]",
  warn: "text-[color:var(--status-review)]",
  bad: "text-[color:var(--status-critical)]",
  info: "text-[color:var(--status-active)]",
  neutral: "text-[color:var(--status-inactive)]",
};

export function PanelStateNotice({
  state,
  detail,
  href,
  hrefLabel,
}: {
  state: KpiStateCode;
  detail: string;
  href?: string;
  hrefLabel?: string;
}) {
  const meta = KPI_STATE_META[state];
  return (
    <div className="rounded-md border border-dashed border-line bg-surface-2 p-3">
      <div
        className={cn(
          "flex items-center gap-1.5 type-label",
          TONE_CLASS[meta.tone] ?? "text-slate",
        )}
      >
        <span aria-hidden>{meta.dot}</span>
        {meta.label}
      </div>
      <p className="mt-1.5 type-small text-slate">{detail}</p>
      {href ? (
        <Link
          to={href}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--color-blue)] hover:underline"
        >
          {hrefLabel ?? "Inspect capability"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
