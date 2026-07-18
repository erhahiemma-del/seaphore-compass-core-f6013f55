import { Link } from "@tanstack/react-router";
import { ConfidenceChip } from "./ConfidenceChip";
import type { EntityKind } from "@/types/entity.types";

/**
 * EntityCard — canonical compact representation of any Seaphore entity.
 * Every entity surface uses this. Every card carries a confidence chip.
 */
export interface EntityCardProps {
  id: string;
  type: EntityKind;
  name: string;
  subline?: string;
  confidence?: "verified" | "observed" | "inferred" | "unconfirmed";
  onClick?: () => void;
}

export function EntityCard({ id, type, name, subline, confidence = "observed", onClick }: EntityCardProps) {
  const body = (
    <div className="flex items-start justify-between gap-3 rounded-md border border-line bg-surface-1 p-3 hover:bg-surface-2">
      <div className="min-w-0">
        <div className="type-label text-slate">{type}</div>
        <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
        {subline && <div className="truncate text-[11px] text-slate">{subline}</div>}
      </div>
      <ConfidenceChip tier={confidence} size={9} />
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {body}
      </button>
    );
  }
  return (
    <Link to="/entity/$id" params={{ id }} className="block">
      {body}
    </Link>
  );
}
