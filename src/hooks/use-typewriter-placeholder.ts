import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";

export interface TypewriterOptions {
  /** Phrases cycled through, in order. */
  phrases: string[];
  /** Pause the animation entirely (officer typing, dictating, submitting). */
  paused?: boolean;
  /** ms per typed character (spec: 60–80ms). */
  typeMs?: number;
  /** ms per deleted character (spec: 25–35ms). */
  deleteMs?: number;
  /** ms held on a completed phrase before deleting (spec: 1.5s). */
  holdMs?: number;
}

/**
 * Typewriter placeholder driver — Sprint UX-03.
 *
 * Presentation only: it cycles example investigation prompts so the officer
 * sees what the console accepts. It never touches the submitted query.
 *
 * Driven by requestAnimationFrame (one loop, no per-character timers) so the
 * cycle stays on the compositor budget and stops cleanly the instant the
 * officer types. Reduced-motion users get the first phrase, statically.
 */
export function useTypewriterPlaceholder({
  phrases,
  paused = false,
  typeMs = 70,
  deleteMs = 30,
  holdMs = 1500,
}: TypewriterOptions): string {
  const reduced = useReducedMotion();
  const [text, setText] = useState("");
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  useEffect(() => {
    if (paused) return;
    if (reduced || typeof window === "undefined") {
      setText(phrasesRef.current[0] ?? "");
      return;
    }

    let frame = 0;
    let phraseIndex = 0;
    let chars = 0;
    let mode: "typing" | "holding" | "deleting" = "typing";
    let last = performance.now();

    setText("");

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const list = phrasesRef.current;
      const phrase = list[phraseIndex % list.length] ?? "";
      const elapsed = now - last;

      if (mode === "typing") {
        if (elapsed < typeMs) return;
        last = now;
        chars = Math.min(phrase.length, chars + 1);
        setText(phrase.slice(0, chars));
        if (chars >= phrase.length) mode = "holding";
        return;
      }

      if (mode === "holding") {
        if (elapsed < holdMs) return;
        last = now;
        mode = "deleting";
        return;
      }

      if (elapsed < deleteMs) return;
      last = now;
      chars = Math.max(0, chars - 1);
      setText(phrase.slice(0, chars));
      if (chars === 0) {
        phraseIndex = (phraseIndex + 1) % list.length;
        mode = "typing";
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [paused, reduced, typeMs, deleteMs, holdMs]);

  return text;
}
