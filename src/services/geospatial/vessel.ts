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
import type {
  AlertBeacon,
  GeoJsonFeature,
  GeoJsonPoint,
  LonLat,
  RiskLevel,
  VesselType,
} from "./types";
import {
  classifyVessel,
  resolveHeading,
  vesselSpriteId,
  colorKeyForCategory,
  type VesselColorKey,
  type VesselVisualCategory,
} from "./vessel-visual";
import { confidenceTierFor, type ConfidenceTier, type IntelligenceSignal } from "./entity-visual";
import type { PositionKind } from "./position-provenance";
import type { ConfidenceLevel } from "@/lib/data-model/confidence";

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
  /**
   * Whether a provider actually reported the speed above.
   *
   * The exact counterpart of {@link headingReported}, and it exists for
   * the same reason. `speed` is a required number, so a source that
   * publishes no speed still yields `0` — which reads as "stopped", and
   * a stopped ship at a berth is entirely plausible. That is what makes
   * the zero dangerous: it is indistinguishable from a real observation.
   *
   * NPA publishes an operational schedule with no speeds at all, so
   * every vessel drawn from it alone would otherwise report as
   * stationary. Optional so existing constructions stay valid; absent is
   * treated as reported, since every caller predating this supplied a
   * real speed.
   */
  readonly speedReported?: boolean;
  /** ISO-8601 timestamp of the report. */
  readonly timestamp: string;
  /**
   * How this coordinate was arrived at.
   *
   * Absent means observed, which is what every position predating this
   * field was: nothing in the codebase generated positions, so the
   * default preserves the meaning existing callers already had.
   *
   * It exists because the moment the interface interpolates between two
   * reports for smoothness, every drawn position becomes a claim the
   * data does not support unless the distinction travels with the
   * coordinate. Remembering it in whichever component happens to draw
   * next is not a mechanism.
   */
  readonly kind?: PositionKind;
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
  /**
   * Intelligence attached to this vessel by another system.
   *
   * Optional, and populated by nothing in this repository today: no
   * source reports per-vessel investigations, alerts or risk events.
   * Declared so the renderer and the legend already agree on the word
   * when one does — the same reason `VESSEL_VISUALS` declares families
   * no provider can currently produce. Absent means "nobody said",
   * never "nothing attached".
   */
  readonly intelligenceSignal?: IntelligenceSignal;
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
  /**
   * Confidence tier of this observation, or absent.
   *
   * Absent is the important case and is why this is optional rather
   * than defaulted: the confidence ring layer filters on the property's
   * *presence*, so a vessel nobody has graded draws no ring at all. A
   * default of `"unconfirmed"` would put a grey ring on every vessel on
   * the map and read as an assessment nobody made.
   */
  readonly confidenceTier?: ConfidenceTier;
  /** Intelligence signal attached to this vessel, or absent. */
  readonly intelligenceSignal?: IntelligenceSignal;
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
  /**
   * Vessels an answer is about, dimming the rest.
   *
   * Kept separate from `dimUnattended`, which keys off OSAE's
   * `attentionScore` — a different axis that nothing populates today.
   * Folding an approach result into that score would make a question the
   * officer asked look like an assessment the system performed.
   *
   * Absent means no answer is on screen and every vessel draws normally.
   * A highlight is a presentation state, never intelligence.
   */
  readonly highlightedImos?: ReadonlySet<string>;
  /**
   * Vessels carrying an unresolved operational alert.
   *
   * Additive, and kept off every axis that already means something else.
   * It does not touch `riskLevel` — severity is how promptly to look,
   * never a claim about the vessel — nor `attentionScore`, nor
   * `intelligenceSignal`, nor the icon size. An alert is a fifth thing a
   * vessel can be, drawn on top of the four it already was.
   *
   * Absent when nothing is alerting, so the beacon layer's `has` filter
   * draws nothing rather than drawing for everyone.
   */
  readonly alerts?: ReadonlyMap<string, AlertBeacon>;
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
  /*
   * Outside the answer the officer is looking at. Dimmed rather than
   * hidden: a vessel removed from the map would look like one the source
   * stopped reporting.
   */
  if (ctx.highlightedImos && !ctx.highlightedImos.has(vessel.identity.imo)) {
    return RISK_OPACITY.DIMMED;
  }
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
  const visual = classifyVessel(vessel.identity.type);
  const silhouette = visual.silhouette;

  /*
   * Colour carries type, not risk.
   *
   * Nothing assesses risk here, so keying colour to it painted every
   * vessel the same and threw away the one attribute the provider reports
   * for all of them. Selection still outranks — an officer needs to find
   * the hull they picked — but nothing else recolours a ship away from
   * what kind of ship it is.
   */
  const colorKey: VesselColorKey =
    ctx.selectedImo != null && ctx.selectedImo === vessel.identity.imo
      ? "selected"
      : colorKeyForCategory(visual.category);

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
  /*
   * Both optional axes are spread in only when the vessel carries them.
   *
   * `undefined` would survive into the GeoJSON properties as a key that
   * exists with no value, and MapLibre's `["has", …]` reports that as
   * present — which would draw a ring or a badge for a vessel that has
   * neither. Omitting the key entirely is what makes the filters honest.
   */
  const confidenceTier = vessel.confidenceLevel
    ? confidenceTierFor(vessel.confidenceLevel as ConfidenceLevel)
    : undefined;
  /*
   * Only a beacon that should actually draw becomes a property. A
   * CLEARED alert is a resolved one; it stays in the officer's history
   * and leaves the map, so it must not survive into the features at all
   * — `["has", …]` would otherwise ring a vessel nobody is waiting on.
   */
  const beacon = ctx.alerts?.get(vessel.identity.imo);
  const alert = beacon && beacon.visualState !== "CLEARED" ? beacon : undefined;
  return {
    type: "Feature",
    id: vessel.identity.imo,
    geometry: { type: "Point", coordinates },
    properties: {
      ...(confidenceTier ? { confidenceTier } : {}),
      ...(vessel.intelligenceSignal ? { intelligenceSignal: vessel.intelligenceSignal } : {}),
      ...(alert ? { alertSeverity: alert.severity, alertVisual: alert.visualState } : {}),
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

/**
 * Whether this vessel's key is a real IMO number.
 *
 * `identity.imo` is the canonical key, and when the provider reports no
 * IMO the MMSI stands in so the vessel still has a stable identity. That
 * is sound as a key and wrong as a label: an IMO is a permanent
 * registry-issued number, an MMSI is a radio identity that changes with
 * the flag. Printing one as the other states something about the ship
 * that is not true — measured at 21 of 147 vessels off Lagos, so roughly
 * one in seven.
 *
 * The two can be told apart because the fallback makes them identical,
 * and a vessel with both never has them match: an IMO is seven digits, an
 * MMSI is nine.
 */
export function hasReportedImo(identity: VesselIdentity): boolean {
  if (!identity.imo) return false;
  return identity.mmsi ? identity.imo !== identity.mmsi : true;
}
