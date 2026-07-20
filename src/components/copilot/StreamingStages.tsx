import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Reasoning-stage strip. Purely visual — Sprint 2 has no LLM behind it.
 * Cycles Classifying → Retrieving → Reasoning → Rendering and freezes on
 * the final stage until unmounted or reset via the `key` prop.
 */
export const STAGES = [
  { key: "classifying", label: "Classifying" },
  { key: "retrieving", label: "Retrieving" },
  { key: "reasoning", label: "Reasoning" },
  { key: "rendering", label: "Rendering" },
] as const;

export type CopilotStage = (typeof STAGES)[number]["key"];

export interface StreamingStagesProps {
  /** Stage index override — supply to drive from real backend events. */
  activeIndex?: number;
  /** ms between stage advances when animating internally. */
  interval?: number;
  className?: string;
}

export function StreamingStages({
  activeIndex,
  interval = 900,
  className,
}: StreamingStagesProps) {
  const reduced = useReducedMotion();
  const controlled = typeof activeIndex === "number";
  const [internal, setInternal] = useState<number>(controlled ? activeIndex! : 0);

  useEffect(() => {
    if (controlled) {
      setInternal(activeIndex!);
      return;
    }
    if (reduced) {
      setInternal(STAGES.length - 1);
      return;
    }
    let i = 0;
    setInternal(0);
    const id = window.setInterval(() => {
      i += 1;
      if (i >= STAGES.length) {
        window.clearInterval(id);
        setInternal(STAGES.length - 1);
        return;
      }
      setInternal(i);
    }, interval);
    return () => window.clearInterval(id);
  }, [controlled, activeIndex, interval, reduced]);

  return (
    <ol
      aria-label="Copilot reasoning progress"
      className={cn("flex flex-col gap-2 p-4", className)}
    >
      {STAGES.map((stage, i) => {
        const state = i < internal ? "done" : i === internal ? "active" : "pending";
        return (
          <li
            key={stage.key}
            aria-current={state === "active" ? "step" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2 text-[13px] transition-colors",
              state === "done" && "border-primary/40 bg-primary/5 text-foreground",
              state === "active" &&
                "border-primary/60 bg-primary/10 text-foreground shadow-sm",
              state === "pending" && "border-border/60 bg-muted/30 text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                state === "done" && "bg-primary text-primary-foreground",
                state === "active" && "bg-primary/20 text-primary",
                state === "pending" && "bg-muted text-muted-foreground",
              )}
            >
              {state === "done" ? (
                <Check className="h-3 w-3" />
              ) : state === "active" ? (
                <Loader2
                  className={cn("h-3 w-3", !reduced && "animate-spin")}
                />
              ) : (
                <span className="text-[10px] font-semibold">{i + 1}</span>
              )}
            </span>
            <span className="font-medium">{stage.label}</span>
            {state === "active" ? (
              <span className="sr-only">in progress</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
