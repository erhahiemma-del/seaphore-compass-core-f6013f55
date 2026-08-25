/**
 * Mission mode selector.
 *
 * Eight lenses over one surface. Deliberately a compact segmented
 * control rather than tabs: tabs imply separate pages, and the whole
 * point of the mode engine is that there is one Mission Control and one
 * set of state behind every perspective.
 *
 * It renders the mode table and reports a choice. It holds no
 * intelligence, reads no coverage and fetches nothing — which is what
 * keeps switching a lens from being able to change a number.
 */
import { cn } from "@/lib/utils";
import { MISSION_MODES, MISSION_MODE_ORDER, type MissionMode, type MissionModeId } from "./modes";

export interface MissionModeSelectorProps {
  readonly value: MissionModeId;
  readonly onChange: (mode: MissionModeId) => void;
  readonly className?: string;
}

export function MissionModeSelector({ value, onChange, className }: MissionModeSelectorProps) {
  const active: MissionMode = MISSION_MODES[value];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        role="tablist"
        aria-label="Mission mode"
        data-testid="mission-mode-selector"
        className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1"
      >
        {MISSION_MODE_ORDER.map((id) => {
          const mode = MISSION_MODES[id];
          const selected = id === value;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`mission-mode-${id}`}
              // The purpose, not a restatement of the label — a tooltip
              // that repeats the button text teaches nothing.
              title={mode.purpose}
              onClick={() => onChange(id)}
              className={cn(
                "rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      {/*
        One quiet line saying what the active lens is for. The officer
        should never have to guess why the panels rearranged, and a
        selector that changes the layout without explaining itself reads
        as instability rather than intent.
      */}
      <p data-testid="mission-mode-purpose" className="px-1 text-[11px] text-muted-foreground">
        {active.purpose}
      </p>
    </div>
  );
}
