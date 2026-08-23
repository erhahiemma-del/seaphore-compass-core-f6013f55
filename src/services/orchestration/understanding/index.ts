/**
 * Orchestration · Understanding — public API.
 *
 * ## What this is, and what it is not
 *
 * The Intelligence Orchestration Engine in the parent directory already
 * runs the retrieval pipeline: Intent → Scheduler → IAL → IFE/UIP →
 * Reasoning → Briefing → IPEF. This submodule does **not** replace any of
 * it and does not classify for it.
 *
 * It answers a different question. `intent-classifier.ts` classifies to
 * decide *which agents to call*, producing a four-value `mode` and a
 * capability list. This module classifies to decide *which workspace the
 * officer should be looking at*, producing an intent from the G6.0
 * taxonomy plus scope, time window, and — the reason it exists — a
 * context policy.
 *
 * The two run at different moments. Understanding is synchronous and
 * pure, so the workspace can reconfigure the instant the officer submits;
 * retrieval follows and may take seconds.
 *
 * `toIceIntent` maps back to ICE's connector-planning vocabulary so the
 * existing source planner is reused rather than reimplemented.
 */
export { classifyOfficerIntent, toIceIntent, type IntentClassification } from "./intent";
export { primaryEntityFor, resolveEntities } from "./entity";
export { planRetrieval, type PlanOptions } from "./planner";
export {
  preferredEntityKind,
  resolveContextPolicy,
  resolveScope,
  resolveWorkspaceMode,
} from "./scope";
export { resolveTimeWindow } from "./time";
export { understand, type UnderstandOptions } from "./understand";
export type {
  ContextPolicy,
  DatasetId,
  EntityKind,
  OfficerIntent,
  QueryScope,
  QueryUnderstanding,
  ResolvedEntity,
  RetrievalPlan,
  TimeWindow,
  WorkspaceMode,
} from "./types";
