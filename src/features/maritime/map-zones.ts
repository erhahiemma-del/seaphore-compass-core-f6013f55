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
  /**
   * The spatial reading, on the right edge at mid-height.
   *
   * Neither corner would do. The top-right is the contextual drawer's,
   * and the bottom-right belongs to the legend and the assistant below
   * it. Mid-height is the one edge an officer's eye can reach without
   * leaving the chart, and it is empty.
   */
  RIGHT_READOUT: "absolute right-3 top-1/2 -translate-y-1/2 z-20",
  /**
   * Voice command, on the bottom edge at centre.
   *
   * The one position on the chart an officer can reach without looking
   * for it, which is the whole point of a control you press while your
   * eyes are on the map. Every corner is spoken for; the centre of the
   * bottom edge is not, and it puts the affordance where a hand already
   * rests between the rail and the timeline.
   *
   * Shares the common level and is kept apart by position, like every
   * overlay that is not the rail. It first claimed `z-30` so its readout
   * would sit over the others, which tied the rail and broke the one
   * rule the stacking has: the rail must be strictly above everything,
   * or a drawer can cover the control that closes it. Position was
   * always the right instrument here — the readout opens upward from the
   * bottom edge into the one part of the chart nothing else occupies.
   */
  VOICE: "absolute bottom-3 left-1/2 -translate-x-1/2 z-20",
  /**
   * The legend, and anything else keyed to the picture.
   *
   * Lifted clear of the assistant below. It sat at `bottom-3` and the
   * launcher covered it — measured at 579-701 x 598-624 against the
   * launcher's 564-692 x 607-642, overlapping in both axes. The officer
   * saw the legend's count with a button on top of it.
   */
  BOTTOM_RIGHT: "absolute bottom-28 right-3 z-20",
} as const;

/**
 * Space the application's assistant launcher occupies, in this corner.
 *
 * Not a zone anything may claim — a reservation. `GlobalCopilotLauncher`
 * is mounted by the shell for every environment at `fixed bottom-16
 * right-6`, so Maritime Command cannot move it without moving it
 * everywhere. Recording its footprint here is what lets a map widget be
 * placed around it deliberately rather than discovering the overlap in a
 * screenshot.
 */
export const ASSISTANT_RESERVED = {
  /** Tailwind units from the bottom edge, including the launcher's height. */
  bottomUnits: 25,
  right: "right-6",
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
