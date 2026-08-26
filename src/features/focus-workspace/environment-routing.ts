/**
 * Focused subject → the environment that owns the work.
 *
 * The map answers "what is happening where". The environments answer
 * "what do I need to do about it". This is the single place that decides
 * which environment a subject belongs to, so the map stays a discovery
 * surface and never grows a second copy of Vessel Intelligence or Port
 * Operations inside itself.
 *
 * ## Why this is separate from `dedicatedDestination`
 *
 * They answer different questions and both are needed.
 * {@link dedicatedDestination} opens *this entity's record* — the
 * canonical profile at `/entity/$id`, keyed by canonical id. This opens
 * *the environment for entities of this kind*. An officer looking at a
 * vessel may want either: the vessel's own file, or the vessel operations
 * workspace. Collapsing the two would silently take away one of them.
 *
 * ## A declarative table, because the destinations are going to move
 *
 * Company routes to the generic entity profile today because no Company
 * Intelligence environment exists yet. That is recorded here as an
 * interim destination rather than left implicit, so when the environment
 * is built the change is one row in this table and every caller follows.
 * The same applies to organisation and workforce entities, which have no
 * destination at all.
 *
 * ## Absence is reported, never approximated
 *
 * Incidents and risk events are selectable and focusable, and have no
 * environment of their own. They return null and the calling surface
 * disables the action with a reason. Sending a risk event to Compliance
 * because it looks close enough would be a link that appears to work and
 * shows the officer a different thing entirely — the failure this
 * codebase treats as worse than a disabled button.
 */
import type { FocusSubject, FocusSubjectKind } from "@/stores/focus-subject.store";

/**
 * An environment an officer can be taken to.
 *
 * Named routes rather than path strings: the router only typechecks
 * literals at the call site, so keeping the strings in the host means a
 * renamed route fails the build instead of 404ing at runtime. The same
 * reason `handoff.ts` returns intent.
 *
 *   vessel-operations   /vessel
 *   port-operations     /ports
 *   manifests-cargo     /manifest
 *   investigation       /investigate/$id
 *   entity-profile      /entity/$id  — the canonical record
 */
export type EnvironmentDestination =
  | { readonly kind: "vessel-operations" }
  | { readonly kind: "port-operations" }
  | { readonly kind: "manifests-cargo" }
  | { readonly kind: "investigation"; readonly id: string }
  | { readonly kind: "entity-profile"; readonly id: string };

/**
 * Why a subject has no environment, in words an officer can act on.
 *
 * Distinct reasons, deliberately. "No environment exists for this kind"
 * and "this entity has no canonical record to open" are different
 * problems with different fixes, and collapsing them would tell an
 * officer to wait for a feature when the real issue is an unresolved id.
 */
export type EnvironmentUnavailableReason =
  | "no-environment-yet"
  | "no-canonical-record"
  | "not-an-environment-subject";

export interface EnvironmentRoute {
  readonly destination: EnvironmentDestination | null;
  readonly reason: EnvironmentUnavailableReason | null;
  /**
   * True when the destination is a stand-in for an environment that has
   * not been built. The officer still gets somewhere useful; the product
   * still owes them the real thing.
   */
  readonly interim: boolean;
}

const AVAILABLE = (destination: EnvironmentDestination, interim = false): EnvironmentRoute => ({
  destination,
  reason: null,
  interim,
});

const UNAVAILABLE = (reason: EnvironmentUnavailableReason): EnvironmentRoute => ({
  destination: null,
  reason,
  interim: false,
});

/**
 * The environment for a focused subject.
 *
 * `canonicalId` is required only by destinations keyed on it. A kind that
 * needs one and has none is `no-canonical-record`, not a silent fallback
 * to the environment's index — that would open a list and let the officer
 * believe they were looking at their entity.
 */
export function environmentRoute(
  subject: FocusSubject,
  canonicalId: string | null,
): EnvironmentRoute {
  switch (subject.kind) {
    case "vessel":
      return AVAILABLE({ kind: "vessel-operations" });

    case "voyage":
      // Voyages live inside Vessel & Voyage Operations — the navigation
      // model names it so, and there is no separate voyage environment.
      return AVAILABLE({ kind: "vessel-operations" });

    case "port":
      return AVAILABLE({ kind: "port-operations" });

    case "cargo":
    case "manifest":
      return AVAILABLE({ kind: "manifests-cargo" });

    case "investigation":
      // An investigation subject *is* the case, so its id is the param.
      return AVAILABLE({ kind: "investigation", id: subject.id });

    case "company":
      /*
       * Interim, and marked as such.
       *
       * No Company Intelligence environment exists. The canonical profile
       * is a real destination that shows a real company record, so it is
       * an honest place to land — but it is not the environment this
       * subject will eventually own, and pretending otherwise would hide
       * the gap. When Company Intelligence is built, this row changes.
       */
      return canonicalId
        ? AVAILABLE({ kind: "entity-profile", id: canonicalId }, true)
        : UNAVAILABLE("no-canonical-record");

    case "incident":
    case "risk-event":
      /*
       * Selectable on the map, focusable, and with no environment. Both
       * are reported rather than pointed at a neighbour: an incident is
       * not an investigation until an officer opens one.
       */
      return UNAVAILABLE("no-environment-yet");
  }
}

/** True when this subject has an environment to open. */
export function hasEnvironment(subject: FocusSubject, canonicalId: string | null): boolean {
  return environmentRoute(subject, canonicalId).destination !== null;
}

/**
 * What to tell the officer when there is nowhere to go.
 *
 * Phrased as the state of the product, not as a failure of their action.
 */
export const ENVIRONMENT_UNAVAILABLE_LABELS: Readonly<
  Record<EnvironmentUnavailableReason, string>
> = {
  "no-environment-yet": "No dedicated environment for this yet",
  "no-canonical-record": "No canonical record to open",
  "not-an-environment-subject": "This is not something an environment owns",
};

/**
 * Every focus kind, so a new one cannot be added without deciding where
 * it goes. Exported for the contract test rather than for callers.
 */
export const ROUTED_FOCUS_KINDS: readonly FocusSubjectKind[] = [
  "vessel",
  "voyage",
  "port",
  "cargo",
  "manifest",
  "company",
  "investigation",
  "incident",
  "risk-event",
];
