/**
 * Orchestration · Understanding — types for query understanding.
 *
 * Distinct from the parent engine's `types.ts`, which contracts the
 * retrieval pipeline (`OfficerQuery`, `Intent`, `Briefing`). These types
 * contract the stage that runs *before* it: what was asked, about whom,
 * over what period, and which workspace answers it.
 *
 * The officer asks a question. Before any answer is composed, the platform
 * has to establish what was asked, about whom, over what period, and which
 * parts of the system can speak to it. That is a `QueryUnderstanding`, and
 * every downstream stage reads it rather than re-reading the raw text.
 *
 * ## This module classifies; it does not conclude
 *
 * Nothing here produces intelligence. It routes. Findings still come from
 * `@/services/intelligence`, priority from OSAE, confidence from
 * `reasoning`. The one number this layer owns is `intentConfidence` — how
 * sure the *classifier* is about what was asked — and it is never displayed
 * as confidence in an answer.
 */
import type { RiskModuleId } from "@/services/intelligence";

/** Re-exported so planning code has one import for the whole contract. */
export type { RiskModuleId };

/**
 * What the officer is trying to do.
 *
 * Deliberately flat rather than hierarchical: a hierarchy would force
 * questions that straddle two branches ("revenue exposure of Maersk's
 * fleet") into one, and the planner would silently drop the other.
 */
export type OfficerIntent =
  | "fleet-intelligence"
  | "vessel-investigation"
  | "manifest-intelligence"
  | "cargo-intelligence"
  | "container-intelligence"
  | "ownership-intelligence"
  | "company-intelligence"
  | "compliance-intelligence"
  | "revenue-intelligence"
  | "port-intelligence"
  | "voyage-intelligence"
  | "risk-assessment"
  | "operational-recommendation"
  | "strategic-summary"
  | "executive-brief"
  | "pattern-detection"
  | "trend-analysis"
  | "historical-replay"
  | "comparison"
  | "natural-language-search"
  | "officer-notes"
  | "mission-planning"
  /*
   * Instructions rather than questions.
   *
   * The taxonomy above describes what an officer wants to *know*. These
   * describe what they want the system to *do*, and they live in the
   * same union on purpose: one classifier reading one sentence, so that
   * "show me Opobo Pioneer" cannot mean one thing typed and another
   * spoken. Everything downstream that switches on an intent is an
   * exhaustive record, so adding them here forces every consumer to say
   * what it does with a command.
   */
  | "map-navigation"
  | "map-zoom"
  | "vessel-selection"
  | "vessel-track"
  | "source-switch"
  | "approach-intelligence"
  | "unknown";

/**
 * How wide the question reaches.
 *
 * `scope` is what stops an open investigation leaking into an unrelated
 * search: a `global` question is answered against the whole fleet no
 * matter what is on screen.
 */
export type QueryScope = "global" | "fleet" | "entity" | "company" | "port" | "area" | "session";

/** Workspace layouts. One per operational question an officer can be asking. */
export type WorkspaceMode =
  | "fleet-overview"
  | "executive-briefing"
  | "investigation"
  | "company-intelligence"
  | "manifest-intelligence"
  | "cargo-intelligence"
  | "port-operations"
  | "compliance"
  | "ownership"
  | "revenue"
  | "voyage"
  | "pattern-analysis"
  | "timeline"
  | "evidence-review"
  | "decision-support";

/** Kinds of thing a question can be about. */
export type EntityKind = "vessel" | "company" | "port" | "container" | "manifest" | "voyage";

/**
 * An entity named in the question.
 *
 * `confidence` grades the *extraction* — how sure we are the officer meant
 * this entity — and is unrelated to any confidence attached to intelligence
 * about it. `identifier` is populated only when the text carried a real
 * identifier; a name alone leaves it null rather than inviting a guess.
 */
export interface ResolvedEntity {
  readonly kind: EntityKind;
  /** Verbatim span from the question. */
  readonly text: string;
  /** IMO, MMSI or container number when one was actually present. */
  readonly identifier: string | null;
  readonly identifierKind: "imo" | "mmsi" | "container" | null;
  readonly confidence: number;
}

/** The period the question covers. */
export interface TimeWindow {
  readonly fromMs: number;
  readonly toMs: number;
  /** Officer-facing description, e.g. "last 24 hours". */
  readonly label: string;
  /**
   * True when no period was stated and the window came from the intent's
   * default. Surfaced so the officer can see they are looking at an assumed
   * period rather than one they chose.
   */
  readonly inferred: boolean;
}

/**
 * What the ambient workspace context may do to this query.
 *
 * The bug this exists to prevent: an open investigation silently narrowing
 * every later question to its own subject, so "what vessels are live?"
 * answers about one vessel.
 */
export type ContextPolicy =
  /** The question named its own subject, or is global. Ignore ambient context. */
  | "passive"
  /** The question is a follow-up with no subject of its own. Inherit it. */
  | "inherit";

/** Datasets the planner can call for. Named as the officer would name them. */
export type DatasetId =
  | "fleet-positions"
  | "ais-events"
  | "risk-modules"
  | "ownership-registry"
  | "sanctions-lists"
  | "compliance-records"
  | "port-calls"
  | "manifests"
  | "revenue-assessments"
  | "weather";

/** Which datasets and modules the question needs, and which it cannot have. */
export interface RetrievalPlan {
  readonly datasets: readonly DatasetId[];
  readonly modules: readonly RiskModuleId[];
  /**
   * Datasets the question wanted that no connector can serve today, each
   * with its reason. Reported, never silently dropped — an officer who
   * cannot see the hole in the coverage cannot judge the answer.
   */
  readonly unavailable: readonly { readonly dataset: DatasetId; readonly reason: string }[];
}

/**
 * Everything established about a question before any answer is composed.
 *
 * Produced by `understand()`. Conversation is the last stage of the
 * pipeline and reads this; it never runs ahead of it.
 */
export interface QueryUnderstanding {
  readonly query: string;
  readonly intent: OfficerIntent;
  /** Confidence in the *classification*, not in any answer. */
  readonly intentConfidence: number;
  /** Runners-up, kept so an ambiguous question can be disambiguated. */
  readonly alternativeIntents: readonly OfficerIntent[];
  readonly scope: QueryScope;
  readonly entities: readonly ResolvedEntity[];
  /** The entity the workspace should centre on, when there is one. */
  readonly primaryEntity: ResolvedEntity | null;
  readonly timeWindow: TimeWindow;
  readonly workspaceMode: WorkspaceMode;
  readonly contextPolicy: ContextPolicy;
  readonly plan: RetrievalPlan;
  readonly producedAt: string;
}
