/**
 * The map recommendation, surfaced.
 *
 * Phase 1.5 built the advisory engine and deliberately did not render
 * it. This is the UI, and it is bound by the same rule the engine
 * exists to enforce: the officer's map configuration is theirs.
 *
 * ## What this may and may not do
 *
 * It may say what the current lens would show. It may offer to add
 * those layers. It may be dismissed and forgotten.
 *
 * It may not apply anything on its own, it may not remove a layer the
 * officer chose, and it may not appear when their configuration already
 * satisfies the recommendation — a prompt that fires when nothing needs
 * doing is a prompt officers learn to dismiss without reading.
 *
 * ## Dismissal is per lens, not global
 *
 * Dismissing the Port Intelligence recommendation should not silence
 * Revenue Assurance's, because they are different suggestions about
 * different work. Keyed by mode id, held in component state: this is a
 * presentational preference, not something the institution needs to
 * remember.
 */
import { useState } from "react";
import { Layers, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sgs, useMapSelector } from "@/services/geospatial";

import { applyRecommendation, recommendMapLayers } from "./map-recommendation";
import type { MissionMode } from "./modes";

export function MapRecommendationNotice({
  mode,
  className,
}: {
  readonly mode: MissionMode;
  readonly className?: string;
}) {
  const activeCsv = useMapSelector((state) => state.activeLayers.join(","));
  const activeLayers = activeCsv ? activeCsv.split(",") : [];
  const [dismissed, setDismissed] = useState<readonly string[]>([]);

  const recommendation = recommendMapLayers(mode, activeLayers);

  // Nothing to suggest, or the officer has already waved this lens away.
  if (recommendation.satisfied || dismissed.includes(mode.id)) return null;

  return (
    <div
      data-testid="map-recommendation"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-surface-2 px-3 py-2",
        className,
      )}
    >
      <Layers className="h-3.5 w-3.5 shrink-0 text-slate" aria-hidden />
      <p className="min-w-0 flex-1 text-[11.5px] text-foreground">
        <span className="font-semibold">Recommended for {mode.label}</span>
        <span className="text-slate">
          {" — adds "}
          {/*
            Names the layers rather than counting them. "3 more layers"
            asks the officer to trust the suggestion; naming them lets
            them judge it, which is the difference between advice and an
            instruction with a button.
          */}
          {recommendation.missing.join(", ")}.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px]"
          data-testid="apply-recommended-view"
          onClick={() => sgs.setActiveLayers([...applyRecommendation(mode, activeLayers)])}
        >
          Apply recommended view
        </Button>
        <button
          type="button"
          aria-label={`Dismiss the ${mode.label} map recommendation`}
          data-testid="dismiss-recommendation"
          onClick={() => setDismissed((prev) => [...prev, mode.id])}
          className="flex h-6 w-6 items-center justify-center rounded text-slate transition-colors hover:bg-surface hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
