/**
 * Maritime — Live Command Map shell.
 *
 * Composes the canvas, the layer panel, and the status strip. View-mode
 * labels follow the Command Edition (R7): officers choose an operational
 * purpose ("Operational View", "Terrain Perspective"), never a rendering
 * engine.
 */
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { sgs, useMapSelector, useMapSessionStore, type ViewMode } from "@/services/geospatial";

import { LayerPanel } from "./LayerPanel";
import { MapCanvas } from "./MapCanvas";

const VIEW_MODES: ReadonlyArray<{ mode: ViewMode; label: string; title: string }> = [
  { mode: "2D", label: "Operational View", title: "Overhead national picture" },
  {
    mode: "3D",
    label: "Terrain Perspective",
    title: "Terrain-level view — port approach, berth layout, vessel proximity",
  },
];

export function MaritimeCommand() {
  const viewMode = useMapSelector((state) => state.viewMode);

  // Hydrate shared state from the URL so a pasted link restores the view.
  useEffect(() => {
    sgs.loadFromURL();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-wide">Live Command Map</h1>
          <span className="text-xs text-muted-foreground">Gulf of Guinea · Nigerian EEZ</span>
        </div>

        <div
          role="group"
          aria-label="View mode"
          className="flex items-center gap-1 rounded-md bg-muted p-1"
        >
          {VIEW_MODES.map(({ mode, label, title }) => (
            <Button
              key={mode}
              size="sm"
              variant={viewMode === mode ? "default" : "ghost"}
              title={title}
              aria-pressed={viewMode === mode}
              onClick={() => sgs.switchView(mode)}
              className="h-7 text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {viewMode === "2D" ? <MapCanvas /> : <TerrainPerspectivePlaceholder />}
        </main>
        <LayerPanel />
      </div>

      <MapStatusBar />
    </div>
  );
}

/** The Terrain Perspective is delivered in G7; this states that honestly. */
function TerrainPerspectivePlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-[#0D1B2A]">
      <p className="text-sm text-muted-foreground">Terrain Perspective — delivered in G7</p>
    </div>
  );
}

function MapStatusBar() {
  const vesselCount = useMapSessionStore((s) => s.vesselCount);
  const rendererId = useMapSessionStore((s) => s.rendererId);
  const rendererStatus = useMapSessionStore((s) => s.rendererStatus);
  const lastError = useMapSessionStore((s) => s.lastError);
  const activeLayerCount = useMapSelector((state) => state.activeLayers.length);

  return (
    <footer className="flex shrink-0 items-center gap-4 border-t border-border px-6 py-2 text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground">{vesselCount}</span> vessels
      </span>
      <span>
        <span className="font-semibold text-foreground">{activeLayerCount}</span> layers
      </span>
      <span className="ml-auto font-mono">
        {rendererId ?? "no renderer"} · {rendererStatus}
      </span>
      {lastError ? <span className="text-destructive">{lastError}</span> : null}
    </footer>
  );
}
