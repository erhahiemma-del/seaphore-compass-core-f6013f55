import { useEffect, useRef } from "react";
import { startTrace } from "./monitor";

/**
 * Trace every render of a component. Measures the commit-to-effect gap,
 * which correlates with paint cost for the subtree. Cheap enough for
 * dashboards; skip inside tight lists.
 */
export function useRenderTrace(name: string, meta?: Record<string, unknown>) {
  const endRef = useRef<((extra?: Record<string, unknown>) => void) | null>(null);
  // Called during render — starts before commit.
  endRef.current = startTrace(name, meta);
  useEffect(() => {
    endRef.current?.();
    endRef.current = null;
  });
}

/**
 * Trace a burst of rapid events (pan drag, wheel zoom) as one aggregate
 * trace ending 80ms after the last event, so idle time between drags
 * does not count against the budget.
 */
export function createBurstTracer(name: string, idleMs = 80) {
  let end: ((extra?: Record<string, unknown>) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frames = 0;
  return {
    tick(meta?: Record<string, unknown>) {
      if (!end) {
        frames = 0;
        end = startTrace(name, meta);
      }
      frames++;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        end?.({ frames });
        end = null;
        timer = null;
      }, idleMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      end?.({ frames });
      end = null;
      timer = null;
    },
  };
}
