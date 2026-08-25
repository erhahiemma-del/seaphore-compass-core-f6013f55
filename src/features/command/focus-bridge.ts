/**
 * Search result → focus subject.
 *
 * The convergence point the phase asks for: a vessel found by typing its
 * IMO and a vessel clicked on the map become the same focus subject, in
 * the same store, understood by Mission Control, the Copilot, the
 * workspace and the dedicated modules alike.
 *
 * Partial on purpose, exactly like the map bridge. The entity registry
 * knows thirteen kinds and focus knows nine, and they are not a subset of
 * each other. `container`, `person`, `document`, `agency`, `signal`,
 * `regulation` and `intelligence_report` have no focus kind, so selecting
 * one navigates to its profile instead of coercing it into a subject
 * nothing downstream could resolve. A `container` is not `cargo` and a
 * `person` is not a `company`.
 */
import type { FocusSubject } from "@/stores/focus-subject.store";

import type { CommandResult } from "./results";

/** Entity kinds with an exact focus equivalent. Only exact ones. */
const ENTITY_TO_FOCUS: Readonly<Record<string, FocusSubject["kind"]>> = {
  vessel: "vessel",
  port: "port",
  company: "company",
  voyage: "voyage",
  manifest: "manifest",
  cargo_item: "cargo",
};

/** True when selecting this result should establish focus. */
export function isFocusable(kind: string): boolean {
  return kind in ENTITY_TO_FOCUS;
}

/**
 * Build a focus subject from a result, or null when the kind has none.
 *
 * The descriptor carries only what the row actually held. An entity with
 * no recorded source gets no descriptor rather than an invented one.
 */
export function focusSubjectFromResult(result: CommandResult): FocusSubject | null {
  const kind = ENTITY_TO_FOCUS[result.kind];
  if (!kind) return null;
  return {
    kind,
    id: result.id,
    title: result.title,
    descriptor: result.source ?? undefined,
  };
}
