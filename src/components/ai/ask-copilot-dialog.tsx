/**
 * AskCopilotDialog — thin modal wrapper around the unified
 * `CopilotWorkspace`. Every specialist Copilot (Manifest, Cargo,
 * Revenue, Vessel, Ports, Ownership, Compliance, Evidence, Alerts,
 * Memory, Administration, NIMASA/Seaphore) opens the same workspace
 * so orchestration, conversation, briefings, and overrides all flow
 * through one canonical surface. The `instance` prop is passed
 * through as a `moduleHint`, biasing the Agent Scheduler toward that
 * module's specialist agent.
 */
import { useEffect } from "react";
import { X } from "lucide-react";

import { CopilotWorkspace } from "@/components/copilot/CopilotWorkspace";
import type { CopilotInstanceKey } from "@/lib/ai/types";
import { COPILOT_REGISTRY } from "@/lib/ai/copilots";
import { cn } from "@/lib/utils";
import nimasaLogo from "@/assets/nimasa-logo.png";

export interface AskCopilotDialogProps {
  instance: CopilotInstanceKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedQuery?: string;
  context?: Record<string, string>;
}

const SUBTITLES: Partial<Record<CopilotInstanceKey, string>> = {
  seaphore: "Ask about vessels, cargo, ports, or companies",
  vessel: "Ask about voyages, AIS traces, or vessel history",
  ports: "Ask about berths, dwell time, or port throughput",
  revenue: "Ask about leakage, exposure, or revenue-at-risk",
  manifest: "Ask about declarations, duplicates, or HS codes",
  cargo: "Ask about containers, seals, or declared vs observed cargo",
  ownership: "Ask about directors, ownership graphs, or sanctions links",
  compliance: "Ask about violations, sanctions, or overdue inspections",
  evidence: "Ask about documents, chain-of-custody, or version history",
  alerts: "Ask about triage queue, correlations, or SLA breaches",
  memory: "Search cases, briefings, and prior officer decisions",
  administration: "Ask about roles, data sources, or audit trail",
};

export function AskCopilotDialog({
  instance,
  open,
  onOpenChange,
  seedQuery,
  context,
}: AskCopilotDialogProps) {
  const config = COPILOT_REGISTRY[instance];
  const title = config?.name ?? "Seaphore Copilot";

  const subtitle = SUBTITLES[instance] ?? "Ask an operational question";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const suggestions = config?.exampleQueries?.slice(0, 3);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-16 sm:pt-24"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl",
        )}
      >
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <img src={nimasaLogo} alt="" className="h-6 w-6 rounded object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close Copilot"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <CopilotWorkspace
            instance={instance}
            suggestions={suggestions}
            showContextBar={false}
            autoFocus
          />
          {seedQuery ? (
            <p className="mt-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Seed: {seedQuery}
              {context && Object.keys(context).length > 0
                ? ` · ${Object.entries(context)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" · ")}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default AskCopilotDialog;
