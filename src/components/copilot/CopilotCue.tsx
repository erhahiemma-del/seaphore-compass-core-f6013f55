/**
 * CopilotCue — Sprint UX-04. PRESENTATION ONLY.
 *
 * A small Copilot avatar seated in the lower-left of the investigation input.
 * Its only job is to make the AI feel present and to invite typing; it owns no
 * intelligence, reads no evidence and makes no claims. Every animation is CSS
 * and collapses under prefers-reduced-motion.
 */
import { useEffect, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const NUDGES = ["Ask anything.", "Start typing...", "I'll understand.", "No category required."];

export interface CopilotCueProps {
  /** Attract behaviour runs only while the officer has typed nothing. */
  idle: boolean;
}

export function CopilotCue({ idle }: CopilotCueProps) {
  const reduced = useReducedMotion();
  const [nudge, setNudge] = useState(0);
  const [glancing, setGlancing] = useState(false);

  // Rotate the speech bubble and glance toward the caret on the same 8s beat.
  useEffect(() => {
    if (!idle || reduced) return;
    const id = window.setInterval(() => {
      setNudge((n) => (n + 1) % NUDGES.length);
      setGlancing(true);
      window.setTimeout(() => setGlancing(false), 1400);
    }, 8000);
    return () => window.clearInterval(id);
  }, [idle, reduced]);

  return (
    <span
      data-testid="copilot-cue"
      aria-hidden
      className="pointer-events-none relative flex select-none items-center pb-1"
    >
      <span
        className={cn(
          "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          "bg-[color:var(--color-teal)]/12 text-[color:var(--color-teal)]",
          idle && "copilot-float",
        )}
      >
        {idle ? (
          <span className="copilot-halo absolute inset-0 rounded-full ring-1 ring-[color:var(--color-teal)]/40" />
        ) : null}
        {/* Minimal face: two eyes that blink, on a hull-shaped head. */}
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <path
            d="M5 8.5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5v-4Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <g className={cn(idle && "copilot-blink")}>
            <circle cx="10" cy="11" r="1.15" fill="currentColor" />
            <circle cx="14" cy="11" r="1.15" fill="currentColor" />
          </g>
        </svg>
      </span>

      {idle ? (
        <span
          key={nudge}
          data-testid="copilot-nudge"
          className="animate-in fade-in slide-in-from-bottom-1 absolute -top-[52px] left-0 z-10 flex w-max whitespace-nowrap items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-medium tracking-tight text-muted-foreground shadow-sm duration-500"
        >
          {NUDGES[nudge]}
          <span
            className={cn(
              "text-[color:var(--color-teal)] transition-opacity duration-300",
              glancing && !reduced ? "copilot-point opacity-100" : "opacity-0",
            )}
          >
            ↑
          </span>
        </span>
      ) : null}
    </span>
  );
}
