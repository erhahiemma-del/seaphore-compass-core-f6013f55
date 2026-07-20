/**
 * CopilotModal — global launcher for the NIMASA Copilot.
 *
 * Thin wrapper around `CopilotWorkspace` (the canonical Copilot surface
 * that runs the real Intelligence Orchestration Engine and renders the
 * Adaptive Briefing). Provides:
 *   • Modal shell with header, close/minimize controls
 *   • Optional context bar (investigation / vessel / port)
 *   • Immutable footer
 *   • Minimised pill (Cmd/Ctrl+K restores)
 *
 * The legacy Sprint 2 fake-streaming shell has been removed. Every
 * submission executes:
 *   Intent Classifier → Agent Scheduler → Evidence Fusion →
 *   Reasoning Engine → Policy/Workflow Engines → Adaptive Briefing
 */
import { Minus, Sparkles, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopilotWorkspace } from "@/components/copilot/CopilotWorkspace";
import { cn } from "@/lib/utils";
import { useCopilotStore, type CopilotContext } from "@/stores/copilot.store";

export interface CopilotModalProps {
  /** Optional controlled overrides — otherwise the shared store drives state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  context?: CopilotContext | null;
  suggestions?: string[];
}

export function CopilotModal(props: CopilotModalProps = {}) {
  const store = useCopilotStore();
  const open = props.open ?? store.open;
  const setOpen = (v: boolean) => {
    props.onOpenChange?.(v);
    if (v) store.openCopilot();
    else store.closeCopilot();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "gap-0 p-0 overflow-hidden border-border bg-background",
            "w-screen h-[100dvh] max-w-none rounded-none sm:h-[85vh]",
            "sm:w-[min(880px,94vw)] sm:rounded-xl",
            "flex flex-col",
          )}
          onEscapeKeyDown={() => setOpen(false)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-[15px] font-semibold text-foreground">
                  NIMASA Copilot
                </DialogTitle>
                <DialogDescription className="text-[12.5px] text-muted-foreground">
                  Intelligence Orchestration Engine — evidence, reasoning, and officer decision
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Minimize Copilot"
                onClick={() => store.minimizeCopilot()}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Close Copilot"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <CopilotWorkspace suggestions={props.suggestions} />
          </div>

          <p className="border-t border-border bg-muted/30 px-5 py-2 text-center text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Evidence first. Explainable always. Officer decides.
          </p>
        </DialogContent>
      </Dialog>

      <MinimizedPill />
    </>
  );
}

function MinimizedPill() {
  const minimized = useCopilotStore((s) => s.minimized);
  const restore = useCopilotStore((s) => s.restoreCopilot);
  if (!minimized) return null;
  return (
    <button
      type="button"
      onClick={restore}
      className="fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs shadow-lg hover:bg-accent"
      aria-label="Restore Copilot"
    >
      <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
      NIMASA Copilot
    </button>
  );
}
