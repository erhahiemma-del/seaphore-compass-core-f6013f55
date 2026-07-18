import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { useMapProvider } from "@/lib/maps";
import type { MapMarker, MapViewport } from "@/lib/maps/types";
import type { ConfidenceTier } from "@/lib/data-model/confidence";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { cn } from "@/lib/utils";

/**
 * Risk tier → OC-001 colour token.
 * Kept aligned with the Confidence Ladder + Risk palette defined in styles.css.
 */
const RISK_COLOR: Record<RiskTier, string> = {
  low: "#1E6B3A",
  medium: "#B06A00",
  high: "#C0392B",
  unknown: "#5A6B7B",
};

export type RiskTier = "low" | "medium" | "high" | "unknown";

export interface IntelMapEntity {
  id: string;
  /** Display kind — vessel, port, facility, incident. Drives icon glyph. */
  kind: "vessel" | "port" | "facility" | "incident";
  name: string;
  position: { lat: number; lng: number };
  risk?: RiskTier;
  confidence: ConfidenceTier;
  /** Optional short subtitle line (voyage, code, type). */
  subtitle?: string;
  /** Extra key/value rows shown in the tooltip. */
  meta?: Array<[string, string]>;
}

export interface IntelMapProps {
  entities: IntelMapEntity[];
  viewport?: MapViewport;
  className?: string;
  onSelect?: (entity: IntelMapEntity) => void;
  /** Fixed pixel height for the map surface. Defaults to 360. */
  height?: number;
}

const DEFAULT_VIEWPORT: MapViewport = {
  // Centre on the Gulf of Guinea / Nigerian coast.
  center: { lat: 5.6, lng: 5.4 },
  zoom: 1.6,
};

/**
 * Vendor-neutral Intelligence Centre map.
 *
 * Renders vessel / entity markers through whichever `MapProvider` is active
 * (mock SVG today, Google or Mapbox once keys are configured). Every marker
 * carries a Confidence chip in the tooltip — the map never asserts a position
 * without a signal source.
 */
export function IntelMap({
  entities,
  viewport = DEFAULT_VIEWPORT,
  className,
  onSelect,
  height = 360,
}: IntelMapProps) {
  const MapProvider = useMapProvider();
  const [selected, setSelected] = useState<IntelMapEntity | null>(null);

  const markers: MapMarker[] = useMemo(
    () =>
      entities.map((e) => ({
        id: e.id,
        position: e.position,
        label: e.kind === "port" ? e.name : undefined,
        color: RISK_COLOR[e.risk ?? "unknown"],
        radius: e.kind === "port" ? 8 : 6,
        onClick: () => {
          setSelected(e);
          onSelect?.(e);
        },
      })),
    [entities, onSelect],
  );

  const surfaceStyle: CSSProperties = { height };

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-line/60", className)} style={surfaceStyle}>
      <MapProvider viewport={viewport} markers={markers} className="absolute inset-0" />

      <MapLegend />

      {selected ? (
        <MarkerTooltip entity={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function MapLegend() {
  return (
    <div className="pointer-events-none absolute left-2 bottom-2 flex items-center gap-2 rounded bg-surface/80 px-2 py-1 text-[10.5px] text-slate backdrop-blur">
      <span className="text-foreground/80">Risk</span>
      {(["low", "medium", "high", "unknown"] as RiskTier[]).map((r) => (
        <span key={r} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: RISK_COLOR[r] }} />
          <span className="capitalize">{r}</span>
        </span>
      ))}
    </div>
  );
}

function MarkerTooltip({ entity, onClose }: { entity: IntelMapEntity; onClose: () => void }) {
  return (
    <div className="absolute right-2 top-2 w-64 rounded-md border border-line/70 bg-surface-2 p-3 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.06em] text-slate">{entity.kind}</div>
          <div className="truncate text-[13px] font-semibold text-foreground">{entity.name}</div>
          {entity.subtitle ? (
            <div className="truncate text-[11px] text-foreground/70">{entity.subtitle}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-slate hover:bg-surface-2/60 hover:text-foreground"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {entity.risk ? (
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
            style={{ background: `${RISK_COLOR[entity.risk]}22`, color: RISK_COLOR[entity.risk] }}
          >
            {entity.risk} risk
          </span>
        ) : null}
        <ConfidenceChip tier={entity.confidence} size={9} />
      </div>

      {entity.meta && entity.meta.length > 0 ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          {entity.meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate">{k}</dt>
              <dd className="truncate text-right font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-2 text-[10px] text-slate">
        {entity.position.lat.toFixed(2)}°, {entity.position.lng.toFixed(2)}°
      </div>
    </div>
  );
}
