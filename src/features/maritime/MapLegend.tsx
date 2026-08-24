/**
 * Map legend.
 *
 * Explains what the officer is looking at, and — as importantly — what
 * they are not. Everything here is derived from the same modules the
 * renderer uses: `VESSEL_VISUALS` and `SUPPORTED_CATEGORIES` for the
 * vessel families, `RISK_COLORS` for the palette, and the live layer
 * registry for layer state. Nothing is transcribed by hand, so the
 * legend cannot drift from what is actually drawn.
 *
 * ## Why unsupported categories are listed at all
 *
 * `VESSEL_VISUALS` declares nine families; providers can currently
 * produce five. Hiding the other four would let an officer read "no
 * fishing vessels on the map" as "no fishing vessels in these waters".
 * They are listed and marked unavailable instead.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  RISK_COLORS,
  SUPPORTED_CATEGORIES,
  VESSEL_VISUALS,
  layerRegistry,
  useMapSelector,
  type VesselVisualCategory,
} from "@/services/geospatial";

/** Risk bands worth showing. CLEAN duplicates LOW's colour, so it is folded in. */
const RISK_ROWS: readonly { readonly band: keyof typeof RISK_COLORS; readonly label: string }[] = [
  { band: "CRITICAL", label: "Critical" },
  { band: "MEDIUM", label: "Medium" },
  { band: "LOW", label: "Low" },
  { band: "UNKNOWN", label: "Unassessed" },
];

export function MapLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // Reads the same active-layer state the renderer resolves visibility
  // from, so the layer section reflects what is really on.
  const activeCsv = useMapSelector((state) => state.activeLayers.join(","));
  const active = new Set(activeCsv ? activeCsv.split(",") : []);

  return (
    <div
      data-testid="map-legend"
      className={cn(
        "pointer-events-auto w-[236px] rounded-md border border-border/60 bg-background/92 backdrop-blur-sm",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1 px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
        Legend
      </button>

      {open ? (
        <div className="max-h-[46vh] overflow-y-auto px-2.5 pb-2.5">
          <Section title="Vessel type">
            {(Object.keys(VESSEL_VISUALS) as VesselVisualCategory[]).map((category) => {
              const visual = VESSEL_VISUALS[category];
              const supported = SUPPORTED_CATEGORIES.includes(category);
              return (
                <Row
                  key={category}
                  label={visual.label}
                  note={supported ? null : "no source"}
                  glyph={<Silhouette shape={visual.silhouette} />}
                />
              );
            })}
          </Section>

          <Section title="Risk">
            {RISK_ROWS.map((row) => (
              <Row
                key={row.band}
                label={row.label}
                glyph={
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: RISK_COLORS[row.band] }}
                    aria-hidden
                  />
                }
              />
            ))}
          </Section>

          <Section title="Heading">
            <Row
              label="Course reported"
              glyph={<Silhouette shape="arrow" />}
              note="pointed, rotated to bearing"
            />
            <Row
              label="No course reported"
              glyph={<Silhouette shape="arrow" blunt />}
              note="blunt bow, unrotated"
            />
          </Section>

          <Section title="Geography">
            <Row
              label="EEZ"
              note="approximate"
              glyph={<Swatch className="border border-dashed border-[#B8860B] bg-[#B8860B]/10" />}
            />
            <Row
              label="Anchorage extent"
              note="indicative"
              glyph={<Swatch className="rounded-full border border-dashed border-[#0E7C7B]" />}
            />
            <Row label="Coastline" glyph={<Swatch className="h-0.5 bg-[#3E6E8E]" />} />
            <Row
              label="Selected port"
              glyph={
                <Swatch className="rounded-full border border-[#3FBFBE] bg-[color:var(--color-teal)]/15" />
              }
            />
            <Row
              label="Voyage origin"
              glyph={<Swatch className="rounded-full border border-[#8B6FC7] bg-[#5E8CC2]" />}
            />
            <Row
              label="Voyage destination"
              glyph={<Swatch className="rounded-full border border-[#8B6FC7] bg-[#B78BD9]" />}
            />
            <Row
              label="Approximate position"
              note="hollow, ±1 km"
              glyph={<Swatch className="rounded-full border border-[#8B6FC7] bg-[#5E8CC2]/30" />}
            />
            <Row
              label="Graticule"
              note="generated"
              glyph={<Swatch className="h-0.5 bg-[#2E4356]" />}
            />
          </Section>

          <Section title="Layers">
            {layerRegistry.list().map((layer) => (
              <Row
                key={layer.id}
                label={layer.label}
                note={
                  layer.status === "pending-source"
                    ? "no source"
                    : active.has(layer.id)
                      ? "on"
                      : "off"
                }
                glyph={
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-sm",
                      layer.status === "pending-source"
                        ? "bg-muted-foreground/40"
                        : active.has(layer.id)
                          ? "bg-[color:var(--color-teal)]"
                          : "bg-muted-foreground/30",
                    )}
                    aria-hidden
                  />
                }
              />
            ))}
          </Section>

          <div className="mt-2 space-y-1.5 border-t border-border/60 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            <p>
              &ldquo;No source&rdquo; means nothing is connected to that layer or category — not
              that none were found.
            </p>
            {/*
              The three caveats below are the price of drawing reference
              data as geography. Each of these is described in its own
              source file as approximate or indicative, where no officer
              would ever read it. Stating it here is what makes the
              richer rendering honest rather than merely prettier.
            */}
            <p data-testid="legend-caveat-eez">
              EEZ — approximate reference geometry. Not a legal or navigational boundary.
            </p>
            <p data-testid="legend-caveat-anchorage">
              Anchorage extent — indicative display reference, not a surveyed limit.
            </p>
            <p data-testid="legend-caveat-ports">
              Port marker scale reflects reference berth data, not live capacity or activity.
            </p>
            {/*
              The M2 contract, in the same place as the M1B caveats. A
              dotted violet curve is a convention; this sentence is what
              actually stops it being read as a track.
            */}
            <p data-testid="legend-caveat-voyage">
              Voyage endpoints are the recorded origin and destination only. Nothing is drawn
              between them because the route taken is not known. No observed vessel track is
              available.
            </p>
            <p data-testid="legend-caveat-gazetteer">
              Global port positions are UN/LOCODE degree-and-minute centroids (about ±1 km), not
              surveyed berths. Hollow markers are approximate; solid are operator reference
              positions.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
        {title}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function Row({
  label,
  glyph,
  note,
}: {
  label: string;
  glyph: React.ReactNode;
  note?: string | null;
}) {
  return (
    <li className="flex items-center gap-1.5 text-[11px] text-foreground">
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{glyph}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {note ? <span className="shrink-0 text-[9.5px] text-muted-foreground">{note}</span> : null}
    </li>
  );
}

/** Plain coloured mark, for the geographic encodings. */
function Swatch({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5", className)} aria-hidden />;
}

/**
 * Miniature of the drawn silhouette.
 *
 * Redrawn in SVG rather than reusing the canvas sprite: the sprites are
 * `ImageData` built for MapLibre and are not addressable as DOM images.
 * The shape vocabulary is shared through `VesselSilhouette`, so a new
 * family cannot appear on the map without a case here.
 *
 * `blunt` mirrors the `-nodir` sprite: the same hull family with its bow
 * squared off. The legend has to show it, because "blunt means we do not
 * know the course" is the one visual rule an officer cannot infer.
 */
function Silhouette({
  shape,
  blunt = false,
}: {
  shape: "arrow" | "wedge" | "block" | "disc";
  blunt?: boolean;
}) {
  const fill = "currentColor";
  const cls = "h-3 w-3 text-muted-foreground";

  if (shape === "disc") {
    return (
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-muted-foreground" aria-hidden>
        <circle cx="6" cy="6" r="4" fill={fill} />
      </svg>
    );
  }
  // Bow: a point when the course is known, a squared stem when it is not.
  const bow = blunt ? "M4 3.4 L8 3.4" : "M6 1";
  if (shape === "block") {
    return (
      <svg viewBox="0 0 12 12" className={cls} aria-hidden>
        <path d={`${bow} L9.5 4.5 L9.5 11 L2.5 11 L2.5 4.5 Z`} fill={fill} />
      </svg>
    );
  }
  if (shape === "wedge") {
    return (
      <svg viewBox="0 0 12 12" className={cls} aria-hidden>
        <path d={`${bow} L10 10 L6 8.5 L2 10 Z`} fill={fill} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" className={cls} aria-hidden>
      <path d={`${bow} L9.5 11 L6 9 L2.5 11 Z`} fill={fill} />
    </svg>
  );
}
