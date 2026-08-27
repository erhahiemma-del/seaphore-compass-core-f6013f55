/**
 * Presentation mode chooser.
 *
 * Three ways of lighting the same map, for three working conditions: a
 * lit room, a darkened one, and a night watch where screen glare carries
 * onto the bridge. None of them changes what is observed — this is the
 * one control on the rail whose whole subject is how the picture looks.
 *
 * Selecting a mode writes `MapState.presentationMode`. The renderer swaps
 * the basemap document on the mounted map and reinstalls the operational
 * layers over it, so the camera, the selection and the officer's filters
 * all survive. Changing the lighting must not cost them their place.
 */
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRESENTATION_MODES, paletteFor } from "@/services/geospatial/constants";
import { sgs, useMapSelector, type SharedGeospatialService } from "@/services/geospatial";

export function MapStyleDrawer({ service = sgs }: { service?: SharedGeospatialService }) {
  const current = useMapSelector((state) => state.presentationMode, service);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        How the map is lit. Nothing about what it shows.
      </p>
      <ul className="space-y-1">
        {PRESENTATION_MODES.map((mode) => {
          const selected = mode.id === current;
          const palette = paletteFor(mode.id);
          return (
            <li key={mode.id}>
              <button
                type="button"
                data-testid={`style-${mode.id}`}
                data-selected={selected}
                aria-pressed={selected}
                onClick={() => service.setPresentationMode(mode.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]",
                  selected
                    ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]/5"
                    : "border-transparent hover:bg-muted/60",
                )}
              >
                {/*
                  The swatch is drawn from the mode's own palette rather
                  than from a hard-coded pair, so a mode cannot advertise
                  colours the map will not use.
                */}
                <span
                  aria-hidden
                  className="h-8 w-8 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10"
                  style={{ background: palette.ocean }}
                >
                  <span className="block h-1/2 w-full" style={{ background: palette.land }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{mode.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {mode.description}
                  </span>
                </span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0 text-[color:var(--color-blue)]" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
