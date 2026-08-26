/**
 * Visual hierarchy rules for Mission Control.
 *
 * Phase 2.5 made the page's *order* mode-driven. Seven KPI cards of
 * identical weight still read as a wall: order tells an officer where to
 * start only if they already know to read left to right, and nothing on
 * screen said which of the seven mattered.
 *
 * These rules turn ordering into emphasis. They are pure data
 * transforms over the existing mode configuration and the existing
 * coverage model — no new KPI system, no new values, and nothing here
 * decides what a KPI *says*.
 */
import type { KpiDomainKey } from "@/lib/intelligence/coverage-model";

import {
  COMPOSABLE_PANELS,
  orderKpis,
  orderPanels,
  type MissionMode,
  type MissionPanelId,
} from "./modes";

/**
 * How prominently one KPI is drawn.
 *
 * Three tiers rather than a score, because the officer reads position
 * and size, not a number. `background` is still rendered — demotion,
 * never omission, is the rule the whole mode system rests on.
 */
export type KpiTier = "lead" | "secondary" | "background";

export interface TieredKpi<T> {
  readonly item: T;
  readonly tier: KpiTier;
}

/** How many KPIs sit in the middle tier before the rest recede. */
const SECONDARY_COUNT = 2;

/**
 * Assign a tier to every KPI, in the active lens's order.
 *
 * Generic over the caller's KPI shape so this works on `RIBBON_KPIS`
 * rows without importing them — the rule is about position, not about
 * what a row contains.
 *
 * Every input appears in the output exactly once. A KPI that fell off
 * the end would be a state an officer could no longer see, and the
 * whole point of tiering rather than filtering is that a blocked
 * provider stays visible even when the lens does not lead with it.
 */
export function tierKpis<T>(
  mode: MissionMode,
  items: readonly T[],
  keyOf: (item: T) => KpiDomainKey,
): readonly TieredKpi<T>[] {
  const rank = new Map(orderKpis(mode, items.map(keyOf)).map((key, index) => [key, index]));
  const ordered = [...items].sort(
    (a, b) =>
      (rank.get(keyOf(a)) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(keyOf(b)) ?? Number.MAX_SAFE_INTEGER),
  );
  return Object.freeze(
    ordered.map((item, index) => ({
      item,
      tier: (index === 0
        ? "lead"
        : index <= SECONDARY_COUNT
          ? "secondary"
          : "background") as KpiTier,
    })),
  );
}

/**
 * Which supporting panel a lens opens on.
 *
 * The lens's highest-priority composable panel — so Revenue Assurance
 * opens on revenue and Port Intelligence on ports, without the officer
 * having to hunt for it.
 */
export function defaultSupportingPanel(mode: MissionMode): MissionPanelId {
  return orderPanels(mode, COMPOSABLE_PANELS)[0];
}

/**
 * Reconcile the lens's default with the officer's own choice.
 *
 * Choices are remembered *per lens*, which is the only reading that
 * satisfies both rules at once. Keeping one global choice would mean
 * switching to Revenue Assurance and still staring at ports — the lens
 * change would do nothing. Discarding the choice on every mode switch
 * would throw away a deliberate selection the moment the officer looked
 * at something else and came back.
 *
 * Per-lens memory means switching away and returning restores what they
 * were doing there, and a lens they have never touched opens where it
 * should.
 */
export function resolveSupportingPanel(
  mode: MissionMode,
  officerChoices: Readonly<Partial<Record<string, MissionPanelId>>>,
): MissionPanelId {
  const chosen = officerChoices[mode.id];
  // Guard against a stale choice for a panel that no longer composes.
  if (chosen && COMPOSABLE_PANELS.includes(chosen)) return chosen;
  return defaultSupportingPanel(mode);
}
