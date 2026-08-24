/**
 * Demo-fixture gate.
 *
 * The lifecycle surfaces — Detect, Investigate, Decide, Share, Memory —
 * have no provider behind them. Their content comes entirely from
 * `lifecycle-data.ts`, which is invented. Retiring it would leave five
 * blank routes; rendering it unmarked would put fabricated vessel events
 * in front of an officer as though they were intelligence.
 *
 * So it renders, and it says what it is.
 *
 * This deliberately reuses `IS_DEV_BUILD` rather than introducing another
 * environment flag. That constant is already the repository's single
 * source of truth for compile-time gating, it is already dead-code
 * eliminated by Rollup in production builds, and `verify-prod-bundle.mjs`
 * already proves the elimination worked. A second flag would be a second
 * thing to get wrong.
 */
import { IS_DEV_BUILD } from "@/lib/dev/env";

/**
 * Whether demo fixtures may be rendered at all.
 *
 * A compile-time constant, so `if (DEMO_DATA_ENABLED)` branches vanish
 * from production bundles rather than being evaluated at runtime.
 */
export const DEMO_DATA_ENABLED = IS_DEV_BUILD;

/**
 * The provenance every fixture-backed claim carries.
 *
 * Named as a value rather than a comment so a surface can render it, and
 * so a test can assert on it.
 */
export const DEMO_PROVENANCE = "SIMULATED — not an observation" as const;

/**
 * Guard a fixture dataset.
 *
 * Returns the fixtures where demo data is permitted, and an empty set
 * otherwise. Callers must handle empty honestly: an empty list means
 * "there is nothing to show here", which is true, rather than standing
 * in for data that was never collected.
 */
export function demoOnly<T>(fixtures: readonly T[]): readonly T[] {
  return DEMO_DATA_ENABLED ? fixtures : [];
}
