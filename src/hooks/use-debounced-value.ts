/**
 * Debounced value + cancelable debounced callback hooks.
 *
 * Used across searchable dropdowns and comboboxes so rapid keystrokes do not
 * fan out to per-character DB queries and cannot deliver stale results after
 * the user has typed further (each new keystroke cancels the pending call and
 * unmount cancels any in-flight timer).
 */
import * as React from "react";

/** Returns `value` after it has been stable for `delayMs`. Canceled on unmount. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Stable debounced callback. New calls cancel prior pending calls; unmount
 * cancels any pending call. Callback identity is stable so it is safe to
 * pass to `onChange` without re-subscribing.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs = 250,
): ((...args: TArgs) => void) & { cancel: () => void; flush: () => void } {
  const fnRef = React.useRef(fn);
  const timerRef = React.useRef<number | null>(null);
  const lastArgsRef = React.useRef<TArgs | null>(null);

  React.useEffect(() => { fnRef.current = fn; }, [fn]);

  const cancel = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastArgsRef.current = null;
  }, []);

  const flush = React.useCallback(() => {
    if (timerRef.current !== null && lastArgsRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      const args = lastArgsRef.current;
      lastArgsRef.current = null;
      fnRef.current(...args);
    }
  }, []);

  React.useEffect(() => cancel, [cancel]);

  const debounced = React.useMemo(() => {
    const call = ((...args: TArgs) => {
      lastArgsRef.current = args;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const a = lastArgsRef.current;
        lastArgsRef.current = null;
        if (a) fnRef.current(...a);
      }, delayMs);
    }) as ((...args: TArgs) => void) & { cancel: () => void; flush: () => void };
    call.cancel = cancel;
    call.flush = flush;
    return call;
  }, [delayMs, cancel, flush]);

  return debounced;
}
