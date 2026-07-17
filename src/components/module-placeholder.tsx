import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

import { ConfidenceChip } from "@/components/confidence-chip";
import { Card } from "@/components/ui/card";

export interface ModulePlaceholderProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  description?: string;
  capabilities?: string[];
}

/**
 * Placeholder for every operational module. The foundation sprint intentionally
 * ships no operational workflows — modules will be implemented in future
 * sprints. Every screen still carries the shell, header, and footer contract.
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
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <Card className="border-dashed p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Module Status
          </span>
          <ConfidenceChip tier="unconfirmed" />
          <span className="text-[11px] text-muted-foreground">
            Scheduled for a future sprint
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/80">
          {description ??
            "This intelligence module is part of the Seaphore roadmap. The foundation sprint establishes architecture, design system, navigation, authentication, routing, and backend scaffolding only — no operational workflows are shipped in this sprint."}
        </p>

        {capabilities && capabilities.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Planned Capabilities
            </div>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {capabilities.map((cap) => (
                <li
                  key={cap}
                  className="flex items-start gap-2 text-sm text-foreground/80"
                >
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 border-t border-border pt-4 text-[11px] text-muted-foreground">
          Every number will wear a confidence chip. Every recommendation will
          come from the system; every decision will come from the officer.
        </div>
      </Card>
    </div>
  );
}
