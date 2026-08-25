/**
 * The Focus Workspace, wired.
 *
 * Holds the three things the surface deliberately does not: the store
 * bindings, the router, and the decision about what each action means.
 *
 * The route literals live here because that is the only place TanStack
 * can typecheck them. A renamed or deleted route fails the build rather
 * than producing a button that 404s, which is why `handoff.ts` returns
 * intent instead of strings.
 */
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { FocusWorkspace } from "./FocusWorkspace";
import { canonicalIdForSubject, useFocusWorkspace } from "./useFocusWorkspace";
import { focusDestination } from "./handoff";
import type { FocusActionId } from "./model";

export function FocusWorkspaceHost({ className }: { readonly className?: string }) {
  const { model, open, dismiss } = useFocusWorkspace();
  const navigate = useNavigate();

  const onAction = useCallback(
    (id: FocusActionId) => {
      if (!model) return;

      // Dismiss closes the transient surface only. The subject stays in
      // focus so the Context Rail, the map highlight and the Copilot all
      // still know what the officer is working on.
      if (id === "dismiss") {
        dismiss();
        return;
      }

      // "Work here" is the officer declining to leave. There is nothing
      // to navigate to — the drawer they are in *is* the destination.
      if (id === "work-here") return;

      const work = model.work.state === "present" ? model.work.data : null;
      const destination = focusDestination(
        id,
        model.subject,
        canonicalIdForSubject(model.subject),
        work,
      );
      if (!destination) return;

      /*
       * Focus is deliberately not cleared on navigation. The subject
       * survives the move, so returning to Mission Control restores the
       * officer to what they were working on rather than an empty page.
       * The drawer closes because the officer has left it, not because
       * the work ended.
       */
      dismiss();

      switch (destination.kind) {
        case "entity":
          navigate({ to: "/entity/$id", params: { id: destination.id } });
          return;
        case "investigation":
          navigate({ to: "/investigate/$id", params: { id: destination.id } });
          return;
        case "new-investigation":
          navigate({ to: "/investigate" });
          return;
        case "manifest":
          navigate({ to: "/manifest" });
          return;
        case "evidence":
          navigate({ to: "/evidence" });
          return;
        case "copilot":
          navigate({ to: "/copilot" });
          return;
      }
    },
    [model, dismiss, navigate],
  );

  return <FocusWorkspace model={model} open={open} onAction={onAction} className={className} />;
}
