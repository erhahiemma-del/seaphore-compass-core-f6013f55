/**
 * Maritime — Live Command Map shell.
 *
 * Composes the toolbar, canvas, layer panel, intelligence card, and status
 * strip. View-mode labels follow the Command Edition (R7): officers choose an
 * operational purpose ("Operational View", "Terrain Perspective"), never a
 * rendering engine.
 *
 * Every toolbar action writes to SGS rather than reaching into the renderer, so
 * the camera has exactly one owner and the URL stays in step.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
  Camera as ScreenshotIcon,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MAP_DEFAULTS,
  sgs,
  useMapSelector,
  useMapSessionStore,
  type Vessel,
  type ViewMode,
} from "@/services/geospatial";

import { LayerPanel } from "./LayerPanel";
import { MapCanvas } from "./MapCanvas";
import { VesselIntelligenceCard } from "./VesselIntelligenceCard";

const VIEW_MODES: ReadonlyArray<{ mode: ViewMode; label: string; title: string }> = [
  { mode: "2D", label: "Operational View", title: "Overhead national picture" },
  {
    mode: "3D",
    label: "Terrain Perspective",
    title: "Terrain-level view — port approach, berth layout, vessel proximity",
  },
];

/** Centre and zoom that frame Nigeria and its maritime approaches. */
const NIGERIA_VIEW = { center: [5.7, 4.35] as const, zoom: 6 };

export function MaritimeCommand() {
  const viewMode = useMapSelector((state) => state.viewMode);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // Hydrate shared state from the URL so a pasted link restores the view.
  useEffect(() => {
    sgs.loadFromURL();
  }, []);

  const handleSelected = useCallback((vessel: Vessel | null) => {
    setSelectedVessel(vessel);
  }, []);

  const closeCard = useCallback(() => {
    sgs.clearSelection();
    setSelectedVessel(null);
  }, []);

  return (
    <div ref={shellRef} className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-wide">Live Command Map</h1>
          <span className="truncate text-xs text-muted-foreground">
            Gulf of Guinea · Nigerian EEZ
          </span>
        </div>

        <CommandToolbar
          shellRef={shellRef}
          hasSelection={selectedVessel !== null}
          onFitSelection={() => {
            if (!selectedVessel) return;
            sgs.setCamera({
              center: [selectedVessel.position.lon, selectedVessel.position.lat],
              zoom: 10,
            });
          }}
          onClearSelection={closeCard}
        />

        <div
          role="group"
          aria-label="View mode"
          className="flex shrink-0 items-center gap-1 rounded-md bg-muted p-1"
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
          {viewMode === "2D" ? (
            <MapCanvas onVesselSelected={handleSelected} />
          ) : (
            <TerrainPerspectivePlaceholder />
          )}
        </main>
        {selectedVessel ? (
          <VesselIntelligenceCard vessel={selectedVessel} onClose={closeCard} />
        ) : null}
        <LayerPanel />
      </div>

      <MapStatusBar />
    </div>
  );
}

interface CommandToolbarProps {
  readonly shellRef: React.RefObject<HTMLDivElement | null>;
  readonly hasSelection: boolean;
  readonly onFitSelection: () => void;
  readonly onClearSelection: () => void;
}

function CommandToolbar({
  shellRef,
  hasSelection,
  onFitSelection,
  onClearSelection,
}: CommandToolbarProps) {
  const zoom = useMapSelector((state) => state.zoom);

  const toggleFullscreen = useCallback(() => {
    const element = shellRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.();
  }, [shellRef]);

  return (
    <div role="toolbar" aria-label="Map commands" className="flex items-center gap-0.5">
      <ToolButton
        label="Zoom in"
        disabled={zoom >= MAP_DEFAULTS.maxZoom}
        onClick={() => sgs.setCamera({ zoom: Math.min(MAP_DEFAULTS.maxZoom, zoom + 1) })}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton
        label="Zoom out"
        disabled={zoom <= MAP_DEFAULTS.minZoom}
        onClick={() => sgs.setCamera({ zoom: Math.max(MAP_DEFAULTS.minZoom, zoom - 1) })}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton
        label="Locate Nigeria"
        onClick={() =>
          sgs.setCamera({
            center: [NIGERIA_VIEW.center[0], NIGERIA_VIEW.center[1]],
            zoom: NIGERIA_VIEW.zoom,
          })
        }
      >
        <Crosshair className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Fit to selection" disabled={!hasSelection} onClick={onFitSelection}>
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Clear selection" disabled={!hasSelection} onClick={onClearSelection}>
        <XCircle className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Reset view" onClick={() => sgs.reset()}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Fullscreen" onClick={toggleFullscreen}>
        <Maximize2 className="h-3.5 w-3.5 rotate-90" aria-hidden />
      </ToolButton>
      {/* Measure and screenshot are declared but not yet implemented; they are
          disabled with an explanation rather than shown as working controls. */}
      <ToolButton label="Measure distance — not yet available" disabled>
        <Ruler className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Screenshot — not yet available" disabled>
        <ScreenshotIcon className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
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
  const fps = useMapSessionStore((s) => s.fps);
  const lastError = useMapSessionStore((s) => s.lastError);
  const activeLayerCount = useMapSelector((state) => state.activeLayers.length);

  return (
    <footer className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
      <Stat label="vessels" value={String(vesselCount)} />
      <Stat label="layers" value={String(activeLayerCount)} />
      <Stat label="fps" value={fps === null ? "—" : String(fps)} />
      <span className="ml-auto font-mono">
        {rendererId ?? "no renderer"} · {rendererStatus}
      </span>
      {lastError ? (
        <span className="max-w-xs truncate text-destructive" title={lastError}>
          {lastError}
        </span>
      ) : null}
    </footer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}
