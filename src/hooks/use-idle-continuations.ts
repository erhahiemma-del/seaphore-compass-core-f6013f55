/**
 * use-idle-continuations — fires ~1.5s after the officer stops typing.
 *
 * Purely presentational: it decides *when* faint continuation hints may show,
 * never what the pipeline receives. Any keystroke hides them again, so the
 * hints can never fight the officer's editing.
 */

import { useEffect, useState } from "react";
import { continuationsFor } from "@/lib/copilot/continuations";

export interface IdleContinuationsOptions {
  /** Current input text. */
  value: string;
  /** Suppress while dictating, submitting, or when the box is disabled. */
  paused?: boolean;
  /** Idle delay in ms before the ghost row appears. */
  delay?: number;
}

export function useIdleContinuations({
  value,
  paused,
  delay = 1500,
}: IdleContinuationsOptions): string[] {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(false);
    if (paused || value.trim().length < 4) return;
    const id = window.setTimeout(() => setArmed(true), delay);
    return () => window.clearTimeout(id);
  }, [value, paused, delay]);

  if (!armed || paused) return [];
  return continuationsFor(value);
}
