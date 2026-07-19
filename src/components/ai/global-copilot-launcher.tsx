import { useState } from "react";
import { useLocation } from "@tanstack/react-router";

import { AskCopilotDialog } from "@/components/ai/ask-copilot-dialog";
import { COPILOT_REGISTRY } from "@/lib/ai/copilots";
import type { CopilotInstanceKey } from "@/lib/ai/types";
import nimasaLogo from "@/assets/nimasa-logo.png";

/** Route → Copilot instance mapping used by the global launcher. */
function copilotForPath(path: string): CopilotInstanceKey {
  if (path.startsWith("/manifest")) return "manifest";
  if (path.startsWith("/cargo")) return "cargo";
  if (path.startsWith("/revenue")) return "revenue";
  if (path.startsWith("/memory")) return "memory";
  if (path.startsWith("/vessel")) return "vessel";
  if (path.startsWith("/ports")) return "ports";
  if (path.startsWith("/ownership")) return "ownership";
  if (path.startsWith("/compliance")) return "compliance";
  if (path.startsWith("/evidence")) return "evidence";
  if (path.startsWith("/alerts")) return "alerts";
  if (path.startsWith("/admin")) return "administration";
  return "seaphore";
}

/**
 * Global "Ask Copilot" launcher — present on every screen. Adapts its
 * label, branding, and suggested prompts to the active workspace.
 */
export function GlobalCopilotLauncher() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const instance = copilotForPath(location.pathname);
  const inst = COPILOT_REGISTRY[instance];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Ask ${inst.name} (⌘K)`}
        className="fixed bottom-16 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-[12.5px] font-semibold text-primary-foreground shadow-lg hover:opacity-95"
      >
        <img src={nimasaLogo} alt="" width={18} height={18} className="rounded-full bg-white/90 p-0.5" />
        Ask {inst.shortName}
      </button>
      <AskCopilotDialog instance={instance} open={open} onOpenChange={setOpen} />
    </>
  );
}
