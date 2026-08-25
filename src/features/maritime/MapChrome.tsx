/**
 * Maritime — map chrome (layer chips, control stack, legend bar).
 *
 * Presentation and interaction only. Every control here writes through the
 * existing Shared Geospatial Service and the existing layer registry: there is
 * no second map, no second layer store and no second camera. A chip, a legend
 * dot and the Layers popover all mutate the same `activeLayers` set, so the
 * three can never disagree with what the renderer drew.
 *
 * Layers that have no connected provider stay visible and are marked
 * "no source" — an officer must never read an absent feed as empty water.
 */
import { useMemo, useState } from "react";

import { MAP_SYMBOLS, MAP_SYMBOL_GRID, type MapSymbolKind } from "@/lib/map-symbols";
import {
  AlertTriangle,
  Anchor,
  Cloud,
  Crosshair,
  Layers,
  Boxes,
  Minus,
  Plus,
  Route,
  Ship,
  Box,
  MoreHorizontal,
  Globe2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  MAP_SCOPES,
  layerRegistry,
  sgs,
  useMapSelector,
  type MapScopeId,
  type SharedGeospatialService,
} from "@/services/geospatial";

/* ------------------------------------------------------------------ */
/* Chip → registry layer mapping                                       */
/* ------------------------------------------------------------------ */

interface ChipDefinition {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Registry layer ids this chip governs. Empty means "the whole picture". */
  readonly layers: readonly string[];
}

/**
 * The geographic frame that never leaves.
 *
 * Land, sea and the national maritime space are true whether or not any
 * intelligence feed answers, so no chip may switch them off.
 */
const FRAME_LAYERS = ["graticule", "eezBoundary"] as const;

const CHIPS: readonly ChipDefinition[] = [
  { id: "vessels", label: "Vessels", icon: Ship, layers: ["vessels", "vesselClusters"] },
  { id: "ports", label: "Ports", icon: Anchor, layers: ["ports"] },
  { id: "routes", label: "Routes", icon: Route, layers: ["voyages", "aisTrack"] },
  { id: "zones", label: "Zones", icon: Box, layers: ["eezBoundary", "investigArea"] },
  {
    id: "incidents",
    label: "Incidents",
    icon: AlertTriangle,
    layers: ["darkContactAreas", "sarDetections"],
  },
  { id: "weather", label: "Weather", icon: Cloud, layers: ["weather"] },
  { id: "traffic", label: "Traffic Density", icon: Boxes, layers: ["riskHeatmap", "revenueHeat"] },
];

/** Layers not surfaced by a chip, offered through the overflow control. */
const CHIP_LAYER_IDS = new Set(CHIPS.flatMap((chip) => chip.layers));

function useActiveLayers(service: SharedGeospatialService): ReadonlySet<string> {
  const csv = useMapSelector((state) => state.activeLayers.join(","), service);
  return useMemo(() => new Set(csv ? csv.split(",") : []), [csv]);
}

/** Only ids the registry actually knows — SGS ignores the rest anyway. */
function known(ids: readonly string[]): readonly string[] {
  return ids.filter((id) => layerRegistry.has(id));
}

export interface MapLayerChipsProps {
  readonly service?: SharedGeospatialService;
  readonly className?: string;
}

/**
 * Top-of-map layer/filter row.
 *
 * "All" restores the overall picture; a named chip emphasises its family by
 * making it — plus the geographic frame — the active set, which is what an
 * officer means by "show me incidents".
 */
export function MapLayerChips({ service = sgs, className }: MapLayerChipsProps) {
  const active = useActiveLayers(service);
  const frame = known([...FRAME_LAYERS]);
  /** Every layer any chip governs — what "All" turns on together. */
  const everything = [...new Set([...frame, ...CHIPS.flatMap((chip) => known(chip.layers))])];

  /**
   * "All" is the overall maritime view: every available layer drawn at once.
   * A chip is *on* when any of its own layers is drawn, so a family with one
   * connected provider and one pending source still reads as shown — but only
   * while the officer is looking at a subset rather than the whole picture.
   */
  const isAll = everything.every((id) => active.has(id));

  function emphasise(chip: ChipDefinition) {
    const own = known(chip.layers);
    if (own.length === 0) return;
    if (!isAll && own.some((id) => active.has(id))) {
      // Toggling off leaves the geographic frame standing.
      service.setActiveLayers([
        ...new Set([...frame, ...[...active].filter((id) => !own.includes(id))]),
      ]);
      return;
    }
    // From "All", a chip narrows to that family plus the frame.
    const from = isAll ? frame : [...frame, ...active];
    service.setActiveLayers([...new Set([...from, ...own])]);
  }

  return (
    <div
      data-testid="map-layer-chips"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <Chip
        icon={Globe2}
        label="All"
        active={isAll}
        onClick={() => service.setActiveLayers(everything)}
      />
      {CHIPS.map((chip) => {
        const own = known(chip.layers);
        const on = !isAll && own.some((id) => active.has(id));
        const pending =
          own.length > 0 && own.every((id) => layerRegistry.get(id)?.status === "pending-source");
        return (
          <Chip
            key={chip.id}
            icon={chip.icon}
            label={chip.label}
            active={on}
            pending={pending}
            onClick={() => emphasise(chip)}
          />
        );
      })}
      <MoreLayers service={service} active={active} />
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  active,
  pending = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-layer-chip={label}
      title={pending ? `${label} — no source connected` : label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
        active
          ? "border-transparent bg-[#2E7DF0] text-white shadow-[0_4px_10px_-3px_rgba(46,125,240,0.55)] hover:bg-[#2571e2]"
          : "border-[#DCE4ED] bg-background text-[#334A63] shadow-sm hover:bg-accent",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
      {pending ? (
        <span
          className={cn(
            "ml-0.5 h-1.5 w-1.5 rounded-full",
            active ? "bg-white/70" : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

/** Overflow: every registry layer not represented by a chip. */
function MoreLayers({
  service,
  active,
}: {
  service: SharedGeospatialService;
  active: ReadonlySet<string>;
}) {
  const rest = layerRegistry.list().filter((layer) => !CHIP_LAYER_IDS.has(layer.id));
  if (rest.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="More layers"
          className="inline-flex items-center rounded-lg border border-border/70 bg-background px-2 py-1.5 text-foreground/80 shadow-sm hover:bg-accent"
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <LayerList service={service} active={active} layers={rest} />
      </PopoverContent>
    </Popover>
  );
}

function LayerList({
  service,
  active,
  layers,
}: {
  service: SharedGeospatialService;
  active: ReadonlySet<string>;
  layers: readonly { id: string; label: string; status: string; pendingReason?: string }[];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {layers.map((layer) => (
        <li key={layer.id} className="flex items-start gap-2.5">
          <Switch
            id={`chrome-layer-${layer.id}`}
            checked={active.has(layer.id)}
            onCheckedChange={() => service.toggleLayer(layer.id)}
          />
          <div className="min-w-0">
            <label
              htmlFor={`chrome-layer-${layer.id}`}
              className="cursor-pointer text-[12px] font-medium"
            >
              {layer.label}
            </label>
            {layer.status === "pending-source" ? (
              <p className="text-[10.5px] leading-snug text-muted-foreground">
                No source connected — absence is not evidence of absence.
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Left control stack                                                  */
/* ------------------------------------------------------------------ */

export interface MapControlStackProps {
  readonly service?: SharedGeospatialService;
  /** Scope whose extent the fit control returns to. */
  readonly scope?: MapScopeId;
  readonly className?: string;
}

/**
 * Zoom, layers, fit-extent and perspective.
 *
 * Perspective drives the existing 2D/3D view mode and the existing camera
 * pitch — MapLibre moves the actual camera; nothing here fakes depth.
 */
export function MapControlStack({
  service = sgs,
  scope = "regional",
  className,
}: MapControlStackProps) {
  const zoom = useMapSelector((state) => state.zoom, service);
  const viewMode = useMapSelector((state) => state.viewMode, service);
  const active = useActiveLayers(service);
  const definition = MAP_SCOPES[scope];

  return (
    <div
      data-testid="map-control-stack"
      className={cn("pointer-events-auto flex flex-col gap-2", className)}
    >
      <div className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-md">
        <ControlButton
          label="Zoom in"
          icon={Plus}
          onClick={() => service.setCamera({ zoom: Math.min(definition.maxZoom, zoom + 0.75) })}
        />
        <div className="h-px bg-border/70" />
        <ControlButton
          label="Zoom out"
          icon={Minus}
          onClick={() => service.setCamera({ zoom: Math.max(definition.minZoom, zoom - 0.75) })}
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Layer control"
            title="Layers"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-background text-[color:var(--color-navy,#0B3B75)] shadow-md hover:bg-accent"
          >
            <Layers className="h-4 w-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="right"
          className="max-h-[60vh] w-72 overflow-y-auto p-2"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Layers
          </p>
          <LayerList service={service} active={active} layers={layerRegistry.list()} />
        </PopoverContent>
      </Popover>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-md">
        <ControlButton
          label="Fit operational extent"
          icon={Crosshair}
          onClick={() =>
            service.setCamera({
              center: [definition.center[0], definition.center[1]],
              zoom: definition.zoom,
              pitch: 0,
              bearing: 0,
            })
          }
        />
        <div className="h-px bg-border/70" />
        <ControlButton
          label={viewMode === "3D" ? "Return to 2D operational view" : "Terrain perspective (3D)"}
          icon={Globe2}
          pressed={viewMode === "3D"}
          onClick={() => {
            const next = viewMode === "3D" ? "2D" : "3D";
            service.switchView(next);
            // The real MapLibre camera — the existing pitch pathway, not CSS.
            service.setCamera({ pitch: next === "3D" ? 50 : 0 });
          }}
        />
      </div>
    </div>
  );
}

function ControlButton({
  label,
  icon: Icon,
  onClick,
  pressed,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "flex h-8 w-8 items-center justify-center transition-colors",
        pressed
          ? "bg-[color:var(--color-navy,#0B3B75)] text-white"
          : "text-[color:var(--color-navy,#0B3B75)] hover:bg-accent",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom legend bar                                                   */
/* ------------------------------------------------------------------ */

interface LegendEntry {
  readonly kind: MapSymbolKind;
  readonly layers: readonly string[];
}

/**
 * Legend entries, in operational order.
 *
 * Shape and colour come from `MAP_SYMBOLS` — the same tokens the map
 * sprites are drawn from — so the legend is never styled independently.
 */
const LEGEND: readonly LegendEntry[] = [
  { kind: "vessel", layers: ["vessels"] },
  { kind: "port", layers: ["ports"] },
  { kind: "anchorage", layers: ["ports"] },
  { kind: "incident", layers: ["darkContactAreas"] },
  { kind: "restricted-zone", layers: ["investigArea"] },
  { kind: "weather-alert", layers: ["weather"] },
];

export interface MapLegendBarProps {
  readonly service?: SharedGeospatialService;
  readonly className?: string;
}

/**
 * Dark operational legend strip.
 *
 * Each entry toggles the layer it stands for, so the legend is the same
 * control surface as the chips rather than a caption.
 */
export function MapLegendBar({ service = sgs, className }: MapLegendBarProps) {
  const active = useActiveLayers(service);

  return (
    <div
      data-testid="map-legend-bar"
      className={cn(
        "pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-[#0B2350] px-4 py-2 shadow-[0_10px_24px_-10px_rgba(6,22,48,0.7)] ring-1 ring-white/10",
        className,
      )}
    >
      {LEGEND.map((entry) => {
        const token = MAP_SYMBOLS[entry.kind];
        const own = known(entry.layers);
        const on = own.length > 0 && own.every((id) => active.has(id));
        const pending = own.every((id) => layerRegistry.get(id)?.status === "pending-source");
        return (
          <button
            key={entry.kind}
            type="button"
            aria-pressed={on}
            data-legend-item={token.label}
            title={
              pending
                ? `${token.label} — no source connected`
                : `${on ? "Hide" : "Show"} ${token.label}`
            }
            onClick={() => {
              if (own.length === 0) return;
              if (on) service.setActiveLayers([...active].filter((id) => !own.includes(id)));
              else service.setActiveLayers([...new Set([...active, ...own])]);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-medium transition-opacity",
              on ? "text-white" : "text-white/55",
            )}
          >
            <LegendGlyph kind={entry.kind} />
            <span className="whitespace-nowrap">{token.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Legend glyph — the map symbol, redrawn as inline SVG.
 *
 * The map sprites are `ImageData` built for MapLibre and cannot be used
 * as DOM images, so the geometry is shared through `MAP_SYMBOLS` instead
 * of duplicated here.
 */
function LegendGlyph({ kind }: { kind: MapSymbolKind }) {
  const token = MAP_SYMBOLS[kind];
  return (
    <svg
      viewBox={`0 0 ${MAP_SYMBOL_GRID} ${MAP_SYMBOL_GRID}`}
      className="h-3.5 w-3.5 shrink-0"
      data-legend-glyph={kind}
      aria-hidden
    >
      {token.outlined ? (
        <path
          d={token.path}
          fill="none"
          stroke={token.color}
          strokeWidth={1.8}
          strokeLinejoin="round"
          {...(token.dashed ? { strokeDasharray: "3 2" } : {})}
        />
      ) : (
        <path d={token.path} fill={token.color} />
      )}
      {token.detail ? <path d={token.detail} fill={token.detailColor ?? "#FFFFFF"} /> : null}
    </svg>
  );
}
