/**
 * Maritime — Layer management panel.
 *
 * Mission-grouped layer controls with preset bundles, per the Live Map guide
 * G2 STEP 5. Reads the catalogue from the Layer Registry and writes toggles
 * back to the Shared Geospatial Service — it holds no layer state of its own,
 * so the panel, the URL, and the map can never disagree.
 */
import { Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  LAYER_GROUP_LABELS,
  MISSION_PRESETS,
  layerRegistry,
  sgs,
  useMapSelector,
  type LayerDefinition,
  type LayerRegistry,
  type SharedGeospatialService,
} from "@/services/geospatial";

export interface LayerPanelProps {
  readonly service?: SharedGeospatialService;
  readonly registry?: LayerRegistry;
}

export function LayerPanel({ service = sgs, registry = layerRegistry }: LayerPanelProps) {
  const activeLayers = useMapSelector((state) => state.activeLayers.join(","), service);
  const active = new Set(activeLayers ? activeLayers.split(",") : []);

  return (
    <aside
      aria-label="Map layers"
      className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Layers</h2>
        <span className="ml-auto text-xs text-muted-foreground">{active.size} on</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {registry.groups().map((group) => (
          <section key={group} className="border-b border-border/60 px-4 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {LAYER_GROUP_LABELS[group]}
            </h3>
            <ul className="space-y-2">
              {registry.byGroup(group).map((layer) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  checked={active.has(layer.id)}
                  onToggle={() => service.toggleLayer(layer.id)}
                />
              ))}
            </ul>
          </section>
        ))}
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

interface LayerRowProps {
  readonly layer: LayerDefinition;
  readonly checked: boolean;
  readonly onToggle: () => void;
}

function LayerRow({ layer, checked, onToggle }: LayerRowProps) {
  const pending = layer.status === "pending-source";
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
          {pending ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              No source
            </Badge>
          ) : null}
        </div>
        <p
          id={`layer-${layer.id}-description`}
          className="text-xs leading-snug text-muted-foreground"
        >
          {/* A pending layer explains itself rather than silently drawing nothing. */}
          {pending ? (layer.pendingReason ?? layer.description) : layer.description}
        </p>
      </div>
    </li>
  );
}
