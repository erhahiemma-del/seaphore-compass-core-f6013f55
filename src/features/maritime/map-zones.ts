/**
 * Where things are allowed to sit on the map.
 *
 * Every floating widget used to place itself with its own absolute
 * offsets, and two of them chose the same one: the control rail and the
 * scope block were both `left-3 top-3`, stacked on each other and
 * separated only by a z-index. Nothing caught it, because nothing was
 * comparing.
 *
 * Declaring the anchors in one table makes overlap a fact a test can
 * check rather than something noticed in a screenshot. A widget asks for
 * a zone; it does not invent a position.
 *
 * ## The rail owns the left gutter
 *
 * It is 44px of buttons at `left-3`, so it occupies roughly 12–56px.
 * Anything else on the left starts at `left-16` — clear of it with room
 * to breathe, rather than tucked against it.
 *
 * ## Stacking is about interaction, not decoration
 *
 * The rail sits above the panels it opens, because a drawer that covered
 * its own control would leave an officer unable to close it. Everything
 * else shares one level and is kept apart by position instead.
 */
export const MAP_ZONE = {
  /** The control rail. Owns the left gutter; nothing else may use it. */
  LEFT_RAIL: "absolute left-3 top-3 z-30",
  /** Scope, feed notices — anything explaining the current picture. */
  LEFT_CONTEXT: "absolute left-16 top-3 z-20",
  /** Overview and selected-entity intelligence. */
  RIGHT_CONTEXT: "absolute right-3 top-3 z-20",
  /** Coordinate and scale readouts. */
  BOTTOM_LEFT: "absolute bottom-3 left-16 z-20",
  /** The legend, and anything else keyed to the picture. */
  BOTTOM_RIGHT: "absolute bottom-3 right-3 z-20",
} as const;

export type MapZone = keyof typeof MAP_ZONE;

/**
 * The anchor half of a zone — position without the stacking level.
 *
 * Two widgets sharing a z-index is fine and common. Two sharing an
 * anchor is the collision, so that is what the contract compares.
 */
export function anchorOf(zone: MapZone): string {
  return MAP_ZONE[zone]
    .split(" ")
    .filter((token) => !token.startsWith("z-"))
    .join(" ");
}
