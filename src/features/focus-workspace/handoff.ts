/**
 * Level 3 — handing off to the dedicated modules.
 *
 * The Focus Workspace is a bridge, not a destination. Everything real
 * happens in a module that already exists, so this decides *where* an
 * action leads and nothing about what happens when it gets there.
 *
 * ## Intent, not route strings
 *
 * These return a discriminated intent rather than a `to`/`params` pair.
 * The router's literal route types only typecheck at the call site, so
 * keeping the strings in the host means a route that is renamed or
 * deleted fails the build instead of producing a link that 404s at
 * runtime. It also keeps this module testable without a router.
 *
 * ## A missing module is reported, never faked
 *
 * Not every focus kind has a dedicated module. Incidents and risk events
 * are selectable on the map and have no route of their own, so
 * `dedicatedDestination` returns null for them and the action is
 * disabled with a reason. Sending them to a plausible-looking neighbour
 * — a risk event to the compliance page, say — would be a link that
 * appears to work and quietly shows the officer something else.
 */
import type { FocusSubject, FocusSubjectKind } from "@/stores/focus-subject.store";

import type { FocusActionId, FocusWork } from "./model";

/**
 * Where an action leads.
 *
 * Each variant names an existing route:
 *   entity             /entity/$id
 *   investigation      /investigate/$id
 *   new-investigation  /investigate
 *   manifest           /manifest
 *   evidence           /evidence
 *   copilot            /copilot
 */
export type FocusDestination =
  | { readonly kind: "entity"; readonly id: string }
  | { readonly kind: "investigation"; readonly id: string }
  | { readonly kind: "new-investigation" }
  | { readonly kind: "manifest" }
  | { readonly kind: "evidence" }
  | { readonly kind: "copilot" };

/**
 * Focus kinds whose full workspace is the canonical entity profile.
 *
 * The same set the IAL can build a canonical id for, and not a
 * coincidence: `/entity/$id` is keyed by canonical id, so a kind without
 * one has nothing to open. EntityProfile handles a miss explicitly
 * (`found: false`), so a canonical id that is not yet in the graph gives
 * the officer an honest empty profile rather than a broken page.
 */
const ENTITY_PROFILE_KINDS: ReadonlySet<FocusSubjectKind> = new Set<FocusSubjectKind>([
  "vessel",
  "port",
  "cargo",
  "company",
  "voyage",
]);

/**
 * The dedicated module for a subject, or null when it has none.
 *
 * `canonicalId` is required for the entity-profile kinds because that
 * route is keyed by canonical id; passing the raw id would open a
 * different entity or none at all.
 */
export function dedicatedDestination(
  subject: FocusSubject,
  canonicalId: string | null,
): FocusDestination | null {
  if (ENTITY_PROFILE_KINDS.has(subject.kind)) {
    return canonicalId ? { kind: "entity", id: canonicalId } : null;
  }
  if (subject.kind === "manifest") return { kind: "manifest" };
  // An investigation subject *is* the case, so its id is the route param.
  if (subject.kind === "investigation") return { kind: "investigation", id: subject.id };
  // incident and risk-event have no dedicated module. Reported as such.
  return null;
}

/** True when this subject has a dedicated module to open. */
export function hasDedicatedModule(subject: FocusSubject, canonicalId: string | null): boolean {
  return dedicatedDestination(subject, canonicalId) !== null;
}

/**
 * Resolve an action to a destination.
 *
 * Returns null for the two actions that never navigate — `work-here`
 * keeps the officer in the drawer, and `dismiss` closes it — and for any
 * action whose module does not exist.
 */
export function focusDestination(
  action: FocusActionId,
  subject: FocusSubject,
  canonicalId: string | null,
  work: FocusWork | null,
): FocusDestination | null {
  switch (action) {
    case "open-full-workspace":
      return dedicatedDestination(subject, canonicalId);
    case "investigate":
      // Opening a case is the investigation module's job, including
      // deciding what a new case needs. This only takes the officer there.
      return { kind: "new-investigation" };
    case "continue-workflow":
      return work ? { kind: "investigation", id: work.caseId } : null;
    case "view-evidence":
      return { kind: "evidence" };
    case "ask-seaphore":
      return { kind: "copilot" };
    case "work-here":
    case "dismiss":
      return null;
  }
}
