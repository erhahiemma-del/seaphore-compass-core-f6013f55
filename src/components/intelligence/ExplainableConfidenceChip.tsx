/**
 * ExplainableConfidenceChip
 *
 * Wraps the mandatory OC-001 ConfidenceChip in a hover/click popover that
 * projects the officer-facing explanation produced by
 * `useConfidenceExplainer`. Every recommendation, KPI, or aggregate that
 * needs to justify its confidence uses this component instead of the raw
 * chip.
 *
 * Golden Rule: the confidence value is never presented without its reason.
 */
import { CheckCircle2, Info, MinusCircle, XCircle } from "lucide-react";
import { ConfidenceChip, type ConfidenceChipProps } from "./ConfidenceChip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  useConfidenceExplainer,
  type ConfidenceExplainerInput,
  type ConfidenceFactor,
} from "@/hooks/use-confidence-explainer";
import { cn } from "@/lib/utils";

export interface ExplainableConfidenceChipProps
  extends ConfidenceExplainerInput,
    Pick<ConfidenceChipProps, "size" | "className"> {
  /** Optional heading displayed inside the popover. */
  heading?: string;
}

const TONE_ICON: Record<ConfidenceFactor["tone"], JSX.Element> = {
  supporting: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  detracting: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  neutral: <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />,
};

export function ExplainableConfidenceChip({
  confidenceBadge,
  supporting,
  discarded,
  compositeConfidence,
  heading = "Why this confidence",
  size,
  className,
}: ExplainableConfidenceChipProps) {
  const explanation = useConfidenceExplainer({
    confidenceBadge,
    supporting,
    discarded,
    compositeConfidence,
  });

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            className,
          )}
          aria-label={`Confidence ${explanation.level}. ${explanation.summary}`}
          title={explanation.summary}
        >
          <ConfidenceChip level={explanation.level} size={size} />
          <Info className="h-3 w-3 text-muted-foreground/70" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        side="top"
        className="w-80 space-y-2 p-3 text-[12px]"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {heading}
          </p>
          <ConfidenceChip level={explanation.level} size="sm" />
        </div>
        <p className="text-foreground/90 leading-relaxed">{explanation.summary}</p>
        {explanation.factors.length > 0 && (
          <ul className="space-y-1.5 border-t border-border/60 pt-2">
            {explanation.factors.map((f) => (
              <li key={f.key} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{TONE_ICON[f.tone]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">
                    {f.label}
                  </span>
                  {f.detail && (
                    <span className="block text-[11px] text-muted-foreground">
                      {f.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
