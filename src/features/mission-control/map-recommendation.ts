/**
 * Mission mode map recommendations, and why they are only recommendations.
 *
 * A mode declares which logical layers suit its lens. The obvious
 * implementation — write those into `MapState.activeLayers` when the
 * mode changes — is the wrong one, and the reason is worth stating
 * plainly: an officer who switched the EEZ off, turned buildings on and
 * arranged the map for the job in front of them would have that
 * arrangement silently destroyed by clicking a tab. Mission Control
 * would be overruling the person operating it.
 *
 * So the model here is *advisory*. The mode says what it would show; the
 * officer's layers stay exactly as they left them; and the difference
 * between the two is surfaced as something they can apply in one action
 * if they want it.
 *
 * ## Precedence
 *
 *   system default          the registry's `defaultVisible`
 *   mode recommendation     advisory only — never written automatically
 *   officer override        authoritative, always
 *
 * Focus context sits alongside rather than above: selecting a port does
 * not entitle the map to switch layers either.
 *
 * ## No second layer store
 *
 * There is exactly one source of truth for which layers are on —
 * `MapState.activeLayers`, owned by SGS. This module holds no state at
 * all. It compares a mode's recommendation against what SGS already
 * reports and describes the difference. An "override" is not recorded
 * anywhere, because it does not need to be: whatever SGS says is on *is*
 * the officer's choice, by definition.
 */
import type { MissionMapLayerKey, MissionMode } from "./modes";

export interface MapRecommendation {
  /** Layers this lens suggests, as logical registry keys. */
  readonly recommended: readonly MissionMapLayerKey[];
  /** Recommended layers the officer does not currently have on. */
  readonly missing: readonly MissionMapLayerKey[];
  /** Layers the officer has on that this lens does not suggest. */
  readonly extra: readonly string[];
  /**
   * True when the active layers already satisfy the recommendation.
   *
   * "Satisfied" deliberately ignores `extra`: a lens suggesting four
   * layers has no opinion about a fifth the officer added, and treating
   * their addition as a deviation to be corrected would be the same
   * overreach in a quieter form.
   */
  readonly satisfied: boolean;
}

/**
 * Compare a mode's recommendation with the officer's current layers.
 *
 * Pure, and takes the active layers as an argument rather than reading
 * SGS, so the precedence rules are testable without a store.
 */
export function recommendMapLayers(
  mode: MissionMode,
  activeLayers: readonly string[],
): MapRecommendation {
  const active = new Set(activeLayers);
  const recommended = mode.mapLayers;
  const missing = recommended.filter((layer) => !active.has(layer));
  const extra = activeLayers.filter((layer) => !(recommended as readonly string[]).includes(layer));
  return Object.freeze({
    recommended,
    missing: Object.freeze(missing),
    extra: Object.freeze(extra),
    satisfied: missing.length === 0,
  });
}

/**
 * The layer set to apply when the officer asks for the recommended view.
 *
 * Additive: it turns the mode's layers on and leaves everything the
 * officer already chose alone. Replacing the set outright would make
 * "apply recommended view" a destructive action disguised as a helpful
 * one — the officer asked to see what the lens suggests, not to lose
 * what they had.
 *
 * Only ever called from an explicit interaction. Nothing in the mode
 * change path calls it.
 */
export function applyRecommendation(
  mode: MissionMode,
  activeLayers: readonly string[],
): readonly string[] {
  const next = new Set(activeLayers);
  for (const layer of mode.mapLayers) next.add(layer);
  return Object.freeze([...next]);
}
