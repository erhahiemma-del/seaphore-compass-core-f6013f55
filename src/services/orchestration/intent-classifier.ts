/**
 * LAYER 2.2 — Intent Classifier.
 *
 * Determines query intent. NEVER retrieves data. Deterministic and
 * model-independent, so the pipeline can reason about scope before any
 * model call.
 *
 * ## One classification, several vocabularies
 *
 * G6.0 made the 22-intent understanding model authoritative. This module
 * no longer pattern-matches the query itself: it calls `understand()` once
 * and *projects* that single result into the vocabularies the rest of the
 * pipeline already speaks —
 *
 *   understanding.intent   → `mode`          (scheduler, perf budgets)
 *                          → `capabilities`  (capability registry, agents)
 *   understanding.entities → `entities`      (IAL bridge)
 *   understanding.workspaceMode → `workspace` (briefing builder actions)
 *
 * Because every field is derived, the two readings cannot disagree.
 * A second classifier over the same text is the drift this design
 * forecloses.
 */
import type { CapabilityId, Intent, OfficerQuery, Workspace } from "./types";
import { understand } from "./understanding";
import type { OfficerIntent, ResolvedEntity } from "./understanding/types";

/**
 * Officer intent → briefing mode.
 *
 * Mode drives scheduling depth and the performance budget, so the mapping
 * follows how much work the question implies, not what it is about: an
 * investigation and a risk assessment both warrant the full agent set.
 */
const INTENT_MODE: Readonly<Record<OfficerIntent, Intent["mode"]>> = {
  /*
   * Commands. They instruct rather than ask, so they retrieve nothing
   * and plan no briefing: the answer is the system doing the thing.
   */
  "source-switch": "lookup",
  "map-navigation": "lookup",
  "map-zoom": "lookup",
  "vessel-selection": "lookup",
  "vessel-track": "lookup",
  "vessel-investigation": "investigation",
  "risk-assessment": "investigation",
  "pattern-detection": "investigation",
  "mission-planning": "investigation",
  "company-intelligence": "investigation",

  "trend-analysis": "forecast",
  "historical-replay": "forecast",

  "ownership-intelligence": "assessment",
  "compliance-intelligence": "assessment",
  "revenue-intelligence": "assessment",
  "manifest-intelligence": "assessment",
  "cargo-intelligence": "assessment",
  "operational-recommendation": "assessment",
  "strategic-summary": "assessment",
  "executive-brief": "assessment",
  comparison: "assessment",

  "fleet-intelligence": "lookup",
  "container-intelligence": "lookup",
  "port-intelligence": "lookup",
  "voyage-intelligence": "lookup",
  "natural-language-search": "lookup",
  "officer-notes": "lookup",
  unknown: "lookup",
};

/**
 * Officer intent → capabilities.
 *
 * Ordered: the first capability is the one the Agent Scheduler consults
 * first, so it names the question's primary dimension.
 */
const INTENT_CAPABILITIES: Readonly<Record<OfficerIntent, readonly CapabilityId[]>> = {
  /*
   * Commands. They instruct rather than ask, so they retrieve nothing
   * and plan no briefing: the answer is the system doing the thing.
   */
  "source-switch": [],
  "map-navigation": [],
  "map-zoom": [],
  "vessel-selection": [],
  "vessel-track": [],
  "fleet-intelligence": ["PATTERN_DETECTION", "RISK_SCORING"],
  "vessel-investigation": [
    "PATTERN_DETECTION",
    "OWNERSHIP_ANALYSIS",
    "COMPLIANCE_ASSESSMENT",
    "SANCTIONS_SCREENING",
    "RISK_SCORING",
    "EVIDENCE_SEARCH",
  ],
  "manifest-intelligence": ["MANIFEST_CORRELATION", "DOCUMENT_ANALYSIS"],
  "cargo-intelligence": ["MANIFEST_CORRELATION", "REVENUE_LEAKAGE_DETECTION"],
  "container-intelligence": ["MANIFEST_CORRELATION", "EVIDENCE_SEARCH"],
  "ownership-intelligence": ["OWNERSHIP_ANALYSIS", "RELATIONSHIP_DISCOVERY"],
  "company-intelligence": [
    "OWNERSHIP_ANALYSIS",
    "RELATIONSHIP_DISCOVERY",
    "SANCTIONS_SCREENING",
    "PATTERN_DETECTION",
  ],
  "compliance-intelligence": ["COMPLIANCE_ASSESSMENT", "SANCTIONS_SCREENING", "RISK_SCORING"],
  "revenue-intelligence": ["REVENUE_LEAKAGE_DETECTION", "MANIFEST_CORRELATION"],
  "port-intelligence": ["PATTERN_DETECTION", "MANIFEST_CORRELATION"],
  "voyage-intelligence": ["PATTERN_DETECTION", "EVIDENCE_SEARCH"],
  "risk-assessment": ["RISK_SCORING", "PATTERN_DETECTION", "SANCTIONS_SCREENING"],
  "operational-recommendation": ["RECOMMENDATION_ENGINE", "RISK_SCORING"],
  "strategic-summary": ["PATTERN_DETECTION", "RISK_SCORING"],
  "executive-brief": ["RISK_SCORING", "RECOMMENDATION_ENGINE", "PATTERN_DETECTION"],
  "pattern-detection": ["PATTERN_DETECTION", "RELATIONSHIP_DISCOVERY"],
  "trend-analysis": ["PATTERN_DETECTION"],
  "historical-replay": ["PATTERN_DETECTION", "EVIDENCE_SEARCH"],
  comparison: ["PATTERN_DETECTION", "RELATIONSHIP_DISCOVERY"],
  "mission-planning": ["RECOMMENDATION_ENGINE", "RISK_SCORING", "PATTERN_DETECTION"],
  "natural-language-search": ["EVIDENCE_SEARCH"],
  "officer-notes": ["EVIDENCE_SEARCH"],
  unknown: ["EVIDENCE_SEARCH"],
};

/**
 * Module hint → capability.
 *
 * When a query originates from a specialist Copilot surface, that surface's
 * capability is consulted first. Retained from the pre-G6.0 classifier: the
 * hint says where the officer was standing, which the query text cannot.
 */
const MODULE_HINT_CAPABILITY: Record<string, CapabilityId> = {
  manifest: "MANIFEST_CORRELATION",
  cargo: "MANIFEST_CORRELATION",
  revenue: "REVENUE_LEAKAGE_DETECTION",
  vessel: "PATTERN_DETECTION",
  ports: "PATTERN_DETECTION",
  ownership: "OWNERSHIP_ANALYSIS",
  compliance: "COMPLIANCE_ASSESSMENT",
  evidence: "EVIDENCE_SEARCH",
  alerts: "RISK_SCORING",
  memory: "PATTERN_DETECTION",
  administration: "EVIDENCE_SEARCH",
  seaphore: "EVIDENCE_SEARCH",
};

/** Entity kind → the legacy `entities[].type` tag the IAL bridge expects. */
function legacyEntityType(entity: ResolvedEntity): string {
  if (entity.identifierKind === "imo") return "vessel_imo";
  if (entity.identifierKind === "mmsi") return "vessel_mmsi";
  if (entity.identifierKind === "container") return "container_no";
  switch (entity.kind) {
    case "company":
      return "company_name";
    case "port":
      return "port_name";
    case "vessel":
      return "vessel_name";
    default:
      return entity.kind;
  }
}

export interface ClassifyOptions {
  /** Injected so classification is deterministic in tests. */
  readonly now?: number;
  /**
   * Subject of the open investigation, if any.
   *
   * Reaches the query ONLY when the context policy resolves to `inherit`.
   * A question that named its own subject, or asked about the whole fleet,
   * never sees it — see `understanding/scope.ts`.
   */
  readonly ambientEntity?: ResolvedEntity | null;
}

/**
 * Classify an officer query.
 *
 * Backward compatible: the returned `Intent` keeps every field it had, and
 * `understanding` is added alongside. Existing consumers are unaffected;
 * new ones read the authoritative reading.
 */
export function classifyIntent(query: OfficerQuery, options: ClassifyOptions = {}): Intent {
  const understanding = understand(query.query, {
    now: options.now,
    ambientEntity: options.ambientEntity,
  });

  const capabilities: CapabilityId[] = [...INTENT_CAPABILITIES[understanding.intent]];

  // A question can name an operation and a domain at once — "forecast
  // revenue leakage" is a forecast whose subject is revenue. The primary
  // intent captures the operation; the runners-up carry the domain, and
  // dropping them would send the scheduler after the wrong specialist.
  for (const alternative of understanding.alternativeIntents) {
    const primary = INTENT_CAPABILITIES[alternative][0];
    if (primary && !capabilities.includes(primary)) capabilities.push(primary);
  }

  const moduleCapability = MODULE_HINT_CAPABILITY[query.moduleHint ?? ""];
  if (moduleCapability && !capabilities.includes(moduleCapability)) {
    capabilities.unshift(moduleCapability);
  }
  if (capabilities.length === 0) capabilities.push("EVIDENCE_SEARCH");

  // An explicit workspace on the query is the officer's own choice and
  // outranks the planner's. Otherwise the planner's mode *is* the
  // workspace — the two vocabularies were unified in G6.0.
  const workspace: Workspace = query.context?.workspace ?? understanding.workspaceMode;

  return {
    mode: INTENT_MODE[understanding.intent],
    capabilities,
    entities: understanding.entities.map((entity) => ({
      type: legacyEntityType(entity),
      value: entity.identifier ?? entity.text,
    })),
    workspace,
    raw: query.query,
    reasoning:
      `intent=${understanding.intent}@${understanding.intentConfidence}; ` +
      `scope=${understanding.scope}; context=${understanding.contextPolicy}; ` +
      `window=${understanding.timeWindow.label}${understanding.timeWindow.inferred ? " (inferred)" : ""}; ` +
      `workspace=${workspace}; capabilities=[${capabilities.join(",")}]`,
    understanding,
  };
}
