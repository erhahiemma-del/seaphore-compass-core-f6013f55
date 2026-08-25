/**
 * The Focus Workspace controller.
 *
 * Connects the pure model to the services that already own each piece of
 * state, and owns nothing itself. Every hook below reads an existing
 * store; none of them is new, and this introduces no state of its own
 * beyond what `focus-subject.store` already carries.
 *
 * Kept separate from the surface so the wiring can be reasoned about
 * without a component, and so the surface can be given a model directly
 * in tests.
 */
import { useMemo } from "react";

import { canonicalEntityId } from "@/services/ial/normalizer";
import { useFocusSubjectStore, type FocusSubject } from "@/stores/focus-subject.store";
import { useInvestigationWorkflowStore } from "@/services/investigations-workflow";
import { useMissionMode } from "@/features/mission-control/useMissionMode";
import { useMkgStore } from "@/services/mkg/store";
import { useRoles } from "@/hooks/use-permissions";
import type { EntityKind } from "@/services/ial/types";
import type { Role } from "@/lib/permissions";

import { buildFocusWorkspace, type FocusWorkspaceModel } from "./model";
import { hasDedicatedModule } from "./handoff";

/**
 * Focus kinds the IAL can build a canonical id for.
 *
 * `canonicalEntityId` accepts `EntityKind` — vessel, company, person,
 * port, cargo, voyage. The remaining focus kinds have no canonical form,
 * and this deliberately returns null for them rather than passing an id
 * the normalizer would slugify into something that looks real and
 * resolves to nothing. The model reports that as NOT_RESOLVABLE.
 */
const CANONICAL_KINDS: Readonly<Partial<Record<FocusSubject["kind"], EntityKind>>> = {
  vessel: "vessel",
  port: "port",
  cargo: "cargo",
  company: "company",
  voyage: "voyage",
};

export function canonicalIdForSubject(subject: FocusSubject): string | null {
  const kind = CANONICAL_KINDS[subject.kind];
  return kind ? canonicalEntityId(kind, subject.id) : null;
}

export interface FocusWorkspaceController {
  /** The model, or null when nothing is focused. */
  readonly model: FocusWorkspaceModel | null;
  /** Whether the transient surface should be showing. */
  readonly open: boolean;
  /** Close the surface, keeping the subject in focus. */
  readonly dismiss: () => void;
  /** Drop the subject entirely. */
  readonly clear: () => void;
}

export function useFocusWorkspace(): FocusWorkspaceController {
  const subject = useFocusSubjectStore((s) => s.subject);
  const workspaceOpen = useFocusSubjectStore((s) => s.workspaceOpen);
  const dismiss = useFocusSubjectStore((s) => s.dismissWorkspace);
  const clear = useFocusSubjectStore((s) => s.clearSubject);
  const { mode } = useMissionMode();
  const cases = useInvestigationWorkflowStore((s) => s.cases);
  const { roles } = useRoles();

  /*
   * `useRoles` returns a fresh array on every render — it is either
   * `[mockRole]` or `query.data ?? []`, both new literals each time. Used
   * directly as a memo dependency that rebuilds the model on every
   * render, which in turn calls `graph.toSnapshot()` every render. That
   * is invisible while the graph is empty and becomes a real cost as it
   * fills.
   *
   * Roles are short strings, so a joined key round-trips losslessly and
   * gives a dependency that changes only when the roles actually do.
   */
  const rolesKey = roles.join(",");
  const stableRoles = useMemo(() => (rolesKey ? (rolesKey.split(",") as Role[]) : []), [rolesKey]);

  /*
   * The graph is read through its revision counter, not by subscribing
   * to the graph object. `MaritimeKnowledgeGraph` is a mutable class —
   * its identity never changes on write, so selecting it directly would
   * memoise against a value that is stale by definition. The store bumps
   * `revision` on every write precisely so consumers can depend on it.
   */
  const revision = useMkgStore((s) => s.revision);
  const snapshotOf = useMkgStore((s) => s.snapshot);

  return useMemo(() => {
    if (!subject) {
      return { model: null, open: false, dismiss, clear };
    }
    const canonicalId = canonicalIdForSubject(subject);
    return {
      model: buildFocusWorkspace({
        subject,
        mode,
        cases,
        roles: stableRoles,
        hasDedicatedModule: hasDedicatedModule(subject, canonicalId),
        // Re-read whenever the graph changed; `revision` is the dependency
        // that makes that happen and is otherwise unused.
        graph: revision >= 0 ? snapshotOf() : null,
        canonicalId,
      }),
      open: workspaceOpen,
      dismiss,
      clear,
    };
  }, [subject, workspaceOpen, mode, cases, stableRoles, revision, snapshotOf, dismiss, clear]);
}
