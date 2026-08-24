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
import { RISK_COLORS } from "../constants";

/** Canvas edge length for every vessel sprite, in pixels. */
export const VESSEL_SPRITE_SIZE = 30;

/**
 * Sprite ids, matching `vesselIconId()` in `vessel.ts`.
 *
 * The two are asserted equal in the unit tests — a mismatch would silently
 * render nothing, because MapLibre skips features whose `icon-image` names an
 * unregistered sprite.
 */
export const VESSEL_SPRITE_VARIANTS: Readonly<Record<string, string>> = {
  "vessel-critical": RISK_COLORS.CRITICAL,
  "vessel-high": RISK_COLORS.HIGH,
  "vessel-medium": RISK_COLORS.MEDIUM,
  "vessel-low": RISK_COLORS.LOW,
  "vessel-clean": RISK_COLORS.CLEAN,
  "vessel-unknown": RISK_COLORS.UNKNOWN,
  /** Selection overrides risk colour. */
  "vessel-selected": "#0E7C7B",
  /** Stale position — dark grey, deliberately recessive. */
  "vessel-stale": "#2D3748",
} as const;

/**
 * Draw a vessel silhouette pointing north.
 *
 * Returns `ImageData` ready for `map.addImage()`. Requires a DOM canvas, so
 * this is browser-only; callers must not invoke it during SSR.
 */
export function createVesselArrowImage(color: string): ImageData {
  const size = VESSEL_SPRITE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable — cannot build vessel sprites");
  }

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(size / 2, 2); // bow (north)
  ctx.lineTo(size - 4, size - 4); // starboard stern
  ctx.lineTo(size / 2, size - 8); // stern notch
  ctx.lineTo(4, size - 4); // port stern
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Draw the port marker: a teal diamond.
 *
 * Ports are deliberately a different *shape* from vessels, not merely a
 * different colour — shape survives colour-blindness and greyscale printing,
 * which vessel risk colours do not.
 */
export function createPortDiamondImage(color = "#0E7C7B"): ImageData {
  const size = 20;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable — cannot build port sprite");
  }

  const half = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(half, 2);
  ctx.lineTo(size - 2, half);
  ctx.lineTo(half, size - 2);
  ctx.lineTo(2, half);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Draw a non-directional vessel marker.
 *
 * Used where no bearing was reported. A disc has no nose, so it cannot
 * be misread as pointing anywhere — which is the whole point: the arrow
 * sprite at rotation zero looks exactly like a vessel steaming north.
 */
export function createVesselDiscImage(color: string): ImageData {
  const size = VESSEL_SPRITE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable — cannot build vessel sprites");
  }

  ctx.clearRect(0, 0, size, size);
  const centre = size / 2;
  // Slightly smaller than the arrow's footprint so a field of unknown
  // vessels reads as quieter than a field of tracked ones.
  ctx.beginPath();
  ctx.arc(centre, centre, size * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Every sprite the renderer must register, as `[id, ImageData]` pairs.
 *
 * Each risk colour gets two sprites: the directional arrow, and a
 * `-nodir` disc for vessels whose course nobody reported.
 */
export function buildVesselSprites(): ReadonlyArray<readonly [string, ImageData]> {
  return Object.entries(VESSEL_SPRITE_VARIANTS).flatMap(
    ([id, color]) =>
      [
        [id, createVesselArrowImage(color)] as const,
        [`${id}-nodir`, createVesselDiscImage(color)] as const,
      ] as const,
  );
}
