import { Anchor, Building2, Flag, Ship, User } from "lucide-react";
import type { ReactNode } from "react";
import type { EntityCardData } from "./types";

interface Props {
  entity: EntityCardData;
  onOpen?: (entity: EntityCardData) => void;
}

const RISK_CLASS: Record<NonNullable<EntityCardData["riskTier"]>, string> = {
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function TypeIcon({ type }: { type: EntityCardData["type"] }): ReactNode {
  const cls = "h-4 w-4";
  switch (type) {
    case "vessel":
      return <Ship className={cls} aria-hidden />;
    case "port":
      return <Anchor className={cls} aria-hidden />;
    case "person":
      return <User className={cls} aria-hidden />;
    default:
      return <Building2 className={cls} aria-hidden />;
  }
}

export function EntityCard({ entity, onOpen }: Props) {
  const clickable = Boolean(onOpen);
  const Wrapper = clickable ? "button" : "div";
  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onOpen?.(entity) : undefined}
      aria-label={`Entity: ${entity.name}`}
      className={`group flex w-full flex-col gap-2 rounded-md border bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        clickable ? "hover:border-primary/60 hover:bg-muted/40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-muted text-muted-foreground">
            <TypeIcon type={entity.type} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{entity.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {entity.type}
              {entity.role ? ` · ${entity.role}` : ""}
            </p>
          </div>
        </div>
        {entity.riskTier && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${RISK_CLASS[entity.riskTier]}`}
          >
            {entity.riskTier}
          </span>
        )}
      </div>

      {entity.identifiers && entity.identifiers.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {entity.identifiers.map((i) => (
            <div key={`${i.label}-${i.value}`} className="flex items-baseline gap-1">
              <dt className="text-muted-foreground">{i.label}:</dt>
              <dd className="truncate font-medium text-foreground">{i.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(entity.flag || entity.lastSeen) && (
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          {entity.flag && (
            <span className="flex items-center gap-1">
              <Flag className="h-3 w-3" aria-hidden />
              {entity.flag}
            </span>
          )}
          {entity.lastSeen && <span>Last seen {entity.lastSeen}</span>}
        </div>
      )}

      {entity.summary && <p className="text-xs text-muted-foreground">{entity.summary}</p>}
    </Wrapper>
  );
}
