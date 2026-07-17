import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { AskCopilotDialog } from "@/components/ai/ask-copilot-dialog";
import { COPILOT_REGISTRY } from "@/lib/ai/copilots";
import type { CopilotInstanceKey } from "@/lib/ai/types";

/** Route → Copilot instance mapping used by the global launcher. */
function copilotForPath(path: string): CopilotInstanceKey {
  if (path.startsWith("/manifest")) return "manifest";
  if (path.startsWith("/cargo")) return "cargo";
  if (path.startsWith("/revenue")) return "revenue";
  if (path.startsWith("/memory")) return "memory";
  return "seaphore";
}

/**
 * Global floating "Ask Copilot" launcher — available on every screen,
 * routes to the Copilot instance most appropriate for the current page.
 * This is the Mission Control AI's orchestration entry-point.
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
        <Sparkles className="h-4 w-4" />
        Ask {inst.shortName}
      </button>
      <AskCopilotDialog instance={instance} open={open} onOpenChange={setOpen} />
    </>
  );
}
