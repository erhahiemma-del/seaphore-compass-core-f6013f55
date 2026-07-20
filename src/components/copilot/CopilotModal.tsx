import { useEffect, useRef, useState } from "react";
import { Mic, Minus, Send, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContextBar } from "@/components/copilot/ContextBar";
import { StreamingStages } from "@/components/copilot/StreamingStages";
import { useCopilotStore, type CopilotContext } from "@/stores/copilot.store";
import { cn } from "@/lib/utils";

const DEFAULT_SUGGESTIONS = [
  "Summarise the highest-risk vessels in the last 24h",
  "Which ports have unresolved compliance flags?",
  "Draft a briefing for the active investigation",
];

export interface CopilotModalProps {
  /** Optional controlled overrides — otherwise the shared store drives state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  context?: CopilotContext | null;
  suggestions?: string[];
  /** Force initial state — useful for Storybook/tests. */
  initialState?: "zero" | "streaming";
}

/**
 * NIMASA Copilot modal — Sprint 2 UI shell.
 *
 * Zero state:   title, subtitle, input with mic + send, 3 suggestions.
 * Streaming:    animated 4-stage strip (Classifying → Retrieving →
 *               Reasoning → Rendering).
 * Context bar:  visible when an investigation/vessel/port is active.
 * Minimise:     collapses to a floating pill; Cmd/Ctrl+K restores.
 * A11y:         focus trapped by Radix Dialog, Esc closes, honours
 *               prefers-reduced-motion, ARIA labels on every control.
 */
export function CopilotModal(props: CopilotModalProps = {}) {
  const store = useCopilotStore();
  const open = props.open ?? store.open;
  const setOpen = (v: boolean) => {
    props.onOpenChange?.(v);
    if (v) store.openCopilot();
    else store.closeCopilot();
  };
  const context = props.context !== undefined ? props.context : store.context;
  const suggestions = (props.suggestions ?? DEFAULT_SUGGESTIONS).slice(0, 3);

  const [phase, setPhase] = useState<"zero" | "streaming">(
    props.initialState ?? "zero",
  );
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase(props.initialState ?? "zero");
    setQuery("");
    setListening(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, props.initialState]);

  function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setPhase("streaming");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "gap-0 p-0 overflow-hidden border-border bg-background",
            "w-screen h-[100dvh] max-w-none rounded-none sm:h-auto sm:max-h-[80vh]",
            "sm:w-[min(640px,92vw)] sm:rounded-xl",
            "flex flex-col",
          )}
          onEscapeKeyDown={() => setOpen(false)}
        >
          {/* Header */}
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
                  Ask a question about your maritime intelligence workspace
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

          {/* Context bar */}
          {context ? <ContextBar context={context} /> : null}

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {phase === "zero" ? (
              <ZeroState suggestions={suggestions} onPick={submit} />
            ) : (
              <StreamingView query={query} onReset={() => setPhase("zero")} />
            )}
          </div>

          {/* Composer */}
          <Composer
            inputRef={inputRef}
            value={query}
            onChange={setQuery}
            listening={listening}
            onToggleMic={() => setListening((v) => !v)}
            onSubmit={() => submit(query)}
            disabled={phase === "streaming"}
          />

          <p className="border-t border-border bg-muted/30 px-5 py-2 text-center text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Evidence first. Explainable always. Officer decides.
          </p>
        </DialogContent>
      </Dialog>

      {/* Minimised pill */}
      <MinimizedPill />
    </>
  );
}

function ZeroState({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="px-5 py-6">
      <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Suggested starting points
      </h3>
      <ul className="mt-3 flex flex-col gap-2">
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left text-[13.5px] text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StreamingView({ query, onReset }: { query: string; onReset: () => void }) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-muted/20 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your question
        </p>
        <p className="mt-1 text-[13.5px] text-foreground">{query}</p>
      </div>
      <StreamingStages />
      <div className="px-4 pb-4">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onReset}
          className="text-[12px] text-muted-foreground"
        >
          Ask a different question
        </Button>
      </div>
    </div>
  );
}

function Composer({
  inputRef,
  value,
  onChange,
  listening,
  onToggleMic,
  onSubmit,
  disabled,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  listening: boolean;
  onToggleMic: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
      className="border-t border-border bg-background px-4 py-3"
    >
      <label htmlFor="copilot-input" className="sr-only">
        Ask the NIMASA Copilot
      </label>
      <div className="flex items-end gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 focus-within:border-primary/60 focus-within:bg-background">
        <textarea
          id="copilot-input"
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!disabled) onSubmit();
            }
          }}
          placeholder="Ask about vessels, ports, cargo, sanctions…"
          className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-[13.5px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onToggleMic}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          aria-pressed={listening}
          className={cn(
            "h-8 w-8 shrink-0",
            listening && "bg-primary/10 text-primary",
          )}
        >
          <Mic className="h-4 w-4" />
        </Button>
        <Button
          type="submit"
          size="icon"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send question"
          className="h-8 w-8 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-[10.5px] text-muted-foreground">
        Press <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> to send ·
        <kbd className="ml-1 rounded border border-border bg-muted px-1">Esc</kbd> to close ·
        <kbd className="ml-1 rounded border border-border bg-muted px-1">⌘K</kbd> to toggle
      </p>
    </form>
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
      className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105"
      aria-label="Restore Copilot"
    >
      <Sparkles className="h-3.5 w-3.5" />
      Copilot
    </button>
  );
}
