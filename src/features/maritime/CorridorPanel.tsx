/**
 * Corridor controls (Phase 4C).
 *
 * A lens control: which corridor layers are drawn, and whether the
 * indicative transit markers travel. It states what a corridor is before
 * it offers a toggle, because an arc between two ports is the easiest mark
 * on this map to read as a recorded voyage.
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CORRIDOR_CLASS_LABEL,
  corridorColour,
  type CorridorLayerDefinition,
} from "@/services/geospatial/maritime-corridors";
import type { MaritimeCorridorState } from "./useMaritimeCorridors";

function swatch(layer: CorridorLayerDefinition): string | null {
  const [first] = layer.classes;
  return first ? corridorColour(first) : null;
}

export function CorridorPanel({
  corridors,
  className,
}: {
  readonly corridors: MaritimeCorridorState;
  readonly className?: string;
}) {
  return (
    <div
      data-testid="corridor-panel"
      className={cn(
        "flex flex-col gap-2 border-b border-border/70 bg-card/60 px-3 py-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Maritime corridors
        </span>
        <Button
          size="sm"
          variant={corridors.animating ? "default" : "outline"}
          className="h-6 px-2 text-[11px]"
          data-testid="corridor-animation-toggle"
          aria-pressed={corridors.animating}
          onClick={corridors.toggleAnimation}
        >
          {corridors.animating ? "Pause transits" : "Play transits"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1" aria-label="Corridor layers">
        {corridors.layers.map((layer) => {
          const active = corridors.isLayerVisible(layer.id);
          const colour = swatch(layer);
          return (
            <Button
              key={layer.id}
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-6 gap-1.5 px-2 text-[11px]"
              data-testid={`corridor-layer-${layer.id}`}
              aria-pressed={active}
              title={layer.description}
              onClick={() => corridors.toggleLayer(layer.id)}
            >
              {colour ? (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: colour }}
                />
              ) : null}
              {layer.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {(Object.keys(CORRIDOR_CLASS_LABEL) as (keyof typeof CORRIDOR_CLASS_LABEL)[]).map((key) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="h-1.5 w-3 rounded-full"
              style={{ backgroundColor: corridorColour(key) }}
            />
            {CORRIDOR_CLASS_LABEL[key]}
          </span>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground" data-testid="corridor-provenance">
        {corridors.note}
        {corridors.reducedMotion ? " Motion is reduced, so transit markers are held still." : ""}
      </p>
    </div>
  );
}
