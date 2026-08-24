/**
 * use-copilot-session — unified Copilot conversation binding.
 *
 * Reads and appends turns on the active Mission Context. Every Copilot
 * surface (global launcher, /copilot page, centre panels) uses this hook
 * so the same history is visible everywhere and survives navigation.
 */
import { useCallback } from "react";
import { useMissionWorkspaceStore, MISSION_AMBIENT_ID } from "@/stores/mission-workspace.store";
import type { ConversationEntry } from "@/stores/mission-workspace.store";

export interface CopilotSession {
  missionId: string;
  history: ConversationEntry[];
  appendOfficer: (text: string, instance?: string) => void;
  appendCopilot: (text: string, briefingId?: string, instance?: string) => void;
  reset: () => void;
}

export function useCopilotSession(): CopilotSession {
  const activeId = useMissionWorkspaceStore((s) => s.activeId ?? MISSION_AMBIENT_ID);
  const history = useMissionWorkspaceStore((s) => s.missions[activeId]?.conversation ?? []);
  const appendConversation = useMissionWorkspaceStore((s) => s.appendConversation);
  const resetConversation = useMissionWorkspaceStore((s) => s.resetConversation);

  const appendOfficer = useCallback(
    (text: string, instance?: string) =>
      appendConversation(activeId, { role: "officer", text, instance }),
    [activeId, appendConversation],
  );
  const appendCopilot = useCallback(
    (text: string, briefingId?: string, instance?: string) =>
      appendConversation(activeId, { role: "copilot", text, briefingId, instance }),
    [activeId, appendConversation],
  );
  const reset = useCallback(() => resetConversation(activeId), [activeId, resetConversation]);

  return { missionId: activeId, history, appendOfficer, appendCopilot, reset };
}
