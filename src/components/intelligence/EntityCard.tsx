import { Link } from "@tanstack/react-router";
import { ConfidenceChip } from "./ConfidenceChip";
import type { EntityKind } from "@/types/entity.types";

type ConfidenceTier = "verified" | "observed" | "inferred" | "unconfirmed";

/** Build Bible base entity shape. */
export interface BaseEntity {
  id: string;
  type: EntityKind;
  name: string;
  subline?: string;
  confidence?: ConfidenceTier;
}

/**
 * EntityCard — canonical compact representation of any Seaphore entity.
 * Accepts both the Build Bible `entity` object and legacy flat props.
 */
export interface EntityCardProps {
  /** Build Bible: entity object. */
  entity?: BaseEntity;
  /** Build Bible: compact layout. */
  compact?: boolean;
  /** @deprecated Use `entity.id`. */
  id?: string;
  /** @deprecated Use `entity.type`. */
  type?: EntityKind;
  /** @deprecated Use `entity.name`. */
  name?: string;
  /** @deprecated Use `entity.subline`. */
  subline?: string;
  /** @deprecated Use `entity.confidence`. */
  confidence?: ConfidenceTier;
  /** Optional click handler; receives entity id. */
  onClick?: ((id: string) => void) | (() => void);
}

export function EntityCard(props: EntityCardProps) {
  const e: BaseEntity = props.entity ?? {
    id: props.id ?? "",
    type: (props.type ?? "vessel") as EntityKind,
    name: props.name ?? "",
    subline: props.subline,
    confidence: props.confidence,
  };
  const confidence = e.confidence ?? "observed";
  const compact = props.compact ?? false;
  const body = (
    <div
      className={cnJoin(
        "flex items-start justify-between gap-3 rounded-md border border-line bg-surface-1 hover:bg-surface-2",
        compact ? "p-2" : "p-3",
      )}
    >
      <div className="min-w-0">
        <div className="type-label text-slate">{e.type}</div>
        <div className="truncate text-[13px] font-semibold text-foreground">{e.name}</div>
        {e.subline && <div className="truncate text-[11px] text-slate">{e.subline}</div>}
      </div>
      <ConfidenceChip tier={confidence} size={9} />
    </div>
  );
  if (props.onClick) {
    const handler = () => (props.onClick as (id: string) => void)(e.id);
    return (
      <button type="button" onClick={handler} className="block w-full text-left">
        {body}
      </button>
    );
  }
  return (
    <Link to="/entity/$id" params={{ id: e.id }} className="block">
      {body}
    </Link>
  );
}

function cnJoin(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

