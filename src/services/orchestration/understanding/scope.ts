/**
 * Orchestration — scope resolution and workspace mode selection.
 *
 * ## The contamination rule
 *
 * This module exists because of one defect: an open investigation was
 * allowed to narrow every subsequent question to its own subject, so
 * "what vessels are live?" answered about one vessel.
 *
 * The fix is a rule, not a heuristic:
 *
 *   A question inherits ambient context ONLY when it names no subject of
 *   its own AND is not globally scoped.
 *
 * Everything else — a named vessel, a named company, a fleet-wide
 * question, an executive brief — makes the ambient investigation passive.
 * The officer never has to clear context manually, because context is
 * never assumed in the first place.
 */
import type {
  ContextPolicy,
  EntityKind,
  OfficerIntent,
  QueryScope,
  ResolvedEntity,
  WorkspaceMode,
} from "./types";

/**
 * Intents that are about the whole picture by definition.
 *
 * A question in this set is never narrowed to whatever happens to be open,
 * even when an entity is also mentioned: "how does Ocean Pearl compare to
 * the fleet?" is a fleet question.
 */
const GLOBAL_INTENTS: ReadonlySet<OfficerIntent> = new Set([
  "fleet-intelligence",
  "executive-brief",
  "strategic-summary",
  "trend-analysis",
]);

/** The entity kind each intent is primarily about, when it has one. */
const PREFERRED_ENTITY: Readonly<Record<OfficerIntent, EntityKind | null>> = {
  "fleet-intelligence": null,
  "vessel-investigation": "vessel",
  "manifest-intelligence": "manifest",
  "cargo-intelligence": "container",
  "container-intelligence": "container",
  "ownership-intelligence": "company",
  "company-intelligence": "company",
  "compliance-intelligence": "vessel",
  "revenue-intelligence": null,
  "port-intelligence": "port",
  "voyage-intelligence": "vessel",
  "risk-assessment": "vessel",
  "operational-recommendation": null,
  "strategic-summary": null,
  "executive-brief": null,
  "pattern-detection": null,
  "trend-analysis": null,
  "historical-replay": "vessel",
  comparison: null,
  "natural-language-search": null,
  "officer-notes": null,
  "mission-planning": null,
  unknown: null,
};

export function preferredEntityKind(intent: OfficerIntent): EntityKind | null {
  return PREFERRED_ENTITY[intent];
}

/**
 * How wide the question reaches.
 *
 * Scope follows the question's own content: a named entity narrows it, a
 * global intent widens it, and nothing on screen influences either.
 */
export function resolveScope(
  intent: OfficerIntent,
  entities: readonly ResolvedEntity[],
  primary: ResolvedEntity | null,
): QueryScope {
  if (GLOBAL_INTENTS.has(intent)) {
    return intent === "fleet-intelligence" ? "fleet" : "global";
  }
  if (intent === "officer-notes") return "session";
  if (intent === "revenue-intelligence" && entities.length === 0) return "global";

  if (primary) {
    switch (primary.kind) {
      case "company":
        return "company";
      case "port":
        return "port";
      default:
        return "entity";
    }
  }

  // No entity found. That is not the same as a global question: an intent
  // that is *about* a specific thing stays entity-scoped even when the
  // question did not name one, so a follow-up like "and her compliance
  // history?" can inherit the subject instead of silently widening to the
  // whole fleet.
  return PREFERRED_ENTITY[intent] ? "entity" : "global";
}

/**
 * Whether ambient workspace context may narrow this query.
 *
 * The whole rule, in one place. A question that named its own subject
 * carries its own context; a globally-scoped one rejects context by
 * definition. Only a subject-less, non-global question — a genuine
 * follow-up like "and its owner?" — inherits.
 */
export function resolveContextPolicy(
  scope: QueryScope,
  entities: readonly ResolvedEntity[],
): ContextPolicy {
  if (entities.length > 0) return "passive";
  if (scope === "global" || scope === "fleet") return "passive";
  return "inherit";
}

/**
 * The layout that answers this question.
 *
 * One mode per operational question. Where an intent could plausibly land
 * in two, it goes to the one whose panels answer it in the fewest steps:
 * a risk assessment of a named vessel is an investigation, because that is
 * the layout with the evidence and the timeline on it.
 */
export function resolveWorkspaceMode(
  intent: OfficerIntent,
  scope: QueryScope,
  primary: ResolvedEntity | null,
): WorkspaceMode {
  switch (intent) {
    case "fleet-intelligence":
      return "fleet-overview";
    case "executive-brief":
    case "strategic-summary":
      return "executive-briefing";
    case "vessel-investigation":
      return "investigation";
    case "company-intelligence":
      return "company-intelligence";
    case "ownership-intelligence":
      return "ownership";
    case "manifest-intelligence":
      return "manifest-intelligence";
    case "cargo-intelligence":
    case "container-intelligence":
      return "cargo-intelligence";
    case "port-intelligence":
      return "port-operations";
    case "compliance-intelligence":
      return "compliance";
    case "revenue-intelligence":
      return "revenue";
    case "voyage-intelligence":
      return "voyage";
    case "pattern-detection":
    case "trend-analysis":
      return "pattern-analysis";
    case "historical-replay":
      return "timeline";
    case "operational-recommendation":
    case "mission-planning":
      return "decision-support";
    case "comparison":
      // A comparison of two named things is an investigation of both; a
      // comparison across the fleet is a pattern question.
      return primary ? "investigation" : "pattern-analysis";
    case "risk-assessment":
      return primary ? "investigation" : "fleet-overview";
    case "officer-notes":
      return "evidence-review";
    case "natural-language-search":
    case "unknown":
      // With a subject, show the subject; without one, show the fleet.
      // Never a blank workspace.
      return primary ? "investigation" : scope === "fleet" ? "fleet-overview" : "fleet-overview";
  }
}
