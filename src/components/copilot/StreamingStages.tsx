import { useEffect, useState } from "react";
import { Check, Loader2, Square } from "lucide-react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Reasoning-stage strip — the officer's visibility into what the pipeline is
 * doing between submit and the Adaptive Briefing appearing.
 *
 * Presentation only: it reports the stage it is given, plus elapsed time. It
 * never claims progress the pipeline has not reported.
 */
export const STAGES = [
  {
    key: "classifying",
    label: "Classifying",
    detail: "Reading the query and determining the mission type",
  },
  {
    key: "retrieving",
    label: "Retrieving",
    detail: "Acquiring evidence from the intelligence providers",
  },
  {
    key: "reasoning",
    label: "Reasoning",
    detail: "Fusing evidence and testing hypotheses",
  },
  {
    key: "rendering",
    label: "Rendering",
    detail: "Composing the Adaptive Briefing for your review",
  },
] as const;

export type CopilotStage = (typeof STAGES)[number]["key"];

export interface StreamingStagesProps {
  /** Stage index override — supply to drive from real backend events. */
  activeIndex?: number;
  /** ms between stage advances when animating internally. */
  interval?: number;
  /** Epoch ms the run started; drives the elapsed-time readout. */
  startedAt?: number;
  /**
   * When supplied, a Stop control is shown so the officer can abandon a run
   * that is taking too long. The officer stays in control of the pipeline.
   */
  onCancel?: () => void;
  className?: string;
}

function useElapsedSeconds(startedAt?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function StreamingStages({
  activeIndex,
  interval = 900,
  startedAt,
  onCancel,
  className,
}: StreamingStagesProps) {
  const reduced = useReducedMotion();
  const controlled = typeof activeIndex === "number";
  const [internal, setInternal] = useState<number>(controlled ? activeIndex! : 0);
  const elapsed = useElapsedSeconds(startedAt);

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

  const current = STAGES[Math.min(internal, STAGES.length - 1)]!;
  const pct = Math.round(((internal + 1) / STAGES.length) * 100);

  return (
    <div className={cn("flex flex-col gap-3 p-4", className)} data-testid="streaming-stages">
      {/* Headline: one sentence the officer can read at a glance. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Loader2 className={cn("h-3.5 w-3.5 text-primary", !reduced && "animate-spin")} />
          {current.label} — {current.detail}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Step {internal + 1} of {STAGES.length}
            {startedAt ? ` · ${elapsed}s` : ""}
          </span>
          {onCancel ? (
            <button
              type="button"
              data-testid="cancel-run"
              onClick={onCancel}
              title="Stop building this briefing"
              className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              Stop
            </button>
          ) : null}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Building your Adaptive Briefing"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${current.label}, step ${internal + 1} of ${STAGES.length}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol aria-label="Copilot reasoning progress" className="flex flex-col gap-2">
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
                  <Loader2 className={cn("h-3 w-3", !reduced && "animate-spin")} />
                ) : (
                  <span className="text-[10px] font-semibold">{i + 1}</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{stage.label}</span>
                <span className="ml-2 text-[11.5px] text-muted-foreground">{stage.detail}</span>
              </span>
              {state === "active" ? <span className="sr-only">in progress</span> : null}
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="text-[11px] text-muted-foreground">
        {current.label === "Rendering"
          ? "Almost there — the Adaptive Briefing appears next."
          : "The Adaptive Briefing appears as soon as evidence and reasoning complete."}
      </p>
    </div>
  );
}
