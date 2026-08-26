/**
 * WGS84 graticule.
 *
 * Meridians and parallels, generated from arithmetic rather than read
 * from a dataset. That makes this the only geometry on the map that is
 * exact by construction: a graticule is not an observation, cannot be
 * stale, and has no provenance to declare.
 *
 * ## Why it must not look like the EEZ
 *
 * The EEZ is drawn as a gold dashed line and is explicitly approximate.
 * A graticule that resembled it would invite an officer to read a
 * meridian as a claimed boundary — inventing a jurisdiction out of a
 * coordinate line. So the two are separated on every available axis:
 * colour (cool grey against gold), dash (solid against dashed), and
 * weight. `docs/geospatial` treats that separation as a requirement, not
 * a preference.
 *
 * ## Zoom tiering
 *
 * Every line carries the coarsest interval it belongs to, so one source
 * serves all zooms: ten-degree lines anchor the strategic view, and
 * five- then one-degree lines fade in as the officer closes. Drawing all
 * three at once would turn the operational picture into graph paper.
 */
import { MAP_DEFAULTS } from "./constants";
import type { BoundingBox } from "./types";

/** Intervals drawn, coarsest first. */
export const GRATICULE_STEPS: readonly number[] = [10, 5, 1] as const;

export interface GraticuleLine {
  readonly type: "Feature";
  readonly geometry: { readonly type: "LineString"; readonly coordinates: number[][] };
  readonly properties: {
    readonly axis: "meridian" | "parallel";
    /** The line's own coordinate, in degrees. */
    readonly degrees: number;
    /** Coarsest interval this line belongs to. Drives the zoom reveal. */
    readonly step: number;
  };
}

export interface GraticuleCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly GraticuleLine[];
}

/**
 * The smallest declared step that is at least `minimum`.
 *
 * Used to widen the finest interval when the extent is large, so the
 * grid stays legible instead of collapsing into a solid wash.
 */
function nextStepAtLeast(minimum: number, steps: readonly number[]): number {
  const ascending = [...steps].sort((a, b) => a - b);
  return ascending.find((step) => step >= minimum) ?? ascending[ascending.length - 1] ?? 1;
}

/** The coarsest step in `steps` that divides `value` exactly. */
function coarsestStep(value: number, steps: readonly number[]): number {
  for (const step of steps) {
    // Integer arithmetic: the caller's steps and values are whole
    // degrees, so this avoids the float residue `%` leaves on e.g. 0.1.
    if (Math.round(value) % step === 0) return step;
  }
  return steps[steps.length - 1] ?? 1;
}

/**
 * Build the graticule for a bounding box.
 *
 * Lines are emitted at the finest interval in `steps` and tagged with
 * the coarsest one they satisfy, so the collection is generated once and
 * filtered by the renderer rather than rebuilt per zoom.
 *
 * Meridians and parallels are both straight in Web Mercator, so two
 * vertices each is exact — no densification needed, and the whole
 * collection stays at roughly fifty two-point features.
 */
export function graticuleFeatures(
  bounds: BoundingBox = MAP_DEFAULTS.maxBounds as unknown as BoundingBox,
  steps: readonly number[] = GRATICULE_STEPS,
): GraticuleCollection {
  /*
   * Guard against generating a grid nobody can read or afford.
   *
   * At the regional extent a 1° finest step is 50 lines. Across the
   * whole globe it would be 542, drawn over an area where they are
   * about 100 km apart on screen — graph paper, and a cost paid every
   * frame. Callers pass a coarser step set for wide scopes (see
   * `MAP_SCOPES`), and this is the backstop if one does not.
   */
  const [[west, south], [east, north]] = bounds;
  const requested = steps[steps.length - 1] ?? 1;
  const span = Math.max(east - west, north - south);
  // Never emit more than this many lines on either axis.
  const finest = Math.max(requested, nextStepAtLeast(span / 40, steps));
  const features: GraticuleLine[] = [];

  for (let lon = Math.ceil(west / finest) * finest; lon <= east; lon += finest) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [lon, south],
          [lon, north],
        ],
      },
      properties: { axis: "meridian", degrees: lon, step: coarsestStep(lon, steps) },
    });
  }

  for (let lat = Math.ceil(south / finest) * finest; lat <= north; lat += finest) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [west, lat],
          [east, lat],
        ],
      },
      properties: { axis: "parallel", degrees: lat, step: coarsestStep(lat, steps) },
    });
  }

  return { type: "FeatureCollection", features };
}

/**
 * Per-step opacity ramp.
 *
 * Coarse lines carry the strategic view; finer ones arrive only when
 * there is room for them. Continuous in zoom, so intervals fade in
 * rather than popping.
 *
 * ## Why zoom is the outer expression
 *
 * MapLibre requires a zoom expression to be the outermost element of a
 * property value — a `["zoom"]` nested inside a `case` is rejected, and
 * rejected quietly: `addLayer` declines the layer and the map carries on
 * without it. So the shape here is inverted from the obvious one. Zoom
 * interpolates on the outside, and each stop is a `case` over the
 * feature's own `step`, which is data-driven and may be nested.
 */
export function graticuleOpacityExpression(): unknown {
  /** Opacity for the 10°, 5° and 1° intervals at one zoom stop. */
  const byStep = (coarse: number, medium: number, fine: number) => [
    "case",
    ["==", ["get", "step"], 10],
    coarse,
    ["==", ["get", "step"], 5],
    medium,
    fine,
  ];

  /*
   * Anchored at zoom 1.
   *
   * The ramp used to begin at 4, and MapLibre clamps below a first
   * stop rather than extrapolating — so the entire world view drew the
   * grid at its regional weight, over the one extent where a hundred
   * and twenty meridians are in frame at once. The world stop is
   * therefore *lower* than the regional one, which inverts the usual
   * intuition but is what keeps the count and the weight in balance:
   * many lines, drawn faintly, read as orientation; the same lines at
   * regional weight read as a cage.
   *
   * It is never zero. The graticule's whole value at world zoom is
   * telling the officer which hemisphere they have drifted into, and
   * that is exactly the view where no coastline is nearby to say so.
   */
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    1,
    byStep(0.16, 0.12, 0),
    3.5,
    byStep(0.24, 0.18, 0),
    7,
    byStep(0.32, 0.24, 0),
    9.5,
    byStep(0.3, 0.22, 0.18),
    13,
    byStep(0.24, 0.2, 0.16),
  ];
}
