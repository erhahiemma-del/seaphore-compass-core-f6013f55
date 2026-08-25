/**
 * GIP — Vessel domain model.
 *
 * The canonical in-memory representation of a vessel on the operational map,
 * plus the pure functions that derive its *presentation* state.
 *
 * Boundary (Sprint G5.5.1): this module owns identity, position, freshness,
 * and rendering shape. It owns no intelligence. `riskLevel` and
 * `attentionScore` are carried as externally-populated fields — the map
 * displays what OSAE decides, and never decides for itself. Nothing here
 * scores, ranks, or classifies.
 */
import { RISK_COLORS, RISK_OPACITY, TIMING } from "./constants";
import { freshnessBandForTimestamp, type FreshnessBand } from "./freshness";
import type { GeoJsonFeature, GeoJsonPoint, LonLat, RiskLevel, VesselType } from "./types";
import {
  classifyVessel,
  resolveHeading,
  vesselSpriteId,
  type VesselColorKey,
  type VesselVisualCategory,
} from "./vessel-visual";

/** Stable identity of a vessel across data sources. */
export interface VesselIdentity {
  /** IMO number — the canonical key for a vessel on the map. */
  readonly imo: string;
  /** Maritime Mobile Service Identity, when known. */
  readonly mmsi?: string;
  readonly name: string;
  readonly callSign?: string;
  readonly flag?: string;
  readonly type?: VesselType;
}

/** A single positional report. */
export interface VesselPosition {
  readonly lon: number;
  readonly lat: number;
  /** Course over ground in degrees, 0–359, where 0 is true north. */
  readonly heading: number;
  /**
   * Whether a provider actually reported the course above.
   *
   * `heading` is a required number, so a source with no course still
   * yields `0` — which draws as due north and is indistinguishable from
   * a real northerly bearing. This flag is the only thing that keeps
   * "steaming north" apart from "nobody said". Optional so existing
   * constructions stay valid; absent is treated as reported, since every
   * caller predating this either supplied a real course or set the flag.
   */
  readonly headingReported?: boolean;
  /** Speed over ground in knots. */
  readonly speed: number;
  /** ISO-8601 timestamp of the report. */
  readonly timestamp: string;
  readonly destination?: string;
  /** Hours until estimated arrival, when derivable upstream. */
  readonly etaHours?: number | null;
}

/**
 * Where an observation came from, and when.
 *
 * Carried per-vessel rather than per-batch so a fused picture built from
 * several providers keeps each vessel's own lineage. Added in G5.5.3 for
 * the live pipeline; optional so existing constructions stay valid.
 */
export interface VesselProvenance {
  /** Connector id, e.g. `"global-fishing-watch"`. */
  readonly source: string;
  /** Human-readable provider name for display. */
  readonly provider: string;
  /** Upstream dataset the observation came from, when known. */
  readonly datasetId?: string;
  /** When Seaphore retrieved it. */
  readonly retrievedAt: string;
  /** When the vessel was actually observed upstream. */
  readonly observedAt: string;
}

/**
 * A vessel as the map knows it.
 *
 * Deliberately flat and serialisable so it can cross a worker boundary, be
 * cached, or be snapshotted in a test fixture.
 */
export interface Vessel {
  readonly identity: VesselIdentity;
  readonly position: VesselPosition;
  /**
   * Risk band assigned upstream (ICE/OSAE). `UNKNOWN` when no assessment has
   * been resolved — never inferred locally.
   */
  readonly riskLevel: RiskLevel;
  /**
   * Attention score 0–100, populated by OSAE from G5.5 onward. `0` means
   * "not ranked", not "low priority".
   */
  readonly attentionScore: number;
  /** Provenance of the snapshot this vessel was derived from. */
  readonly sourceSnapshotId?: string;
  /**
   * Lineage of this observation. Optional — a vessel constructed from a
   * fixture or a future provider may not carry one.
   */
  readonly provenance?: VesselProvenance;
  /**
   * Confidence in this observation, 0-1, from the OSINT confidence engine
   * (`@/lib/osint/confidence`). Never computed locally by the map.
   */
  readonly confidence?: number;
  /** Banded form of {@link confidence}, e.g. `"CORROBORATED"`. */
  readonly confidenceLevel?: string;
}

/** Properties attached to each rendered vessel feature. */
export interface VesselFeatureProperties {
  readonly imo: string;
  readonly name: string;
  readonly risk: RiskLevel;
  readonly speed: number;
  readonly heading: number;
  readonly opacity: number;
  readonly destination: string;
  readonly etaHours: number | null;
  readonly isStale: boolean;
  readonly isSelected: boolean;
  readonly attentionScore: number;
  readonly lastUpdated: string;
  readonly iconId: string;
  readonly snapshotId: string;
  /** Freshness band of this observation. Mechanical age, never behaviour. */
  readonly freshness: FreshnessBand;
  /** Age of the observation in milliseconds at projection time. */
  readonly ageMs: number;
  /** Visual family, from `classifyVessel`. Shape axis, not risk. */
  readonly category: VesselVisualCategory;
  /** Officer-facing category name, for the popup and the legend. */
  readonly categoryLabel: string;
  /** False when no provider reported this vessel's type. */
  readonly typeReported: boolean;
  /**
   * Whether `heading` is a bearing anyone actually reported.
   *
   * The renderer keys `icon-rotate` off this: false means draw the
   * symbol unrotated, because rotating to a defaulted zero would show a
   * vessel steaming north that may be drifting or moored.
   */
  readonly headingKnown: boolean;
}

/** A vessel rendered as a GeoJSON point feature. */
export type VesselFeature = GeoJsonFeature<GeoJsonPoint, VesselFeatureProperties>;

/** Presentation context that varies per render, independent of the vessel. */
export interface VesselRenderContext {
  /** IMO of the current selection, if any. */
  readonly selectedImo?: string | null;
  /** Evaluation time in epoch ms. Injectable so freshness is testable. */
  readonly now?: number;
  /**
   * When an attention set is active, vessels outside it are dimmed. Supplied
   * by OSAE; the map only applies the opacity.
   */
  readonly dimUnattended?: boolean;
}

/** The stable key identifying a vessel in every collection and diff. */
export function vesselKey(vessel: Vessel): string {
  return vessel.identity.imo;
}

/**
 * Age of a position report in milliseconds.
 * Returns `Number.POSITIVE_INFINITY` for an unparseable timestamp, so an
 * undated report is treated as maximally stale rather than silently fresh.
 */
export function positionAgeMs(position: VesselPosition, now: number = Date.now()): number {
  const reported = Date.parse(position.timestamp);
  if (Number.isNaN(reported)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - reported);
}

/**
 * Whether a vessel's position is stale.
 *
 * Mechanical freshness only — a stale marker means "this position may have
 * changed", never "this vessel is suspicious".
 */
export function isStale(vessel: Vessel, now: number = Date.now()): boolean {
  return positionAgeMs(vessel.position, now) > TIMING.staleThresholdMs;
}

/** Marker opacity for a vessel under the given render context. */
export function vesselOpacity(vessel: Vessel, ctx: VesselRenderContext = {}): number {
  const now = ctx.now ?? Date.now();
  const selected = ctx.selectedImo != null && ctx.selectedImo === vessel.identity.imo;
  if (selected) return RISK_OPACITY.ACTIVE;
  if (isStale(vessel, now)) return RISK_OPACITY.STALE;
  if (ctx.dimUnattended && vessel.attentionScore <= 0) return RISK_OPACITY.DIMMED;
  return RISK_OPACITY.ACTIVE;
}

/**
 * Sprite id for a vessel, matching the icons registered with the renderer.
 *
 * Three inputs, three independent axes:
 *
 *   colour      risk — or selection, which outranks it
 *   silhouette  the reported hull type, `disc` when none was reported
 *   direction   whether a bearing was reported at all
 *
 * The id is composed by `vesselSpriteId`, the same function
 * `vesselSpriteIds()` uses to enumerate what the renderer registers, so
 * a vessel can never ask for a sprite that does not exist.
 */
export function vesselIconId(vessel: Vessel, ctx: VesselRenderContext = {}): string {
  const now = ctx.now ?? Date.now();
  const directional = resolveHeading(
    vessel.position.heading,
    vessel.position.headingReported,
  ).known;
  const silhouette = classifyVessel(vessel.identity.type).silhouette;

  const colorKey: VesselColorKey =
    ctx.selectedImo != null && ctx.selectedImo === vessel.identity.imo
      ? "selected"
      : (vessel.riskLevel.toLowerCase() as VesselColorKey);

  return vesselSpriteId(colorKey, silhouette, directional);
}

/** Palette colour for a risk band, falling back to `UNKNOWN`. */
export function riskColor(risk: RiskLevel): string {
  return RISK_COLORS[risk] ?? RISK_COLORS.UNKNOWN;
}

/** Normalise any heading to the 0–359 range MapLibre's `icon-rotate` expects. */
export function normalizeHeading(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  return ((heading % 360) + 360) % 360;
}

/** Project a vessel to its GeoJSON feature, applying presentation rules. */
export function toVesselFeature(vessel: Vessel, ctx: VesselRenderContext = {}): VesselFeature {
  const now = ctx.now ?? Date.now();
  const selected = ctx.selectedImo != null && ctx.selectedImo === vessel.identity.imo;
  const coordinates: LonLat = [vessel.position.lon, vessel.position.lat];
  // Classification and heading resolved once per feature. Both are pure
  // lookups over data already in hand — no provider call, no inference.
  const visual = classifyVessel(vessel.identity.type);
  const resolvedHeading = resolveHeading(vessel.position.heading, vessel.position.headingReported);
  return {
    type: "Feature",
    id: vessel.identity.imo,
    geometry: { type: "Point", coordinates },
    properties: {
      imo: vessel.identity.imo,
      name: vessel.identity.name,
      risk: vessel.riskLevel,
      speed: vessel.position.speed,
      heading: resolvedHeading.degrees,
      headingKnown: resolvedHeading.known,
      category: visual.category,
      categoryLabel: visual.label,
      typeReported: visual.typeReported,
      opacity: vesselOpacity(vessel, { ...ctx, now }),
      destination: vessel.position.destination ?? "",
      etaHours: vessel.position.etaHours ?? null,
      isStale: isStale(vessel, now),
      isSelected: selected,
      attentionScore: vessel.attentionScore,
      lastUpdated: vessel.position.timestamp,
      iconId: vesselIconId(vessel, { ...ctx, now }),
      snapshotId: vessel.sourceSnapshotId ?? "",
      freshness: freshnessBandForTimestamp(vessel.position.timestamp, now),
      ageMs: positionAgeMs(vessel.position, now),
    },
  };
}

/**
 * Whether two vessels differ in any way the renderer would need to redraw.
 *
 * Used by the update engine to keep incremental batches minimal. Compares
 * only render-affecting fields — provenance and unrendered identity metadata
 * are ignored on purpose.
 */
export function hasRenderableChange(a: Vessel, b: Vessel): boolean {
  return (
    a.position.lon !== b.position.lon ||
    a.position.lat !== b.position.lat ||
    a.position.heading !== b.position.heading ||
    a.position.speed !== b.position.speed ||
    a.position.timestamp !== b.position.timestamp ||
    a.position.destination !== b.position.destination ||
    a.position.etaHours !== b.position.etaHours ||
    a.riskLevel !== b.riskLevel ||
    a.attentionScore !== b.attentionScore ||
    a.identity.name !== b.identity.name
  );
}
