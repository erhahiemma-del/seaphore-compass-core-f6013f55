import { useEffect } from "react";

import { useCopilotStore } from "@/stores/copilot.store";

/**
 * Registers global keyboard shortcuts for the Copilot modal.
 *   - Cmd/Ctrl+K: toggle open
 *   - Escape:     close (handled inside the modal for focus reasons,
 *                 but exposed here for consistency)
 *
 * Ignores presses that originate from editable elements so typing
 * "K" inside an input never accidentally opens the assistant.
 */
export function useCopilotShortcuts() {
  const toggleCopilot = useCopilotStore((s) => s.toggleCopilot);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (cmdK && !isEditable) {
        e.preventDefault();
        toggleCopilot();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCopilot]);
}
