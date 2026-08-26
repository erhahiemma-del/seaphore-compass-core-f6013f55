/**
 * The command surface, wired.
 *
 * Holds what the surface deliberately does not: the stores, the router,
 * the audit call, and the decision about what selecting a result means.
 *
 * Route literals live here because that is the only place TanStack can
 * typecheck them — the same reason `handoff.ts` returns intent in the
 * Focus Workspace.
 */
import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useFocusSubjectStore } from "@/stores/focus-subject.store";
import { useInvestigationWorkflowStore } from "@/services/investigations-workflow";
import { useMissionMode } from "@/features/mission-control/useMissionMode";
import { useRoles } from "@/hooks/use-permissions";
import { writeAuditLog } from "@/lib/audit.functions";
import type { Role } from "@/lib/permissions";

import { CommandSurface } from "./CommandSurface";
import { buildCommandActions, commandDestination, type CommandActionId } from "./actions";
import { focusSubjectFromResult } from "./focus-bridge";
import { searchCuesFor, searchPromptsFor, staticPromptFor } from "./suggestions";
import { useCommandSearch } from "./useCommandSearch";
import { useRecentSearchStore } from "./recent-searches";
import type { CommandResult } from "./results";

/**
 * Record a command action.
 *
 * Best-effort and deliberately non-blocking: an audit write that fails
 * must not stop an officer opening the decision queue. It is also the
 * existing `writeAuditLog` and not a second audit path — the table has
 * no UPDATE or DELETE policy, so entries cannot be altered afterwards.
 */
function audit(action: string, entity: string, metadata?: Record<string, unknown>) {
  void writeAuditLog({
    data: { action, entity, module: "mission-control.command", metadata },
  }).catch(() => {
    /* Audit is a record, not a gate. Never block the officer on it. */
  });
}

export function CommandSurfaceHost({
  className,
  showCues = true,
}: {
  readonly className?: string;
  /**
   * The lens's search cues — "national activity · ports · vessels" and
   * the suggestion chips beneath the search box.
   *
   * Off in Mission Control. The cues are an entity-type vocabulary, and
   * on that page they sit directly above the Mission Mode selector,
   * which is a different vocabulary for the same surface. Two rows of
   * chips one above the other teach an officer that neither is the real
   * control — the reason the previous command bar's eight chips were
   * removed in the first place.
   *
   * Left on everywhere else, where there is no lens selector beneath
   * them and the cues are the only thing saying what search will favour.
   */
  readonly showCues?: boolean;
}) {
  const navigate = useNavigate();
  const { mode } = useMissionMode();
  const { roles } = useRoles();
  const search = useCommandSearch();
  const openWorkspace = useFocusSubjectStore((s) => s.openWorkspace);
  const subject = useFocusSubjectStore((s) => s.subject);
  const cases = useInvestigationWorkflowStore((s) => s.cases);
  const recent = useRecentSearchStore((s) => s.queries);
  const remember = useRecentSearchStore((s) => s.remember);
  const clearRecent = useRecentSearchStore((s) => s.clear);

  // Roles arrive as a fresh array each render; a joined key keeps the
  // action list from being rebuilt on every render for no reason.
  const rolesKey = roles.join(",");
  const actions = useMemo(
    () =>
      buildCommandActions({
        mode,
        roles: (rolesKey ? rolesKey.split(",") : []) as Role[],
      }),
    [mode, rolesKey],
  );

  const modeCues = useMemo(() => searchCuesFor(mode), [mode]);
  /*
   * Prompts follow the lens, and the universal set always follows them.
   * Mission Mode changes what the box suggests looking for; it never
   * changes what the box accepts.
   */
  const prompts = useMemo(() => searchPromptsFor(mode), [mode]);
  const staticPrompt = useMemo(() => staticPromptFor(mode), [mode]);
  const cues = showCues ? modeCues : { ...modeCues, cues: [] };

  /** The open case for whatever is focused, so Investigate can continue it. */
  const openCaseId = useMemo(() => {
    if (!subject) return null;
    return (
      cases.find(
        (c) =>
          c.stage !== "closed" &&
          c.subject.id === subject.id &&
          String(c.subject.kind) === String(subject.kind),
      )?.id ?? null
    );
  }, [cases, subject]);

  const onRun = useCallback(
    (value?: string) => {
      const query = value ?? search.input;
      if (query.trim()) {
        // Remembered only when the officer actually ran it, never on keystroke.
        remember(query.trim());
        audit("search", "entities", { query: query.trim(), mode: mode.id });
      }
      search.runNow(value);
    },
    [search, remember, mode.id],
  );

  const onSelectResult = useCallback(
    (result: CommandResult) => {
      remember(search.input.trim() || result.title);
      const focus = focusSubjectFromResult(result);
      if (focus) {
        // Converges with the map and the panels on the one focus store.
        openWorkspace(focus);
        audit("focus", result.kind, { entityId: result.id, mode: mode.id });
        return;
      }
      // No focus kind for this entity: open its profile instead of
      // coercing it into a subject the rest of the system cannot resolve.
      audit("open-entity", result.kind, { entityId: result.id });
      void navigate({ to: "/entity/$id", params: { id: result.id } });
    },
    [remember, search.input, openWorkspace, navigate, mode.id],
  );

  const onAction = useCallback(
    (id: CommandActionId) => {
      const destination = commandDestination(id, { openCaseId });
      if (!destination) return;
      audit(id, "command-action", { mode: mode.id });

      switch (destination.kind) {
        case "investigate-new":
          void navigate({ to: "/investigate" });
          return;
        case "investigate-case":
          void navigate({ to: "/investigate/$id", params: { id: destination.id } });
          return;
        case "manifest":
          void navigate({ to: "/manifest" });
          return;
        case "briefings":
          void navigate({ to: "/briefing-centre" });
          return;
        case "decision-queue":
          void navigate({ to: "/decide/queue" });
          return;
        case "evidence":
          void navigate({ to: "/evidence" });
          return;
      }
    },
    [navigate, openCaseId, mode.id],
  );

  return (
    <CommandSurface
      className={className}
      input={search.input}
      onInput={search.setInput}
      state={search.state}
      actions={actions}
      cues={cues}
      prompts={prompts}
      staticPrompt={staticPrompt}
      recent={recent}
      onRun={onRun}
      onClear={search.clear}
      onClearRecent={clearRecent}
      onSelectResult={onSelectResult}
      onAction={onAction}
    />
  );
}
