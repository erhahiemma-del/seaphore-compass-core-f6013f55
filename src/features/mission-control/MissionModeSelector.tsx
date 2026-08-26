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
import { MISSION_MODES, MISSION_MODE_ORDER, type MissionModeId } from "./modes";

export interface MissionModeSelectorProps {
  readonly value: MissionModeId;
  readonly onChange: (mode: MissionModeId) => void;
  readonly className?: string;
}

export function MissionModeSelector({ value, onChange, className }: MissionModeSelectorProps) {
  return (
    <div className={className}>
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
    </div>
  );
}
