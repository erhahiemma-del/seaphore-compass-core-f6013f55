/**
 * Vessel visual classification.
 *
 * The single place that decides how a vessel is drawn, kept apart from
 * what a vessel *is*. Four concerns stay separate on purpose:
 *
 *   identity        who the vessel is            (`VesselIdentity`)
 *   classification  which visual family it joins (this module)
 *   presentation    silhouette, colour, rotation (this module)
 *   intelligence    risk and attention overlays  (OSAE, `riskLevel`)
 *
 * Collapsing them is what produces a component that cannot tell "we do
 * not know this vessel's type" apart from "this vessel is a cargo ship".
 *
 * ## Shape carries type, colour carries risk
 *
 * These are independent axes and are rendered independently. A tanker
 * and a container ship differ in silhouette whatever their risk; a
 * critical-risk vessel is red whatever it carries. Encoding both in one
 * sprite id would multiply the sprite set and make either axis
 * impossible to read on its own.
 *
 * ## Nothing is inferred
 *
 * `VesselType` is optional upstream, and a vessel whose type nobody
 * reported classifies as `UNKNOWN` — never as the most likely guess.
 * The same rule governs heading: see `resolveHeading`.
 */
import type { VesselType } from "./types";

/**
 * Visual families a vessel can belong to.
 *
 * Deliberately wider than the current `VesselType` union, which carries
 * five values. The extra families are declared so the renderer and the
 * legend already agree on their names when a provider starts supplying
 * them; until then `classifyVessel` can never return one, because no
 * input maps to it. Declaring a family is not the same as claiming we
 * can detect it.
 */
export type VesselVisualCategory =
  | "CONTAINER"
  | "TANKER"
  | "BULK"
  | "VEHICLE"
  | "PASSENGER"
  | "FISHING"
  | "TUG"
  | "OFFSHORE"
  | "UNKNOWN";

/** Silhouettes the sprite builder knows how to draw. */
export type VesselSilhouette = "arrow" | "wedge" | "block" | "disc";

export interface VesselVisual {
  readonly category: VesselVisualCategory;
  /** Officer-facing name. Used by the legend and the popup. */
  readonly label: string;
  readonly silhouette: VesselSilhouette;
  /**
   * True when a provider actually reported this vessel's type.
   *
   * The legend reads this to separate "we have these vessels" from "we
   * have vessels whose type nobody told us".
   */
  readonly typeReported: boolean;
}

/**
 * Visual definition per category.
 *
 * `UNKNOWN` is a disc rather than a pointed shape on purpose: a pointed
 * silhouette reads as a direction of travel, and an unknown vessel has
 * no direction we can vouch for.
 */
export const VESSEL_VISUALS: Readonly<
  Record<VesselVisualCategory, Omit<VesselVisual, "typeReported">>
> = {
  CONTAINER: { category: "CONTAINER", label: "Container", silhouette: "block" },
  TANKER: { category: "TANKER", label: "Tanker", silhouette: "wedge" },
  BULK: { category: "BULK", label: "Bulk carrier", silhouette: "wedge" },
  VEHICLE: { category: "VEHICLE", label: "Vehicle carrier", silhouette: "block" },
  PASSENGER: { category: "PASSENGER", label: "Passenger", silhouette: "arrow" },
  FISHING: { category: "FISHING", label: "Fishing", silhouette: "arrow" },
  TUG: { category: "TUG", label: "Tug", silhouette: "arrow" },
  OFFSHORE: { category: "OFFSHORE", label: "Offshore support", silhouette: "arrow" },
  UNKNOWN: { category: "UNKNOWN", label: "Unspecified vessel", silhouette: "disc" },
} as const;

/**
 * Categories a provider can currently produce.
 *
 * Everything else in `VESSEL_VISUALS` is declared but unreachable. The
 * legend uses this to mark those families unavailable rather than
 * implying the fleet simply contains none of them today.
 */
export const SUPPORTED_CATEGORIES: readonly VesselVisualCategory[] = [
  "CONTAINER",
  "TANKER",
  "BULK",
  "VEHICLE",
  "UNKNOWN",
] as const;

/** `VesselType` → visual family. Total over the union, so it cannot drift. */
const TYPE_TO_CATEGORY: Readonly<Record<VesselType, VesselVisualCategory>> = {
  CONTAINER: "CONTAINER",
  TANKER: "TANKER",
  BULK: "BULK",
  VEHICLE: "VEHICLE",
  // Upstream "OTHER" means "reported, but not one of the above". That is
  // still not a description of the hull, so it draws as unspecified.
  OTHER: "UNKNOWN",
};

/**
 * Classify a vessel for rendering.
 *
 * An absent type yields `UNKNOWN` with `typeReported: false`. Note that
 * `OTHER` also yields `UNKNOWN` but keeps `typeReported: true` — the
 * provider did answer, it simply had no better word. The distinction
 * matters to the legend and costs nothing to keep.
 */
export function classifyVessel(type: VesselType | undefined | null): VesselVisual {
  if (type == null) {
    return { ...VESSEL_VISUALS.UNKNOWN, typeReported: false };
  }
  const category = TYPE_TO_CATEGORY[type] ?? "UNKNOWN";
  return { ...VESSEL_VISUALS[category], typeReported: true };
}

/* ── Sprite vocabulary ────────────────────────────────────────── */

/**
 * The colour axis of a sprite id.
 *
 * Six risk bands plus the two conditions that outrank risk. Kept as its
 * own union rather than reusing `RiskLevel` because `selected` and
 * `stale` are presentation states, not assessments — a selected vessel
 * has not become less risky by being clicked on.
 */
export type VesselColorKey =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "clean"
  | "unknown"
  | "selected"
  | "stale";

export const VESSEL_COLOR_KEYS: readonly VesselColorKey[] = [
  "critical",
  "high",
  "medium",
  "low",
  "clean",
  "unknown",
  "selected",
  "stale",
] as const;

/** Every silhouette the sprite builder draws. */
export const VESSEL_SILHOUETTES: readonly VesselSilhouette[] = [
  "arrow",
  "wedge",
  "block",
  "disc",
] as const;

/**
 * Compose a sprite id from the two independent axes.
 *
 * Shape carries type, colour carries risk, and `directional` carries
 * whether a bearing was reported. All three are inputs here so that the
 * id is derived in exactly one place — `vesselIconId()` calls this, and
 * so does `vesselSpriteIds()`, which is what the renderer registers.
 * There is no second spelling of the format to fall out of step.
 *
 * A `-nodir` sprite is the same hull family drawn with a blunt bow, and
 * the renderer leaves it unrotated. Both halves matter: an unrotated
 * *pointed* sprite still points somewhere, which is the bug this whole
 * vocabulary exists to prevent.
 */
export function vesselSpriteId(
  colorKey: VesselColorKey,
  silhouette: VesselSilhouette,
  directional: boolean,
): string {
  return `vessel-${colorKey}-${silhouette}${directional ? "" : "-nodir"}`;
}

/**
 * Every sprite id the renderer must register.
 *
 * The cartesian product of colour, silhouette and directionality. Pure —
 * no canvas, no DOM — so a test can assert that everything
 * `vesselIconId()` can produce is registered without needing a
 * rendering context.
 */
export function vesselSpriteIds(): readonly string[] {
  return VESSEL_COLOR_KEYS.flatMap((colorKey) =>
    VESSEL_SILHOUETTES.flatMap((silhouette) => [
      vesselSpriteId(colorKey, silhouette, true),
      vesselSpriteId(colorKey, silhouette, false),
    ]),
  );
}

/* ── Heading ──────────────────────────────────────────────────── */

export interface ResolvedHeading {
  /** Degrees to rotate the sprite. Meaningless unless `known` is true. */
  readonly degrees: number;
  /**
   * Whether a bearing was actually reported.
   *
   * False means the renderer must draw a non-directional symbol. A
   * vessel pointed north because its course field defaulted to zero is
   * indistinguishable, on screen, from one genuinely steaming north.
   */
  readonly known: boolean;
  /** Why the heading is unusable, for the popup. Null when known. */
  readonly reason: string | null;
}

const UNKNOWN_HEADING: ResolvedHeading = {
  degrees: 0,
  known: false,
  reason: "No course reported for this vessel.",
};

/**
 * Decide whether a heading can be drawn, and at what angle.
 *
 * `reported` is the availability signal from the source. It exists
 * because `VesselPosition.heading` is a required number: a provider that
 * omits course still produces a heading of `0`, which renders as due
 * north. Without a separate flag there is no way to tell that apart from
 * a real northerly course.
 *
 * Values outside 0–359 are wrapped rather than rejected; a course of
 * 370° is a wrapping bug upstream, not an absence of information. NaN
 * and Infinity are treated as absent, because they carry no bearing.
 */
export function resolveHeading(
  heading: number | null | undefined,
  reported: boolean | undefined,
): ResolvedHeading {
  if (reported === false) return UNKNOWN_HEADING;
  if (heading == null || !Number.isFinite(heading)) {
    return { ...UNKNOWN_HEADING, reason: "Course value is not a usable bearing." };
  }
  return { degrees: ((heading % 360) + 360) % 360, known: true, reason: null };
}
