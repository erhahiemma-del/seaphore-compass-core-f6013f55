/**
 * The operational legend — a key to what is on the map right now.
 *
 * Collapsed by default, because the map is the surface an officer came
 * for and a permanent key spends space explaining symbols they already
 * know. Expanded on demand, and then it shows only the layers currently
 * switched on and able to draw.
 *
 * Every glyph is rendered from `MAP_SYMBOLS` — the same tokens the map
 * sprites are built from — so the legend cannot drift from the map by
 * being restyled independently. The two line treatments the symbol table
 * has no entry for are drawn from the palette instead, for the same
 * reason.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { MAP_SYMBOLS, MAP_SYMBOL_GRID, type MapSymbolKind } from "@/lib/map-symbols";
import { sgs, useMapSelector, type SharedGeospatialService } from "@/services/geospatial";

import { legendEntriesFor, type LegendGlyphKind } from "./legend-model";

export interface OperationalLegendProps {
  readonly service?: SharedGeospatialService;
  readonly className?: string;
}

export function OperationalLegend({ service = sgs, className }: OperationalLegendProps) {
  const [open, setOpen] = useState(false);
  const activeLayers = useMapSelector((state) => state.activeLayers.join(","), service);
  const entries = legendEntriesFor(activeLayers === "" ? [] : activeLayers.split(","));

  return (
    <div className={cn("pointer-events-auto", className)} data-testid="operational-legend">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="legend-toggle"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg bg-[#0B2350]/90 px-2.5 py-1.5",
          "text-[11px] font-medium uppercase tracking-wide text-white/80 shadow-sm ring-1 ring-white/10",
          "transition-colors hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]",
        )}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronUp className="h-3 w-3" aria-hidden />
        )}
        {open ? "Hide legend" : "Show legend"}
        {/*
          The count belongs on the collapsed control. It is the one thing
          worth knowing without opening it: how much of the picture is
          currently explained.
        */}
        <span className="text-white/50">{entries.length}</span>
      </button>

      {open ? (
        <div
          data-testid="legend-panel"
          className="mt-1.5 rounded-lg bg-[#0B2350]/95 px-3 py-2 shadow-[0_10px_24px_-10px_rgba(6,22,48,0.7)] ring-1 ring-white/10"
        >
          {entries.length === 0 ? (
            /*
             * A real state, not a failure. Every operational layer is
             * switched off, so there is nothing on the map to key.
             */
            <p className="text-[11px] text-white/60">No operational layer is switched on.</p>
          ) : (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {entries.map((entry) => (
                <li
                  key={entry.layerId}
                  data-legend-entry={entry.layerId}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/85"
                >
                  <LegendGlyph glyph={entry.glyph} />
                  <span className="whitespace-nowrap">{entry.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LegendGlyph({ glyph }: { glyph: LegendGlyphKind }) {
  if (glyph === "eez-boundary" || glyph === "graticule") {
    // Line treatments, drawn to match how the renderer strokes them:
    // the EEZ dashed and gold, the graticule a plain cool-grey hairline.
    const dashed = glyph === "eez-boundary";
    return (
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
        <line
          x1="1"
          y1="7"
          x2="13"
          y2="7"
          stroke={dashed ? "#E0A93A" : "#7FA8C4"}
          strokeWidth={dashed ? 1.6 : 1}
          {...(dashed ? { strokeDasharray: "3 2" } : {})}
        />
      </svg>
    );
  }

  const token = MAP_SYMBOLS[glyph as MapSymbolKind];
  return (
    <svg
      viewBox={`0 0 ${MAP_SYMBOL_GRID} ${MAP_SYMBOL_GRID}`}
      className="h-3.5 w-3.5 shrink-0"
      data-legend-glyph={glyph}
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
