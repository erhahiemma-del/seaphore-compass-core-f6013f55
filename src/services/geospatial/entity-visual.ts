/**
 * Entity visual language.
 *
 * One vocabulary for how *any* map entity is drawn, so a vessel, a port
 * and a cluster share a grammar instead of each accumulating its own
 * special cases. Four axes, deliberately independent:
 *
 *   kind          what the thing is            vessel | port | cluster
 *   state         how the officer is touching  normal | hover | selected
 *   intelligence  what is attached to it       investigation | risk | alert
 *   confidence    how well it is evidenced     the OC-001 ladder
 *
 * They are independent because they answer different questions and can
 * co-occur in every combination: a selected vessel under investigation
 * whose position is inferred is one entity carrying one value on each
 * axis. Encoding any two of them in a single token — a colour that means
 * "selected and high risk" — is what makes either axis unreadable on its
 * own, and it is the failure this module exists to prevent.
 *
 * ## Nothing here decides whether an axis applies
 *
 * This module says what a value *looks like*, never which value an entity
 * has. `intelligence` and `confidence` are both nullable, and null is the
 * common case today: no map source populates them. A null renders as the
 * absence of a mark, not as a reassuring one — there is no "no risk"
 * glyph, because "nobody assessed this" and "this was assessed as safe"
 * are different facts and must not share a symbol.
 *
 * ## Why colour is never load-bearing alone
 *
 * Every axis below is legible with colour removed. Selection adds a ring,
 * hover adds a narrower one, intelligence adds a badge in a position
 * fixed per signal, and confidence varies its ring's fill, stroke alpha
 * and stroke width together — not only hue.
 * An officer reading a greyscale export, or one of the ~8% of men with a
 * colour vision deficiency, must still be able to separate the states.
 */
import { toChipTier, type ConfidenceLevel } from "@/lib/data-model/confidence";
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";

export type { ConfidenceTier };

/** The families of thing the map draws as a discrete symbol. */
export type EntityKind = "vessel" | "port" | "cluster";

/**
 * How the officer is currently touching the entity.
 *
 * Presentation only. A hovered vessel has not changed; nothing on this
 * axis may alter what the other three report.
 */
export type EntityInteractionState = "normal" | "hover" | "selected";

/**
 * Intelligence attached to an entity by another system.
 *
 * Never derived here. The map has no opinion about whether a vessel is
 * under investigation — it draws the badge when something upstream says
 * so, and draws nothing when nothing does.
 */
export type IntelligenceSignal = "investigation" | "risk" | "alert";

/**
 * Every confidence tier, in ladder order.
 *
 * Re-exported in order rather than relying on `Object.keys`, because the
 * legend renders them as a ladder and an alphabetical one would read as
 * inferred → observed → unconfirmed → verified, which is not a ladder.
 */
export const CONFIDENCE_TIERS: readonly ConfidenceTier[] = [
  "verified",
  "observed",
  "inferred",
  "unconfirmed",
] as const;

/**
 * Resolve a stored confidence level to its map tier.
 *
 * Delegates to `toChipTier` — the fixed data-ladder→chip-ladder mapping —
 * so the map cannot develop a second opinion about what CORROBORATED
 * looks like. A record with no confidence value resolves to
 * `unconfirmed`, which that module documents as a data defect rather
 * than a legitimate state; the map draws it as such and says so in the
 * legend.
 */
export function confidenceTierFor(level: ConfidenceLevel | null | undefined): ConfidenceTier {
  return toChipTier(level);
}

/* ── Palette ──────────────────────────────────────────────────── */

/**
 * Interaction colours.
 *
 * One teal family for "the officer is pointing at this", used by every
 * entity kind. Selection and hover deliberately share a hue and differ in
 * weight: they are two intensities of the same idea, and giving hover its
 * own colour would make a mouse sweep look like a state change.
 */
export const INTERACTION_COLORS = {
  /** Selection ring stroke. */
  selected: "#3FBFBE",
  /** Selection ring fill, at very low alpha. */
  selectedFill: "#0E7C7B",
  /** Hover halo. Same family, lower contrast. */
  hover: "#2A8F8E",
} as const;

/**
 * Confidence colours, pinned to the OC-001 chip values.
 *
 * Identical hexes to `ConfidenceChip` on purpose: the legend and the
 * context panels show a chip, the map shows a ring, and an officer must
 * be able to connect the two without a translation step.
 */
export const CONFIDENCE_COLORS: Readonly<Record<ConfidenceTier, string>> = {
  verified: "#1E6B3A",
  observed: "#2563EB",
  inferred: "#B06A00",
  unconfirmed: "#8A98A6",
} as const;

/**
 * Intelligence-signal colours.
 *
 * Distinct from both the risk palette and the interaction teal. An
 * investigation is an *administrative* fact — someone opened a case —
 * and must not borrow the red that means "this was assessed as
 * dangerous".
 */
export const INTELLIGENCE_COLORS: Readonly<Record<IntelligenceSignal, string>> = {
  /** Investigation: violet, matching the case-file language elsewhere. */
  investigation: "#A78BFA",
  /** Elevated risk signal. */
  risk: "#D4890A",
  /** Active alert — the only place the map uses a saturated red badge. */
  alert: "#E5484D",
} as const;

/* ── Non-colour encodings ─────────────────────────────────────── */

/**
 * How each confidence tier is drawn, beyond its colour.
 *
 * Three colour-independent channels, all moving in the same direction as
 * the evidence thins: the ring's fill drains, its stroke fades, and its
 * stroke narrows. Any one of them read alone still orders the ladder
 * correctly, which is what makes the encoding survive greyscale.
 *
 * ## Why `dash` is legend-only
 *
 * A dashed ring would be the strongest non-colour channel available, and
 * MapLibre cannot draw one: `circle-stroke-*` has no dash array, and the
 * ring has to be a circle layer so it can scale in pixels around a point
 * that moves. The legend's ring is an SVG and *can* dash, so the pattern
 * is declared here and consumed there — where it reinforces the same
 * ordering with a fourth channel rather than contradicting the map.
 */
export interface ConfidenceRingStyle {
  readonly tier: ConfidenceTier;
  readonly label: string;
  readonly color: string;
  /**
   * SVG `stroke-dasharray` for the legend glyph, or null for solid.
   * Not applicable on the map — see above.
   */
  readonly dash: readonly [number, number] | null;
  /** Fill alpha inside the ring, 0–1. */
  readonly fillOpacity: number;
  /** Ring stroke alpha, 0–1. */
  readonly strokeOpacity: number;
  /** Ring stroke width in pixels. Narrows as the evidence thins. */
  readonly strokeWidth: number;
}

export const CONFIDENCE_RING_STYLES: Readonly<Record<ConfidenceTier, ConfidenceRingStyle>> = {
  verified: {
    tier: "verified",
    label: "VERIFIED",
    color: CONFIDENCE_COLORS.verified,
    dash: null,
    fillOpacity: 0.18,
    strokeOpacity: 0.9,
    strokeWidth: 1.6,
  },
  observed: {
    tier: "observed",
    label: "OBSERVED",
    color: CONFIDENCE_COLORS.observed,
    dash: null,
    fillOpacity: 0.1,
    strokeOpacity: 0.75,
    strokeWidth: 1.3,
  },
  inferred: {
    tier: "inferred",
    label: "INFERRED",
    color: CONFIDENCE_COLORS.inferred,
    dash: [3, 2],
    fillOpacity: 0.05,
    strokeOpacity: 0.7,
    strokeWidth: 1.0,
  },
  unconfirmed: {
    tier: "unconfirmed",
    label: "UNCONFIRMED",
    color: CONFIDENCE_COLORS.unconfirmed,
    dash: [1, 2],
    fillOpacity: 0,
    strokeOpacity: 0.6,
    strokeWidth: 0.8,
  },
} as const;

/**
 * Where an intelligence badge sits relative to its entity.
 *
 * Fixed per signal so two badges on one entity cannot collide, and so an
 * officer learns position as well as colour: investigation is always
 * upper-left, risk upper-right, alert directly above. Offsets are in ems
 * of the badge's own text size, which is what MapLibre's `text-offset`
 * expects.
 */
export const INTELLIGENCE_BADGE_OFFSETS: Readonly<
  Record<IntelligenceSignal, readonly [number, number]>
> = {
  investigation: [-1.1, -1.1],
  risk: [1.1, -1.1],
  alert: [0, -1.6],
} as const;

/**
 * Officer-facing names, for the legend and any panel.
 *
 * Held here rather than in the legend component so the two cannot drift
 * into describing the same mark by different words.
 */
export const INTELLIGENCE_LABELS: Readonly<Record<IntelligenceSignal, string>> = {
  investigation: "Under investigation",
  risk: "Elevated risk signal",
  alert: "Active alert",
} as const;

export const ENTITY_KIND_LABELS: Readonly<Record<EntityKind, string>> = {
  vessel: "Vessel",
  port: "Port",
  cluster: "Entity cluster",
} as const;

/* ── Interaction geometry ─────────────────────────────────────── */

/**
 * Ring radii for the interaction states, in pixels at a reference zoom.
 *
 * Hover is deliberately *smaller* than selection. A hover mark that
 * outgrew the selection ring would make sweeping the cursor look like
 * selecting, which is the one thing hover must never imply.
 */
export const INTERACTION_RADII: Readonly<
  Record<Exclude<EntityInteractionState, "normal">, number>
> = {
  hover: 10,
  selected: 14,
} as const;

/**
 * Resolve the interaction state from the two independent flags.
 *
 * Selection outranks hover: an officer hovering the entity they already
 * selected is still looking at a selected entity, and downgrading the
 * ring under the cursor would make the selection appear to flicker.
 */
export function interactionStateFor(
  selected: boolean | undefined,
  hovered: boolean | undefined,
): EntityInteractionState {
  if (selected) return "selected";
  if (hovered) return "hover";
  return "normal";
}
