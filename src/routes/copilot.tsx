/**
 * LAYER 3.1 — State Machine + LAYER 3.2/3.3 — Full UX for the Copilot.
 *
 * Route: /copilot
 *
 *  [Idle] → [Zero State] → [Classifying] → [Retrieving] → [Reasoning]
 *  → [Rendering] → [Awaiting Officer] → [Actions Active] → [Workflow Executed] → …
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { copilotQueryFn, copilotOverrideFn } from "@/lib/orchestration.functions";
import { BriefingRenderer } from "@/components/orchestration/BriefingRenderer";
import type { Briefing, OverrideDecision } from "@/services/orchestration";

type EngineState =
  | "zero"
  | "classifying"
  | "retrieving"
  | "reasoning"
  | "rendering"
  | "awaiting_officer"
  | "actions_active"
  | "workflow_executed";

const SUGGESTIONS = [
  "Assess ownership network for IMO 9319466",
  "Detect revenue leakage on last week's Lagos manifests",
  "Screen operator Blue Horizon Shipping for sanctions exposure",
];

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "NIMASA Copilot — Intelligence Orchestration Engine" },
      { name: "description", content: "Officer-facing intelligence briefings backed by the Seaphore Orchestration Engine." },
    ],
  }),
  component: CopilotPage,
});

function CopilotPage() {
  const queryClient = useQueryClient();
  const runQuery = useServerFn(copilotQueryFn);
  const submitOverride = useServerFn(copilotOverrideFn);

  const [state, setState] = useState<EngineState>("zero");
  const [text, setText] = useState("");
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  const query = useMutation({
    mutationFn: async (q: string) => {
      // State transitions per 3.1
      setState("classifying");
      await new Promise((r) => setTimeout(r, 100));
      setState("retrieving");
      const started = performance.now();
      const result = await runQuery({ data: { query: q } });
      setState("reasoning");
      // Render — reconstruct into Briefing shape for the renderer
      const b: Briefing = {
        id: result.briefing_id,
        officer_id: "self",
        query: q,
        mode: result.mode,
        classification: result.classification,
        sections: result.sections,
        intelligence_status: result.intelligence_status,
        sources_queried: result.sources_queried,
        sources_responded: result.sources_responded,
        sources_corroborated: result.sources_corroborated,
        confidence_matrix: result.confidence_matrix,
        latency_ms: result.latency_ms ?? Math.round(performance.now() - started),
        model_used: "lovable-ai:gemini",
      };
      setState("rendering");
      setBriefing(b);
      setState("awaiting_officer");
      await queryClient.invalidateQueries({ queryKey: ["intel", "briefings"] });
      return b;
    },
  });

  async function handleOverride(decision: OverrideDecision, justification?: string) {
    if (!briefing) return;
    await submitOverride({ data: { briefing_id: briefing.id, decision, justification } });
    setState(decision === "agree" || decision === "modify" ? "actions_active" : "zero");
    if (decision === "disagree" || decision === "dismiss") {
      setBriefing(null);
      setText("");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">NIMASA Copilot</h1>
        <p className="text-sm text-muted-foreground">
          Intelligence Orchestration Engine · state:{" "}
          <span className="font-mono text-xs">{state}</span>
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) query.mutate(text.trim());
        }}
        className="space-y-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask an operational question…"
          rows={3}
          className="w-full rounded-md border bg-background p-3 text-sm"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={query.isPending || !text.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {query.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Ask Copilot
          </button>
          {state === "zero" && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setText(s)}
                  className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      {query.isError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {(query.error as Error).message}
        </div>
      )}

      {briefing && (
        <BriefingRenderer briefing={briefing} onOverride={handleOverride} />
      )}
    </div>
  );
}
