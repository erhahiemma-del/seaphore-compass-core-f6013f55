import { useEffect, useState } from "react";

/**
 * One-shot read of the reduced-motion preference.
 *
 * For imperative code that cannot call a hook — a store subscription, an
 * event handler, a renderer callback. Prefer `useReducedMotion` inside
 * components, which re-renders when the preference changes.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Reports whether the user has requested reduced motion. Streaming and
 * modal animations must honor this — respects the a11y gate in the
 * Sprint 2 architecture review.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}
