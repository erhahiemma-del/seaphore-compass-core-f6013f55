/**
 * Operating mode selector.
 *
 * Writes `OperatingMode` to SGS. Deliberately separate from the view-mode
 * control beside it: one chooses what the map is *for*, the other how it
 * draws. Presenting them as one control is what made the two concepts
 * blur before M3.
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OPERATING_MODES,
  OPERATING_MODE_DESCRIPTIONS,
  OPERATING_MODE_LABELS,
  sgs,
  useMapSelector,
  type OperatingMode,
} from "@/services/geospatial";

/**
 * Modes an officer switches to directly.
 *
 * REPLAY is reachable only by opening a replay — arriving there with no
 * recording loaded would present playback controls over nothing.
 */
const SELECTABLE: readonly OperatingMode[] = OPERATING_MODES.filter((mode) => mode !== "REPLAY");

export function OperatingModeBar({ className }: { className?: string }) {
  const mode = useMapSelector((state) => state.operatingMode);

  return (
    <div
      role="group"
      aria-label="Operating mode"
      data-testid="operating-mode-bar"
      className={cn("flex shrink-0 items-center gap-1 rounded-md bg-muted p-1", className)}
    >
      {SELECTABLE.map((candidate) => (
        <Button
          key={candidate}
          size="sm"
          variant={mode === candidate ? "default" : "ghost"}
          title={OPERATING_MODE_DESCRIPTIONS[candidate]}
          aria-pressed={mode === candidate}
          onClick={() => sgs.setOperatingMode(candidate)}
          className="h-7 px-2 text-[11px]"
        >
          {OPERATING_MODE_LABELS[candidate]}
        </Button>
      ))}

      {/* Shown only when active, so an officer in replay can see where they
          are without the mode being offered as an entry point. */}
      {mode === "REPLAY" ? (
        <Button
          size="sm"
          variant="default"
          aria-pressed
          className="h-7 px-2 text-[11px]"
          title={OPERATING_MODE_DESCRIPTIONS.REPLAY}
        >
          {OPERATING_MODE_LABELS.REPLAY}
        </Button>
      ) : null}
    </div>
  );
}
