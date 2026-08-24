/**
 * Map legend — the intelligence key.
 *
 * Explains what the officer is looking at, and — as importantly — what
 * they are not. Everything here is derived from the same modules the
 * renderer uses: `VESSEL_VISUALS` and `SUPPORTED_CATEGORIES` for the
 * vessel families, `RISK_COLORS` for the risk palette,
 * `CONFIDENCE_RING_STYLES` and `INTELLIGENCE_COLORS` for the M2.5 entity
 * language, and the live layer registry for layer state. Nothing is
 * transcribed by hand, so the legend cannot drift from what is drawn.
 *
 * ## What "dynamic" means here, precisely
 *
 * A section appears when the layer that draws it is switched on, and
 * disappears when it is switched off. Turning the ports layer off
 * removes the port row; turning vessels off removes the vessel, heading
 * and risk rows. That is a real dependency on `activeLayers`, not a
 * decorative one — the same `MapState` field `layerRegistry.resolveVisibility`
 * reads to decide what the renderer draws.
 *
 * ## What is *not* hidden, and why
 *
 * Two things stay visible when they are empty, because hiding them would
 * assert something false:
 *
 *   Unsupported vessel families. `VESSEL_VISUALS` declares nine;
 *   providers can produce five. Hiding the other four would let an
 *   officer read "no fishing vessels on the map" as "no fishing vessels
 *   in these waters".
 *
 *   The confidence ladder. It is the vocabulary the whole product is
 *   graded in, and an officer must be able to look it up whether or not
 *   anything on screen currently carries a grade. It is shown with an
 *   explicit note when nothing does.
 *
 * The distinction throughout is between *switched off* — the officer
 * chose not to look at it, so the key for it is noise — and *unsourced*,
 * where the absence is a fact about Seaphore's collection and must be
 * stated rather than hidden.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CONFIDENCE_RING_STYLES,
  CONFIDENCE_TIERS,
  INTELLIGENCE_COLORS,
  INTELLIGENCE_LABELS,
  INTERACTION_COLORS,
  RISK_COLORS,
  SUPPORTED_CATEGORIES,
  VESSEL_VISUALS,
  layerRegistry,
  useMapSelector,
  type IntelligenceSignal,
  type VesselVisualCategory,
} from "@/services/geospatial";

/** Risk bands worth showing. CLEAN duplicates LOW's colour, so it is folded in. */
const RISK_ROWS: readonly { readonly band: keyof typeof RISK_COLORS; readonly label: string }[] = [
  { band: "CRITICAL", label: "Critical" },
  { band: "MEDIUM", label: "Medium" },
  { band: "LOW", label: "Low" },
  { band: "UNKNOWN", label: "Unassessed" },
];

/**
 * Intelligence signals, in the order the badges stack.
 *
 * Every one of them is currently unsourced: nothing in this repository
 * populates `intelligenceSignal` on a vessel or a port. They are listed
 * with that stated, for the same reason the unsupported vessel families
 * are — so an empty map does not read as a quiet one.
 */
const INTELLIGENCE_ROWS: readonly IntelligenceSignal[] = [
  "investigation",
  "risk",
  "alert",
] as const;

export function MapLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // Reads the same active-layer state the renderer resolves visibility
  // from, so every section below reflects what is really on.
  const activeCsv = useMapSelector((state) => state.activeLayers.join(","));
  const active = new Set(activeCsv ? activeCsv.split(",") : []);

  /** True when the logical layer is switched on *and* has a source. */
  const shown = (layerId: string) =>
    active.has(layerId) && layerRegistry.get(layerId)?.status === "ready";

  const vessels = shown("vessels");
  const ports = shown("ports");
  const clusters = shown("vesselClusters");
  const voyages = shown("voyages");
  const eez = shown("eezBoundary");
  const graticule = shown("graticule");

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
          {/* ── Entities ── */}
          {vessels || ports || clusters ? (
            <Section title="Entities" testId="legend-section-entities">
              {vessels ? (
                <>
                  <Row
                    label="Course reported"
                    glyph={<Silhouette shape="arrow" />}
                    note="pointed, rotated"
                  />
                  <Row
                    label="No course reported"
                    glyph={<Silhouette shape="arrow" blunt />}
                    note="blunt bow, unrotated"
                  />
                </>
              ) : null}
              {ports ? <Row label="Port" glyph={<PortGlyph />} note="reference position" /> : null}
              {clusters ? <Row label="Entity cluster" glyph={<ClusterGlyph />} /> : null}
            </Section>
          ) : null}

          {/* Vessel families only mean anything while vessels are drawn. */}
          {vessels ? (
            <Section title="Vessel type" testId="legend-section-vessel-type">
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
          ) : null}

          {vessels ? (
            <Section title="Risk" testId="legend-section-risk">
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
          ) : null}

          {/* ── Intelligence ── */}
          {vessels || ports ? (
            <Section title="Intelligence" testId="legend-section-intelligence">
              {INTELLIGENCE_ROWS.map((signal) => (
                <Row
                  key={signal}
                  label={INTELLIGENCE_LABELS[signal]}
                  note="no source"
                  glyph={
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: INTELLIGENCE_COLORS[signal] }}
                      aria-hidden
                    />
                  }
                />
              ))}
            </Section>
          ) : null}

          {/* ── Selection and hover ── */}
          {vessels || ports ? (
            <Section title="Interaction" testId="legend-section-interaction">
              <Row
                label="Selected"
                glyph={<RingGlyph stroke={INTERACTION_COLORS.selected} width={1.4} radius={5} />}
              />
              <Row
                label="Under cursor"
                glyph={<RingGlyph stroke={INTERACTION_COLORS.hover} width={1} radius={3.6} />}
              />
            </Section>
          ) : null}

          {/* ── Confidence ── */}
          <Section title="Confidence" testId="legend-section-confidence">
            {CONFIDENCE_TIERS.map((tier) => {
              const style = CONFIDENCE_RING_STYLES[tier];
              return (
                <Row
                  key={tier}
                  label={style.label}
                  glyph={
                    <RingGlyph
                      stroke={style.color}
                      width={style.strokeWidth}
                      radius={4.4}
                      fill={style.color}
                      fillOpacity={style.fillOpacity}
                      strokeOpacity={style.strokeOpacity}
                      dash={style.dash}
                    />
                  }
                />
              );
            })}
          </Section>

          {/* ── Geography ── */}
          <Section title="Geography" testId="legend-section-geography">
            {eez ? (
              <Row
                label="EEZ"
                note="approximate"
                glyph={<Swatch className="border border-dashed border-[#B8860B] bg-[#B8860B]/10" />}
              />
            ) : null}
            {ports ? (
              <Row
                label="Anchorage extent"
                note="indicative"
                glyph={<Swatch className="rounded-full border border-dashed border-[#0E7C7B]" />}
              />
            ) : null}
            <Row label="Coastline" glyph={<Swatch className="h-0.5 bg-[#3E6E8E]" />} />
            {voyages ? (
              <>
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
                  glyph={
                    <Swatch className="rounded-full border border-[#8B6FC7] bg-[#5E8CC2]/30" />
                  }
                />
              </>
            ) : null}
            {graticule ? (
              <Row
                label="Graticule"
                note="generated"
                glyph={<Swatch className="h-0.5 bg-[#2E4356]" />}
              />
            ) : null}
          </Section>

          <Section title="Layers" testId="legend-section-layers">
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
              The confidence ladder is always listed, so it needs its own
              statement of what is currently graded. Without it, four
              rings in the key over a map carrying none of them would
              imply the grading exists and everything happens to be
              ungraded.
            */}
            <p data-testid="legend-caveat-confidence">
              No map source currently grades vessels or ports, so no confidence ring is drawn. A
              ring appears only where a record carries a confidence value.
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

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="mb-2 last:mb-0" data-testid={testId}>
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
 * A ring, matching the ones the map draws.
 *
 * One component for both interaction rings and confidence rings, because
 * on the map they are the same primitive at different radii — and a
 * legend that drew them as two different marks would be teaching a
 * distinction the map does not make.
 */
function RingGlyph({
  stroke,
  width,
  radius,
  fill,
  fillOpacity = 0,
  strokeOpacity = 1,
  dash,
}: {
  stroke: string;
  width: number;
  radius: number;
  fill?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  dash?: readonly [number, number] | null;
}) {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <circle
        cx="6"
        cy="6"
        r={radius}
        fill={fill ?? "none"}
        fillOpacity={fill ? fillOpacity : 0}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={width}
        strokeDasharray={dash ? dash.join(" ") : undefined}
      />
    </svg>
  );
}

/**
 * The port diamond.
 *
 * Redrawn in SVG for the same reason the silhouettes are: the map's port
 * sprite is `ImageData` built for MapLibre and is not addressable as a
 * DOM image. The geometry mirrors `createPortDiamondImage` — a diamond,
 * because a port must differ from a vessel in *shape* and not only in
 * colour.
 */
function PortGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <path
        d="M6 1.2 L10.8 6 L6 10.8 L1.2 6 Z"
        fill="#0E7C7B"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="0.9"
      />
    </svg>
  );
}

/** Aggregation mark: concentric rings, standing for "more than one here". */
function ClusterGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <circle cx="6" cy="6" r="5" fill="#0E7C7B" fillOpacity="0.25" />
      <circle cx="6" cy="6" r="3" fill="#0E7C7B" fillOpacity="0.6" />
    </svg>
  );
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
