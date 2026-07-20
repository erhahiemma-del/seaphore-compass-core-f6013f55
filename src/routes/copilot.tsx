/**
 * /copilot — dedicated Intelligence Orchestration Engine workspace.
 *
 * Renders the same `CopilotWorkspace` that powers the global modal, so
 * behavior is identical whether the officer opens the pop-up or lands
 * on the route directly. Every submission runs the real pipeline
 * (Intent → Agents → Fusion → Reasoning → Policy → Briefing) and shows
 * the Sprint 3 Adaptive Briefing.
 */
import { createFileRoute } from "@tanstack/react-router";

import { CopilotWorkspace } from "@/components/copilot/CopilotWorkspace";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "NIMASA Copilot — Intelligence Orchestration Engine" },
      {
        name: "description",
        content:
          "Officer-facing intelligence briefings backed by the Seaphore Orchestration Engine.",
      },
    ],
  }),
  component: CopilotPage,
});

function CopilotPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">NIMASA Copilot</h1>
        <p className="text-sm text-muted-foreground">
          Intelligence Orchestration Engine — agents, evidence fusion, reasoning, and
          officer-signed decisions in a single briefing.
        </p>
      </header>

      <CopilotWorkspace />

      <p className="border-t border-border pt-3 text-center text-[10.5px] uppercase tracking-wider text-muted-foreground">
        Evidence first. Explainable always. Officer decides.
      </p>
    </div>
  );
}
