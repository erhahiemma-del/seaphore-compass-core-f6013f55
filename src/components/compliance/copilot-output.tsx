import type { ReactNode } from "react";

import {
  ConfidenceChip,
  type ConfidenceTier,
} from "@/components/intelligence/ConfidenceChip";
import { PanelCard } from "@/components/panel-card";
import { cn } from "@/lib/utils";
import { assertObservedLanguage } from "@/lib/compliance/signal-language";

/**
 * HR-11 — every Copilot output (Manifest Copilot, Cargo Truth Engine,
 * Revenue Assurance Copilot, etc.) is rendered through <CopilotOutput>.
 * The component enforces:
 *   • a confidence chip
 *   • at least one source
 *   • observed (not conclusive) language
 */
export interface CopilotSource {
  id: string;
  label: string;
  href?: string;
}

export interface CopilotOutputProps {
  title: string;
  text: string;
  tier: ConfidenceTier;
  sources: readonly CopilotSource[];
  actions?: ReactNode;
  className?: string;
  context?: string;
}

export function CopilotOutput({
  title,
  text,
  tier,
  sources,
  actions,
  className,
  context = "CopilotOutput",
}: CopilotOutputProps) {
  assertObservedLanguage(text, context);
  if (!sources || sources.length === 0) {
    throw new Error(
      `[HR-11] ${context}: CopilotOutput requires at least one source. ` +
        `An inference must not be presented without provenance.`,
    );
  }
  return (
    <PanelCard className={cn("p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="type-h3">{title}</h3>
        <ConfidenceChip tier={tier} />
      </div>
      <p className="type-body text-foreground">{text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="type-small text-slate">Sources:</span>
        {sources.map((s) =>
          s.href ? (
            <a
              key={s.id}
              href={s.href}
              className="type-small text-primary hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {s.label}
            </a>
          ) : (
            <span key={s.id} className="type-small text-foreground/80">
              {s.label}
            </span>
          ),
        )}
      </div>
      {actions && <div className="mt-3">{actions}</div>}
    </PanelCard>
  );
}
