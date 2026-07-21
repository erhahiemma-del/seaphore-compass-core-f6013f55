/**
 * CopilotWorkspace — the single canonical Copilot surface.
 *
 * Wires the UI directly to the implemented Intelligence Orchestration
 * Engine (`copilotQueryFn` → Intent Classifier → Agent Scheduler →
 * Evidence Fusion → Reasoning Engine → Policy Engine → Briefing
 * Builder), then renders the Sprint 3 Adaptive Briefing. Officer
 * overrides are captured through `copilotOverrideFn` so the Workflow
 * Engine + Policy Engine can act on them.
 *
 * Used by both the modal (global launcher) and the dedicated `/copilot`
 * route so behavior is identical everywhere.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdaptiveBriefing } from "@/components/copilot/briefing";
import type {
  AdaptiveBriefingData,
  OverrideSubmission,
} from "@/components/copilot/briefing";
import { ContextBar } from "@/components/copilot/ContextBar";
import { StreamingStages } from "@/components/copilot/StreamingStages";
import { Button } from "@/components/ui/button";
import { useCopilotSession } from "@/hooks/use-copilot-session";
import type { CopilotInstanceKey } from "@/lib/ai/types";
import { adaptBriefing, type CopilotQueryResponse } from "@/lib/copilot/adapt-briefing";

import { copilotOverrideFn, copilotQueryFn } from "@/lib/orchestration.functions";
import { cn } from "@/lib/utils";
import { orchestrate, captureOverride } from "@/services/orchestration";
import { useAuthStore } from "@/stores/auth.store";
import { useCopilotStore } from "@/stores/copilot.store";
import { useIsDevBypass } from "@/stores/dev-mode.store";
import { useMissionContextStore } from "@/stores/mission-context.store";


type Stage = "idle" | "classifying" | "retrieving" | "reasoning" | "rendering" | "ready";

const DEFAULT_SUGGESTIONS = [
  "Assess ownership network for IMO 9319466",
  "Detect revenue leakage on last week's Lagos manifests",
  "Screen operator Blue Horizon Shipping for sanctions exposure",
];

export interface CopilotWorkspaceProps {
  suggestions?: string[];
  className?: string;
  autoFocus?: boolean;
  showContextBar?: boolean;
  /** Which Copilot surface this workspace is rendered from. Biases the
   * orchestration Agent Scheduler toward that module's specialist. */
  instance?: CopilotInstanceKey;
  /** Show the shared conversation history for the active mission. */
  showHistory?: boolean;
}

export function CopilotWorkspace({
  suggestions = DEFAULT_SUGGESTIONS,
  className,
  autoFocus = true,
  showContextBar = true,
  instance = "seaphore",
  showHistory = true,
}: CopilotWorkspaceProps) {
  const queryClient = useQueryClient();
  const context = useCopilotStore((s) => s.context);
  const runQuery = useServerFn(copilotQueryFn);
  const submitOverride = useServerFn(copilotOverrideFn);
  const authUserId = useAuthStore((s) => s.officer?.userId);
  const officerId = authUserId ?? "00000000-0000-0000-0000-000000000000";
  const devBypass = useIsDevBypass();
  const session = useCopilotSession();
  const activeMissionId = useMissionContextStore((s) => s.activeId);




  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [briefing, setBriefing] = useState<AdaptiveBriefingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus]);

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      setError(null);
      setStage("classifying");
      const started = performance.now();
      await new Promise((r) => setTimeout(r, 80));
      setStage("retrieving");
      const queryPayload = {
        query: q,
        officer_id: officerId,
        context: context
          ? {
              investigation_id: context.kind === "investigation" ? context.label : undefined,
              vessel: context.kind === "vessel" ? context.label : undefined,
              port: context.kind === "port" ? context.label : undefined,
            }
          : undefined,
      };
      const response = (devBypass
        ? await orchestrate({
            query: queryPayload.query,
            officer_id: queryPayload.officer_id,
            context: queryPayload.context,
          })
        : await runQuery({ data: queryPayload })) as CopilotQueryResponse;
      setStage("reasoning");
      const adapted = adaptBriefing(
        {
          ...response,
          latency_ms: response.latency_ms ?? Math.round(performance.now() - started),
        },
        q,
      );
      setStage("rendering");
      setBriefing(adapted);
      setStage("ready");
      await queryClient.invalidateQueries({ queryKey: ["intel", "briefings"] });
      return adapted;
    },
    onError: (err: unknown) => {
      setStage("idle");
      setError(err instanceof Error ? err.message : "Copilot request failed");
    },
  });

  async function handleSubmit(q: string) {
    const clean = q.trim();
    if (!clean || mutation.isPending) return;
    setText(clean);
    mutation.mutate(clean);
  }

  async function handleOverride(submission: OverrideSubmission) {
    if (!briefing) return;
    try {
      if (devBypass) {
        await captureOverride({
          briefing_id: briefing.id,
          officer_id: officerId,
          decision: submission.decision,
          justification: submission.justification,
        });
      } else {
        await submitOverride({
          data: {
            briefing_id: briefing.id,
            decision: submission.decision,
            justification: submission.justification,
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override submission failed");
    }
  }


  function reset() {
    setBriefing(null);
    setStage("idle");
    setText("");
    setError(null);
    inputRef.current?.focus();
  }

  const isStreaming =
    stage === "classifying" ||
    stage === "retrieving" ||
    stage === "reasoning" ||
    stage === "rendering";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {showContextBar && context ? <ContextBar context={context} /> : null}

      {!briefing && !isStreaming ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested starting points
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {(suggestions ?? DEFAULT_SUGGESTIONS).slice(0, 3).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => handleSubmit(s)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-accent"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isStreaming ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Query
          </p>
          <p className="mb-4 text-sm text-foreground">{text}</p>
          <StreamingStages activeIndex={stageIndex(stage)} />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {briefing ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Briefing <span className="font-mono">{briefing.id.slice(0, 8)}</span>
            </p>
            <Button size="sm" variant="ghost" onClick={reset}>
              Ask another
            </Button>
          </div>
          <AdaptiveBriefing briefing={briefing} onOverride={handleOverride} />
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(text);
        }}
        className="rounded-lg border border-border bg-background p-2"
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask an operational question…"
          rows={2}
          disabled={mutation.isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(text);
            }
          }}
          className="w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Enter to send · Shift+Enter for newline
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={mutation.isPending || !text.trim()}
            className="gap-1.5"
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden />
            )}
            Ask Copilot
          </Button>
        </div>
      </form>
    </div>
  );
}

function stageIndex(s: Stage): number {
  if (s === "classifying") return 0;
  if (s === "retrieving") return 1;
  if (s === "reasoning") return 2;
  return 3;
}
