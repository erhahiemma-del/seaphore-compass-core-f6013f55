/**
 * Shared visual primitives for the Briefing Renderer.
 * Design-token first: no hard-coded colours outside the grade map.
 */
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { gradeVisual } from "./grade-styles";
import type { ConfidenceTier, EvidenceGrade } from "./types";

export function SectionShell({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function GradeChip({ grade }: { grade: EvidenceGrade }) {
  const v = gradeVisual(grade);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${v.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} aria-hidden />
      {v.label}
    </span>
  );
}

export function TierBadge({ tier, value }: { tier: ConfidenceTier; value: number }) {
  const cls =
    tier === "high"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tier === "medium"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-red-500/15 text-red-700 dark:text-red-300";
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${cls}`}>
      Confidence: {tier} ({Math.round(value * 100)}%)
    </span>
  );
}

export function Collapsible({
  label,
  defaultOpen = false,
  tone = "default",
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  tone?: "default" | "muted";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedMotion();
  const panelId = useId();
  const containerCls =
    tone === "muted" ? "rounded-md border bg-muted/30 p-3" : "rounded-md border bg-background p-3";

  return (
    <div className={containerCls}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="content"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
