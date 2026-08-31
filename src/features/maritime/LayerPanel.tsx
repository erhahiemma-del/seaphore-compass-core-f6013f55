/**
 * Maritime — Layer management panel.
 *
 * Mission-grouped layer controls with search, per-layer opacity, group
 * enable/disable, and preset bundles. Reads the catalogue from the Layer
 * Registry and writes every change back to the Shared Geospatial Service — it
 * holds no layer state of its own, so the panel, the URL, and the map can never
 * disagree.
 */
import { useMemo, useState } from "react";

import { CAPABILITY_LABELS, isDrawing } from "@/services/geospatial/capability";
import type { RegistryCapability } from "@/services/registry/registry-capability";

import { useLayerCapabilities } from "./use-layer-capabilities";
import { Layers, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  LAYER_GROUP_LABELS,
  MISSION_PRESETS,
  layerRegistry,
  sgs,
  useMapSelector,
  type LayerDefinition,
  type LayerGroup,
  type LayerRegistry,
  type SharedGeospatialService,
} from "@/services/geospatial";

export interface LayerPanelProps {
  readonly service?: SharedGeospatialService;
  readonly registry?: LayerRegistry;
}

export function LayerPanel({ service = sgs, registry = layerRegistry }: LayerPanelProps) {
  const [query, setQuery] = useState("");

  // Subscribe to primitives, not objects: returning a new array or record from
  // a selector would re-render on every SGS tick regardless of change.
  const activeCsv = useMapSelector((state) => state.activeLayers.join(","), service);
  const opacityCsv = useMapSelector(
    (state) =>
      Object.entries(state.layerOpacity)
        .map(([id, value]) => `${id}:${value}`)
        .join(","),
    service,
  );

  const active = useMemo(() => new Set(activeCsv ? activeCsv.split(",") : []), [activeCsv]);
  const opacity = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of opacityCsv ? opacityCsv.split(",") : []) {
      const [id, raw] = entry.split(":");
      if (id) map.set(id, Number.parseFloat(raw ?? "1"));
    }
    return map;
  }, [opacityCsv]);

  const needle = query.trim().toLowerCase();
  const matches = (layer: LayerDefinition) =>
    needle === "" ||
    layer.label.toLowerCase().includes(needle) ||
    layer.description.toLowerCase().includes(needle) ||
    layer.id.toLowerCase().includes(needle);

  const visibleGroups = registry
    .groups()
    .map((group) => ({ group, layers: registry.byGroup(group).filter(matches) }))
    .filter((entry) => entry.layers.length > 0);

  return (
    <aside
      aria-label="Map layers"
      className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card"
    >
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Layers</h2>
          <span className="ml-auto text-xs text-muted-foreground">{active.size} on</span>
        </div>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search layers"
            aria-label="Search layers"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/*
          Providers are not on this panel.

          They led it — "what is feeding the map precedes how it is
          drawn" — which put provider counts, average freshness and
          credential state above the officer's layers on the primary map
          surface. The reasoning was sound and the placement was not: an
          officer opening Layers wants to choose what is drawn, and a
          feed's health is a question they ask in Data Sources. The
          section itself is unchanged and still serves that environment.
        */}
        {visibleGroups.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No layers match “{query}”.
          </p>
        ) : (
          visibleGroups.map(({ group, layers }) => (
            <LayerGroupSection
              key={group}
              group={group}
              layers={layers}
              active={active}
              opacity={opacity}
              service={service}
            />
          ))
        )}
      </div>

      <footer className="border-t border-border px-4 py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mission Presets
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {MISSION_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              title={preset.description}
              onClick={() => service.applyPreset(preset.id)}
              className="h-auto whitespace-normal py-1.5 text-xs leading-tight"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </footer>
    </aside>
  );
}

interface LayerGroupSectionProps {
  readonly group: LayerGroup;
  readonly layers: readonly LayerDefinition[];
  readonly active: ReadonlySet<string>;
  readonly opacity: ReadonlyMap<string, number>;
  readonly service: SharedGeospatialService;
}

function LayerGroupSection({ group, layers, active, opacity, service }: LayerGroupSectionProps) {
  /*
   * Derived status for the registry-backed layers, resolved where the
   * rows are rendered. Layers whose obstacle is a licence or a credential
   * keep their declared status, because no code can observe an agreement.
   */
  const { byLayer: capabilities } = useLayerCapabilities();
  const allOn = layers.every((layer) => active.has(layer.id));
  const noneOn = layers.every((layer) => !active.has(layer.id));

  function setGroup(enabled: boolean) {
    const next = new Set(active);
    for (const layer of layers) {
      if (enabled) next.add(layer.id);
      else next.delete(layer.id);
    }
    service.setActiveLayers([...next]);
  }

  return (
    <section className="border-b border-border/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {LAYER_GROUP_LABELS[group]}
        </h3>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            disabled={allOn}
            onClick={() => setGroup(true)}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40"
          >
            All
          </button>
          <span className="text-[10px] text-muted-foreground/50">·</span>
          <button
            type="button"
            disabled={noneOn}
            onClick={() => setGroup(false)}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40"
          >
            None
          </button>
        </div>
      </div>
      <ul className="space-y-2.5">
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            checked={active.has(layer.id)}
            opacity={opacity.get(layer.id) ?? 1}
            onToggle={() => service.toggleLayer(layer.id)}
            onOpacity={(value) => service.setLayerOpacity(layer.id, value)}
            capability={capabilities.get(layer.id) ?? null}
          />
        ))}
      </ul>
    </section>
  );
}

interface LayerRowProps {
  /** Derived capability, when this layer has one. Declared status otherwise. */
  readonly capability: RegistryCapability | null;
  readonly layer: LayerDefinition;
  readonly checked: boolean;
  readonly opacity: number;
  readonly onToggle: () => void;
  readonly onOpacity: (value: number) => void;
}

function LayerRow({ layer, capability, checked, opacity, onToggle, onOpacity }: LayerRowProps) {
  /*
   * Three states, not two.
   *
   * "Unavailable" means no source holds the data — a statement about the
   * world. "Not yet drawn" means Seaphore has the data and has not built
   * the layer — a statement about the backlog. Both used to render as
   * Unavailable, which told officers a capability was impossible when it
   * was merely unbuilt, and let a stale status survive unnoticed for as
   * long as nobody re-checked it.
   */
  /*
   * A derived capability wins over the declared one.
   *
   * The declared status is a field somebody typed; the derived status is
   * counted from the dataset and the renderer's install list. Where both
   * exist the derived one is the only one that cannot go stale, so it is
   * the one an officer sees.
   */
  const derived = capability?.status ?? null;
  const badge = derived
    ? isDrawing(derived)
      ? null
      : CAPABILITY_LABELS[derived]
    : layer.status === "data-available"
      ? "Not yet drawn"
      : layer.status === "pending-source"
        ? "Unavailable"
        : null;

  /* The explanation follows the same precedence as the badge. */
  const explanation = derived
    ? isDrawing(derived)
      ? layer.description
      : (capability?.detail ?? layer.description)
    : layer.status === "pending-source" || layer.status === "data-available"
      ? (layer.pendingReason ?? layer.description)
      : layer.description;
  return (
    <li className="flex items-start gap-3">
      <Switch
        id={`layer-${layer.id}`}
        checked={checked}
        onCheckedChange={onToggle}
        aria-describedby={`layer-${layer.id}-description`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label htmlFor={`layer-${layer.id}`} className="cursor-pointer text-sm font-medium">
            {layer.label}
          </label>
          {badge ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              {badge}
            </Badge>
          ) : null}
        </div>
        <p
          id={`layer-${layer.id}-description`}
          className="text-xs leading-snug text-muted-foreground"
        >
          {/* A layer that is not drawing explains itself rather than sitting silent. */}
          {explanation}
        </p>
        {checked ? (
          <div className="mt-1.5 flex items-center gap-2">
            {/* Native range input: keyboard-operable and screen-reader labelled
                without pulling in another control. */}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => onOpacity(Number.parseFloat(event.target.value))}
              aria-label={`${layer.label} opacity`}
              className="h-1 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">
              {Math.round(opacity * 100)}%
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}
