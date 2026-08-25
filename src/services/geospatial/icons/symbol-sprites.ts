/**
 * GIP — Operational symbol sprites (ports, anchorage, incidents, weather).
 *
 * Drawn programmatically from the shared symbol tokens in
 * `@/lib/map-symbols`, the same definitions the legend renders as inline
 * SVG. One geometry source means a legend glyph and its map symbol can
 * never disagree.
 */
import { MAP_SYMBOLS, MAP_SYMBOL_GRID, type MapSymbolKind } from "@/lib/map-symbols";

/** Canvas edge length for operational symbol sprites, in pixels. */
export const SYMBOL_SPRITE_SIZE = 26;

/** MapLibre image id for a symbol kind. */
export function symbolSpriteId(kind: MapSymbolKind): string {
  return `symbol-${kind}`;
}

/** Kinds rendered as point sprites on the map. Zones are drawn as geometry. */
export const SYMBOL_SPRITE_KINDS: readonly MapSymbolKind[] = [
  "port",
  "anchorage",
  "incident",
  "weather-alert",
] as const;

/**
 * Draw one operational symbol.
 *
 * Requires a DOM canvas, so this is browser-only; callers must not
 * invoke it during SSR.
 */
export function createSymbolImage(
  kind: MapSymbolKind,
  size = SYMBOL_SPRITE_SIZE,
  colorOverride?: string,
): ImageData {
  const token = MAP_SYMBOLS[kind];
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(`Canvas 2D context unavailable — cannot build ${kind} sprite`);
  }
  ctx.clearRect(0, 0, size, size);

  const scale = size / MAP_SYMBOL_GRID;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineJoin = "round";

  const color = colorOverride ?? token.color;
  const body = new Path2D(token.path);

  if (token.outlined) {
    if (token.dashed) ctx.setLineDash([3, 2]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.stroke(body);
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = color;
    ctx.fill(body);
    // A thin light outline keeps the silhouette readable over both the
    // pale institutional sea and the white landmass.
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1;
    ctx.stroke(body);
  }

  if (token.detail) {
    ctx.fillStyle = token.detailColor ?? "#FFFFFF";
    ctx.fill(new Path2D(token.detail));
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, size, size);
}

/** Every operational sprite the renderer must register. */
export function buildSymbolSprites(): ReadonlyArray<readonly [string, ImageData]> {
  return SYMBOL_SPRITE_KINDS.map(
    (kind) => [symbolSpriteId(kind), createSymbolImage(kind)] as const,
  );
}
