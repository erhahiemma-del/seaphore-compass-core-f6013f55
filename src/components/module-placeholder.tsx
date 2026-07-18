import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskPill } from "@/components/intelligence/RiskPill";

export interface ModulePlaceholderProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  description?: string;
  capabilities?: string[];
}

/**
 * Placeholder for every operational module. The foundation sprint ships no
 * operational workflows — modules land in later sprints. Every screen still
 * carries the shell, header, footer, and design-system contract.
 */
export function ModulePlaceholder({
  title,
  subtitle,
  icon: Icon = Construction,
  description,
  capabilities,
}: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="type-display text-foreground">{title}</h1>
          <p className="type-small text-slate mt-0.5">{subtitle}</p>
        </div>
      </div>

      <PanelCard className="p-8">
        <PanelHead title="Module Status" meta="Foundation sprint scaffold" />

        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceChip tier="unconfirmed" />
          <RiskPill level="LOW" />
          <span className="type-small text-slate">
            Scheduled for a future sprint
          </span>
        </div>

        <p className="mt-4 max-w-2xl type-body text-foreground/85">
          {description ??
            "This intelligence module is part of the Seaphore roadmap. The foundation sprint establishes design system, navigation, authentication, routing, and backend scaffolding only — no operational workflows are shipped in this sprint."}
        </p>

        {capabilities && capabilities.length > 0 && (
          <div className="mt-6">
            <div className="type-label text-slate">Planned Capabilities</div>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {capabilities.map((cap) => (
                <li
                  key={cap}
                  className="flex items-start gap-2 type-body text-foreground/85"
                >
                  <span
                    className="mt-2 h-1 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: "#0E7C7B" }}
                  />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 border-t border-line pt-4 type-small text-slate">
          Every number wears a confidence chip. Every recommendation comes from
          the system; every decision comes from the officer.
        </div>
      </PanelCard>
    </div>
  );
}
