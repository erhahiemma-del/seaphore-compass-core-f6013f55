import type { ReactNode } from "react";

import { ConfidenceChip, type ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { cn } from "@/lib/utils";
import { assertObservedLanguage } from "@/lib/compliance/signal-language";

/**
 * HR-3 — every system-generated signal is rendered through <SignalStatement>,
 * which rejects conclusive verbs at render time. The system observes; the
 * officer concludes.
 */
export interface SignalStatementProps {
  text: string;
  tier: ConfidenceTier;
  meta?: ReactNode;
  className?: string;
  context?: string;
}

export function SignalStatement({
  text,
  tier,
  meta,
  className,
  context = "SignalStatement",
}: SignalStatementProps) {
  assertObservedLanguage(text, context);
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <ConfidenceChip tier={tier} size={9} />
      <div className="min-w-0">
        <p className="type-body text-foreground">{text}</p>
        {meta && <div className="type-small text-slate mt-0.5">{meta}</div>}
      </div>
    </div>
  );
}
