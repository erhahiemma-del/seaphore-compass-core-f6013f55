/**
 * CopilotWorkspace — the single canonical Copilot surface.
 *
 * Every officer query flows through the Operational Intelligence Engine
 * (OIE) — never directly to the reasoning provider. The OIE handles
 * intent recognition, pronoun resolution against mission context,
 * clarification for ambiguous requests, evidence collection through the
 * orchestrator, and operational-tone response generation. The UI's only
 * job is to render whichever turn the OIE returns: a clarify card or a
 * full Adaptive Briefing.
 *
 * Used by both the modal (global launcher) and the dedicated `/copilot`
 * route so behaviour is identical everywhere.
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
import { ClarifyCard } from "@/components/copilot/ClarifyCard";
import { ContextBar } from "@/components/copilot/ContextBar";
import { StreamingStages } from "@/components/copilot/StreamingStages";
import { Button } from "@/components/ui/button";
import { useCopilotSession } from "@/hooks/use-copilot-session";
import type { CopilotInstanceKey } from "@/lib/ai/types";
import { adaptBriefing, type CopilotQueryResponse } from "@/lib/copilot/adapt-briefing";

import { copilotOverrideFn } from "@/lib/orchestration.functions";
import { runOIEFn } from "@/lib/oie/oie.functions";
import { cn } from "@/lib/utils";
import { captureOverride } from "@/services/orchestration";
import { runOIE, type Clarification, type OperationalPlan } from "@/services/oie";
import { useAuthStore } from "@/stores/auth.store";
import { useCopilotStore } from "@/stores/copilot.store";
import { useIsDevBypass } from "@/stores/dev-mode.store";
import { useMissionContextStore } from "@/stores/mission-context.store";

type Stage = "idle" | "classifying" | "retrieving" | "reasoning" | "rendering" | "ready";

const DEFAULT_SUGGESTIONS = [
  "Show today's arriving vessels",
  "Why is this vessel high risk?",
  "Compare today's manifest with yesterday",
];

export interface CopilotWorkspaceProps {
  suggestions?: string[];
  className?: string;
  autoFocus?: boolean;
  showContextBar?: boolean;
  /** Which Copilot surface this workspace is rendered from. Biases the
   *  orchestration Agent Scheduler toward that module's specialist. */
  instance?: CopilotInstanceKey;
  /** Show the shared conversation history for the active mission. */
  showHistory?: boolean;
}

interface OIEBriefingTurn {
  kind: "briefing";
  briefing: AdaptiveBriefingData;
  followUps: string[];
}
interface OIEClarifyTurn {
  kind: "clarify";
  clarification: Clarification;
}
type CopilotTurn = OIEBriefingTurn | OIEClarifyTurn;

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
  const runOIEServer = useServerFn(runOIEFn);
  const submitOverride = useServerFn(copilotOverrideFn);
  const authUserId = useAuthStore((s) => s.officer?.userId);
  const officerId = authUserId ?? "00000000-0000-0000-0000-000000000000";
  const devBypass = useIsDevBypass();
  const session = useCopilotSession();
  const activeMissionId = useMissionContextStore((s) => s.activeId);

  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [turn, setTurn] = useState<CopilotTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus]);

  const mutation = useMutation({
    mutationFn: async (q: string): Promise<CopilotTurn> => {
      setError(null);
      setStage("classifying");
      const started = performance.now();
      await new Promise((r) => setTimeout(r, 60));
      setStage("retrieving");

      // Flatten the active mission (vessel, alerts, evidence,
      // conversation…) so the OIE can resolve "it" / "this vessel" and
      // carry subjects across turns.
      const missionState = useMissionContextStore.getState();
      const mission = activeMissionId ? missionState.missions[activeMissionId] : undefined;

      const payload = {
        query: q,
        officer_id: officerId,
        moduleHint: instance,
        mission: mission as unknown as Record<string, unknown> | undefined,
        context: context
          ? {
              investigation_id: context.kind === "investigation" ? context.label : undefined,
              vessel: context.kind === "vessel" ? context.label : undefined,
              port: context.kind === "port" ? context.label : undefined,
            }
          : undefined,
      };

      // devBypass → run the OIE client-side against the orchestrator;
      // authed → route through the server function with a real provider.
      const result = devBypass
        ? await runOIE({
            query: {
              query: payload.query,
              officer_id: payload.officer_id,
              moduleHint: payload.moduleHint,
              mission: payload.mission,
              context: payload.context,
            },
          })
        : await runOIEServer({ data: payload });

      setStage("reasoning");

      if (result.kind === "clarify") {
        setStage("ready");
        return { kind: "clarify", clarification: result.clarification };
      }

      // Both paths (devBypass client-side and server RPC) yield a
      // patched briefing plus the operational plan.
      const briefing = "briefing" in result ? result.briefing : null;
      const humanResponse = "humanResponse" in result ? result.humanResponse : null;
      const followUps = extractFollowUps(result) ?? humanResponse?.suggestedNextQuestions ?? [];

      // Both shapes flow through adaptBriefing so the existing renderer
      // stays untouched. Server response uses `briefing_id`; client
      // response uses the full `Briefing`.
      const adapted = adaptBriefing(
        {
          ...toCopilotQueryResponse(result),
          latency_ms: latencyFromResult(result) ?? Math.round(performance.now() - started),
        },
        q,
      );

      setStage("rendering");
      setStage("ready");

      // Record the exchange on the shared mission conversation so the
      // NEXT query can resolve pronouns and "carry the subject forward".
      session.appendCopilot(`Briefing: ${q}`, adapted.id, instance);
      await queryClient.invalidateQueries({ queryKey: ["intel", "briefings"] });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _keepBriefing = briefing;
      return { kind: "briefing", briefing: adapted, followUps };
    },
    onSuccess: (t) => setTurn(t),
    onError: (err: unknown) => {
      setStage("idle");
      setError(err instanceof Error ? err.message : "Copilot request failed");
    },
  });

  async function handleSubmit(q: string) {
    const clean = q.trim();
    if (!clean || mutation.isPending) return;
    setText("");
    setError(null);
    session.appendOfficer(clean, instance);
    mutation.mutate(clean);
  }

  async function handleClarifyPick(label: string) {
    // The pick keeps the anchor entity alive (the OIE reads it from
    // conversation history) and re-runs with the operational skill
    // implied by the label.
    handleSubmit(label);
  }

  async function handleOverride(submission: OverrideSubmission) {
    if (turn?.kind !== "briefing") return;
    try {
      if (devBypass) {
        await captureOverride({
          briefing_id: turn.briefing.id,
          officer_id: officerId,
          decision: submission.decision,
          justification: submission.justification,
        });
      } else {
        await submitOverride({
          data: {
            briefing_id: turn.briefing.id,
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
    setTurn(null);
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

  const followUpChips =
    turn?.kind === "briefing" && turn.followUps.length > 0 ? turn.followUps : null;

  const startingSuggestions = suggestions ?? DEFAULT_SUGGESTIONS;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {showContextBar && context ? <ContextBar context={context} /> : null}

      {showHistory && session.history.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mission conversation · {session.history.length} turns
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={session.reset}
              className="h-6 gap-1 text-[11px]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Reset
            </Button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {session.history.slice(-8).map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded border px-2 py-1 text-[11.5px] leading-snug",
                  entry.role === "officer"
                    ? "border-primary/30 bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <span className="mr-1 font-semibold uppercase tracking-wider text-[9.5px] text-muted-foreground">
                  {entry.role === "officer" ? "Officer" : entry.instance ?? "Copilot"}
                </span>
                {entry.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!turn && !isStreaming ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested starting points
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {startingSuggestions.slice(0, 3).map((s) => (
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

      {turn?.kind === "clarify" ? (
        <ClarifyCard clarification={turn.clarification} onPick={handleClarifyPick} />
      ) : null}

      {turn?.kind === "briefing" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Briefing <span className="font-mono">{turn.briefing.id.slice(0, 8)}</span>
            </p>
            <Button size="sm" variant="ghost" onClick={reset}>
              Ask another
            </Button>
          </div>
          <AdaptiveBriefing briefing={turn.briefing} onOverride={handleOverride} />
          {followUpChips ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested next questions
              </p>
              <ul className="flex flex-wrap gap-2">
                {followUpChips.map((f) => (
                  <li key={f}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => handleSubmit(f)}
                    >
                      {f}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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

/** Normalises the OIE result (either client-side or server-RPC shape)
 *  into the CopilotQueryResponse the AdaptiveBriefing adapter expects. */
function toCopilotQueryResponse(result: unknown): CopilotQueryResponse {
  const r = result as Record<string, unknown>;
  const clientBriefing = r.briefing as
    | {
        id: string;
        classification: CopilotQueryResponse["classification"];
        sections: CopilotQueryResponse["sections"];
        intelligence_status: CopilotQueryResponse["intelligence_status"];
        sources_queried: number;
        sources_responded: number;
        sources_corroborated: number;
        mode: string;
      }
    | undefined;

  if (clientBriefing) {
    return {
      briefing_id: clientBriefing.id,
      classification: clientBriefing.classification,
      sections: clientBriefing.sections,
      intelligence_status: clientBriefing.intelligence_status,
      sources_queried: clientBriefing.sources_queried,
      sources_responded: clientBriefing.sources_responded,
      sources_corroborated: clientBriefing.sources_corroborated,
      mode: clientBriefing.mode,
    };
  }
  return {
    briefing_id: (r.briefing_id as string) ?? "unknown",
    classification: r.classification as CopilotQueryResponse["classification"],
    sections: r.sections as CopilotQueryResponse["sections"],
    intelligence_status: r.intelligence_status as CopilotQueryResponse["intelligence_status"],
    sources_queried: r.sources_queried as number,
    sources_responded: r.sources_responded as number,
    sources_corroborated: r.sources_corroborated as number,
    mode: r.mode as string,
  };
}

function extractFollowUps(result: unknown): string[] | null {
  const r = result as { plan?: OperationalPlan | { followUps?: string[] } };
  if (!r.plan) return null;
  if ("followUps" in r.plan && Array.isArray(r.plan.followUps)) return r.plan.followUps;
  return null;
}

function latencyFromResult(result: unknown): number | undefined {
  const r = result as { latencyMs?: number; latency_ms?: number };
  return r.latencyMs ?? r.latency_ms;
}
