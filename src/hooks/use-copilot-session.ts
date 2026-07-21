/**
 * use-copilot-session — unified Copilot conversation binding.
 *
 * Reads and appends turns on the active Mission Context. Every Copilot
 * surface (global launcher, /copilot page, centre panels) uses this hook
 * so the same history is visible everywhere and survives navigation.
 */
import { useCallback } from "react";
import { useMissionContextStore, MISSION_AMBIENT_ID } from "@/stores/mission-context.store";
import type { ConversationEntry } from "@/stores/mission-context.store";

export interface CopilotSession {
  missionId: string;
  history: ConversationEntry[];
  appendOfficer: (text: string, instance?: string) => void;
  appendCopilot: (text: string, briefingId?: string, instance?: string) => void;
  reset: () => void;
}

export function useCopilotSession(): CopilotSession {
  const activeId = useMissionContextStore((s) => s.activeId ?? MISSION_AMBIENT_ID);
  const history = useMissionContextStore(
    (s) => s.missions[activeId]?.conversation ?? [],
  );
  const appendConversation = useMissionContextStore((s) => s.appendConversation);
  const resetConversation = useMissionContextStore((s) => s.resetConversation);

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
