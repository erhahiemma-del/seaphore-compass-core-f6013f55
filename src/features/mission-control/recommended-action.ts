/**
 * What the officer should do next, derived from state that exists.
 *
 * The requirement is one clear operational action area. The temptation
 * is to generate a plausible-sounding suggestion; the rule here is that
 * every recommendation traces to a condition the system can actually
 * observe, and when nothing is observable the surface says so rather
 * than manufacturing urgency.
 *
 * ## The ordering, and why it is this way round
 *
 * A blocked *source* outranks a mode's standing advice. If a KPI cannot
 * report because credentials are missing, telling the officer to go and
 * review revenue figures sends them to a panel that cannot answer —
 * they would arrive, find nothing, and learn the recommendation is
 * decorative. Fixing the dependency is genuinely the next action.
 *
 * Beneath that, the lens's own first action applies: a real route,
 * declared per mode, already asserted to exist.
 *
 * Beneath *that* is silence. "No immediate action requires your
 * attention" is a legitimate operational state, and dressing it up
 * would train officers to discount the panel on the days it matters.
 *
 * ## It carries no counts
 *
 * The reason names a condition, never a quantity. A number here would
 * have to be derived, and every derived number is one an officer can
 * find disagreeing with the panel behind it.
 */
import type { KpiCoverage, RootCause } from "@/lib/intelligence/coverage-model";

import type { MissionMode } from "./modes";

/** Why this action is being recommended. Drives emphasis, not colour alone. */
export type ActionUrgency =
  /** A dependency is blocking intelligence from reporting at all. */
  | "blocked"
  /** Ordinary operational work suggested by the active lens. */
  | "routine"
  /** Nothing observable requires attention. */
  | "none";

export interface RecommendedNextAction {
  readonly urgency: ActionUrgency;
  readonly headline: string;
  /** One sentence stating what was observed. Never a fabricated count. */
  readonly reason: string;
  /** An existing route, or null when there is nothing to do. */
  readonly href: string | null;
  readonly actionLabel: string | null;
}

/**
 * Root causes that stop a KPI reporting, worst first.
 *
 * Deliberately excludes `EMPTY_EVIDENCE`: a provider that answered and
 * found nothing is working correctly, and sending an officer to
 * "resolve" an honest absence would be a false errand.
 */
const BLOCKING_CAUSES: readonly RootCause[] = [
  "CREDENTIALS_INVALID",
  "CREDENTIALS_MISSING",
  "PROVIDER_MISSING",
  "PROVIDER_OFFLINE",
  "API_FAILURE",
  "RATE_LIMITED",
  "PROJECTION_MISSING",
  "DASHBOARD_MAPPING_ERROR",
  "CANONICAL_UIP_MISSING",
];

/** Officer-facing phrasing for each blocking cause. */
const CAUSE_PHRASE: Readonly<Record<string, string>> = {
  CREDENTIALS_INVALID: "credentials were rejected",
  CREDENTIALS_MISSING: "credentials have not been configured",
  PROVIDER_MISSING: "no provider is registered",
  PROVIDER_OFFLINE: "the provider is not responding",
  API_FAILURE: "the provider returned an error",
  RATE_LIMITED: "the provider is rate limited",
  PROJECTION_MISSING: "no projection maps this intelligence",
  DASHBOARD_MAPPING_ERROR: "the dashboard is reading the wrong field",
  CANONICAL_UIP_MISSING: "no canonical record exists yet",
};

/**
 * Decide the single next action.
 *
 * Pure, and takes coverage as an argument rather than reading the query,
 * so the rule is testable without a server round trip.
 */
export function deriveRecommendedAction(
  mode: MissionMode,
  kpis: readonly KpiCoverage[] | undefined,
): RecommendedNextAction {
  /*
   * A blocked dependency first, worst cause first.
   *
   * Scanning by cause severity rather than by KPI order means the
   * officer is pointed at the most consequential blockage, not merely
   * the first one the coverage model happened to list.
   */
  for (const cause of BLOCKING_CAUSES) {
    const blocked = (kpis ?? []).find((kpi) => kpi.rootCause === cause);
    if (!blocked) continue;
    return Object.freeze({
      urgency: "blocked" as const,
      headline: `${blocked.title} cannot report`,
      reason: `${blocked.stateLabel} — ${CAUSE_PHRASE[cause] ?? "the dependency is unavailable"}. Intelligence in this domain is incomplete until it is resolved.`,
      // The coverage model already knows where the providers behind a
      // KPI are inspected; using its own link keeps this from inventing
      // a destination.
      href: blocked.providerCatalogHref || "/data-sources",
      actionLabel: "Review source health",
    });
  }

  const first = mode.actions[0];
  if (first) {
    return Object.freeze({
      urgency: "routine" as const,
      headline: first.label,
      reason: first.rationale,
      href: first.href,
      actionLabel: "Open",
    });
  }

  return Object.freeze({
    urgency: "none" as const,
    headline: "No immediate action requires your attention",
    reason:
      "Nothing observable in the current perspective is blocked or awaiting a decision from you.",
    href: null,
    actionLabel: null,
  });
}
