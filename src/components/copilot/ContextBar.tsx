import { Anchor, Compass, Radio, Ship } from "lucide-react";

import type { CopilotContext } from "@/stores/copilot.store";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  CopilotContext["kind"],
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  investigation: { icon: Compass, label: "Investigation" },
  vessel: { icon: Ship, label: "Vessel" },
  port: { icon: Anchor, label: "Port" },
  case: { icon: Radio, label: "Case" },
};

/**
 * Context Bar — surfaces the active investigation/vessel/port so the
 * officer always knows what scope the Copilot is answering within.
 */
export function ContextBar({
  context,
  className,
}: {
  context: CopilotContext;
  className?: string;
}) {
  const meta = KIND_META[context.kind];
  const Icon = meta.icon;
  return (
    <div
      role="status"
      aria-label={`Active ${meta.label} context: ${context.label}`}
      className={cn(
        "flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[12px]",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">
        {meta.label}
      </span>
      <span className="truncate font-medium text-foreground">{context.label}</span>
      {context.detail ? (
        <span className="truncate text-muted-foreground">· {context.detail}</span>
      ) : null}
    </div>
  );
}
