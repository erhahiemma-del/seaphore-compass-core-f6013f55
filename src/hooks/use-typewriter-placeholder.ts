import { useEffect, useState } from "react";

/**
 * Looping typewriter for placeholder-style hint text.
 *
 * Presentation only: it never touches the input value, focus, or search state.
 * Callers must render the output as decorative (aria-hidden) text and keep a
 * stable accessible label on the field itself.
 *
 * Respects `prefers-reduced-motion`: the first phrase is shown, fully typed,
 * with no animation at all.
 */
const TYPE_MS = 42;
const ERASE_MS = 22;
const HOLD_MS = 1600;
const GAP_MS = 420;

export function useTypewriterPlaceholder(phrases: string[], enabled: boolean) {
  const [text, setText] = useState("");
  const key = phrases.join("|");

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!enabled || phrases.length === 0) {
      setText("");
      return;
    }
    if (reduced) {
      setText(phrases[0]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let index = 0;

    const schedule = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const typePhrase = () => {
      const phrase = phrases[index % phrases.length];
      let chars = 0;
      const step = () => {
        chars += 1;
        setText(phrase.slice(0, chars));
        if (chars < phrase.length) schedule(step, TYPE_MS);
        else schedule(erasePhrase, HOLD_MS);
      };
      schedule(step, TYPE_MS);
    };

    const erasePhrase = () => {
      const phrase = phrases[index % phrases.length];
      let chars = phrase.length;
      const step = () => {
        chars -= 1;
        setText(phrase.slice(0, Math.max(chars, 0)));
        if (chars > 0) schedule(step, ERASE_MS);
        else {
          index += 1;
          schedule(typePhrase, GAP_MS);
        }
      };
      schedule(step, ERASE_MS);
    };

    setText("");
    schedule(typePhrase, GAP_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` stands in for the phrase list identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, reduced]);

  return text;
}
