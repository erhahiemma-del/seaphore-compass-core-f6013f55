import type { ReactNode } from "react";

import {
  ConfidenceChip,
  type ConfidenceTier,
} from "@/components/confidence-chip";
import { cn } from "@/lib/utils";
import { assertVerifiedSource } from "@/lib/compliance/authoritative-sources";

/**
 * HR-1 — every figure, count, aggregate, status, or claim renders through
 * <Metric>. TypeScript refuses to compile a <Metric> without `tier`, and
 * `tier="verified"` refuses to run without an authoritative `source`.
 *
 * A bare number is a build defect — never render a figure any other way.
 */
export interface MetricProps {
  label?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  tier: ConfidenceTier;
  /** Required when tier === "verified" (HR-2). Must be an id registered in authoritative-sources.ts. */
  source?: string;
  /** Optional secondary caption (e.g. "vs. last 7d"). */
  caption?: ReactNode;
  className?: string;
  /** For diagnostics on validation errors. */
  context?: string;
}

export function Metric({
  label,
  value,
  unit,
  tier,
  source,
  caption,
  className,
  context = "Metric",
}: MetricProps) {
  assertVerifiedSource(tier, source, context);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label != null && (
        <span className="type-label text-slate">{label}</span>
      )}
      <div className="flex items-baseline gap-2">
        <span className="type-h1 font-mono tabular-nums">{value}</span>
        {unit != null && <span className="type-small text-slate">{unit}</span>}
      </div>
      <div className="flex items-center gap-2">
        <ConfidenceChip tier={tier} />
        {caption != null && (
          <span className="type-small text-slate">{caption}</span>
        )}
      </div>
    </div>
  );
}
