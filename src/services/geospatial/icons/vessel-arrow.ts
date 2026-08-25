/**
 * GIP — Vessel arrow sprites.
 *
 * Vessel markers are drawn programmatically with the Canvas API and registered
 * with MapLibre via `map.addImage()`. No sprite sheet, no image files, no
 * network request — which means markers are available the instant the style
 * loads and can never 404.
 *
 * Geometry is specified in `MAP_RENDERING_SPEC.md` §Icons: a 30×30 elongated
 * teardrop pointing north (0°), so MapLibre's `icon-rotate` can be bound
 * directly to the vessel's heading.
 */
import { MAP_SYMBOLS } from "@/lib/map-symbols";

import { RISK_COLORS } from "../constants";
import {
  VESSEL_COLOR_KEYS,
  VESSEL_SILHOUETTES,
  vesselSpriteId,
  type VesselColorKey,
  type VesselSilhouette,
} from "../vessel-visual";

/** Canvas edge length for every vessel sprite, in pixels. */
export const VESSEL_SPRITE_SIZE = 30;

/**
 * Colour per sprite key — the *risk* axis of the sprite vocabulary.
 *
 * Keyed by `VesselColorKey` so the set of colours and the set of ids can
 * never drift apart: `vesselSpriteIds()` is the cartesian product of
 * these keys with the silhouettes, and `vesselIconId()` composes an id
 * from the same two pieces. A mismatch would silently render nothing,
 * because MapLibre skips features whose `icon-image` names an
 * unregistered sprite.
 */
export const VESSEL_SPRITE_COLORS: Readonly<Record<VesselColorKey, string>> = {
  critical: RISK_COLORS.CRITICAL,
  high: RISK_COLORS.HIGH,
  medium: RISK_COLORS.MEDIUM,
  low: RISK_COLORS.LOW,
  clean: RISK_COLORS.CLEAN,
  // An unassessed vessel is the baseline maritime green of the symbol
  // vocabulary — visible and recognisable, without claiming a risk band.
  unknown: MAP_SYMBOLS.vessel.color,
  /** Selection overrides risk colour. */
  selected: "#0E7C7B",
  /** Stale position keeps the vessel silhouette colour; opacity carries age. */
  stale: MAP_SYMBOLS.vessel.color,
} as const;

/** Open a 2D context of the standard sprite size, or fail loudly. */
function spriteContext(size = VESSEL_SPRITE_SIZE): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable — cannot build vessel sprites");
  }
  ctx.clearRect(0, 0, size, size);
  return ctx;
}

/** Fill and outline the current path in the house style. */
function paint(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Trace one hull family, pointing north.
 *
 * `directional` decides the bow only. A directional hull comes to a
 * point, which the renderer then rotates to the reported bearing; a
 * non-directional one is the *same family* with a blunt, rounded bow, so
 * the officer still reads "tanker" while nothing on the shape suggests
 * which way it is facing.
 *
 * That split is why type and heading stay independent. Collapsing every
 * unknown-heading vessel into a plain dot would have thrown away a hull
 * type the provider did report — the mirror image of the bug that
 * started all this.
 */
function traceSilhouette(
  ctx: CanvasRenderingContext2D,
  silhouette: VesselSilhouette,
  directional: boolean,
  size = VESSEL_SPRITE_SIZE,
): void {
  const mid = size / 2;
  ctx.beginPath();

  // Beam (half-width) and stern shape vary by family; the bow is shared.
  const geometry = {
    arrow: { beam: size * 0.43, stern: size - 4, notch: size - 8 },
    // Long and narrow: tankers and bulk carriers read as a slender hull.
    wedge: { beam: size * 0.3, stern: size - 3, notch: size - 7 },
    // Boxy, near-flat stern: container and vehicle carriers.
    block: { beam: size * 0.36, stern: size - 4, notch: size - 5 },
    // Generic ship hull for a vessel whose type nobody reported. Still a
    // recognisable craft — never a dot.
    hull: { beam: size * 0.34, stern: size - 4, notch: size - 7 },
  }[silhouette];

  const bowY = 2;
  const shoulderY = size * 0.38;

  if (directional) {
    ctx.moveTo(mid, bowY);
  } else {
    // Blunt bow: a short arc across the stem instead of a point.
    const blunt = size * 0.16;
    ctx.moveTo(mid - blunt, shoulderY * 0.72);
    ctx.quadraticCurveTo(mid, bowY + blunt * 0.4, mid + blunt, shoulderY * 0.72);
  }

  ctx.lineTo(mid + geometry.beam, geometry.stern); // starboard quarter
  ctx.lineTo(mid, geometry.notch); // stern notch
  ctx.lineTo(mid - geometry.beam, geometry.stern); // port quarter
  ctx.closePath();
}

/**
 * Draw one vessel sprite.
 *
 * Returns `ImageData` ready for `map.addImage()`. Requires a DOM canvas, so
 * this is browser-only; callers must not invoke it during SSR.
 */
export function createVesselSilhouetteImage(
  color: string,
  silhouette: VesselSilhouette,
  directional: boolean,
): ImageData {
  const size = VESSEL_SPRITE_SIZE;
  const ctx = spriteContext(size);
  traceSilhouette(ctx, silhouette, directional, size);
  paint(ctx, color);
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Every sprite the renderer must register, as `[id, ImageData]` pairs.
 *
 * The full cartesian product of colour × silhouette × directionality —
 * 8 × 4 × 2 = 64 sprites of 30×30 RGBA, about 230 KB, built once at
 * mount. The id for each comes from `vesselSpriteId()`, the same
 * function `vesselIconId()` uses, so registration and lookup cannot
 * disagree.
 */
export function buildVesselSprites(): ReadonlyArray<readonly [string, ImageData]> {
  return VESSEL_COLOR_KEYS.flatMap((colorKey) =>
    VESSEL_SILHOUETTES.flatMap((silhouette) =>
      [true, false].map(
        (directional) =>
          [
            vesselSpriteId(colorKey, silhouette, directional),
            createVesselSilhouetteImage(VESSEL_SPRITE_COLORS[colorKey], silhouette, directional),
          ] as const,
      ),
    ),
  );
}
