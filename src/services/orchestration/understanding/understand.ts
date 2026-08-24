/**
 * Orchestration — the understanding stage.
 *
 * Composes classification, entity extraction, scope, time and planning
 * into one `QueryUnderstanding`. This is the first stage of the pipeline
 * and the only one that reads the raw question; everything after it reads
 * the understanding.
 *
 * Synchronous and pure by design. Nothing here performs I/O, so the
 * workspace can reconfigure the instant the officer submits — before any
 * retrieval has started — rather than after the slowest connector returns.
 */
import { classifyOfficerIntent } from "./intent";
import { primaryEntityFor, resolveEntities } from "./entity";
import { planRetrieval, type PlanOptions } from "./planner";
import {
  preferredEntityKind,
  resolveContextPolicy,
  resolveScope,
  resolveWorkspaceMode,
} from "./scope";
import { resolveTimeWindow } from "./time";
import type { OfficerIntent, QueryUnderstanding, ResolvedEntity } from "./types";

export interface UnderstandOptions extends PlanOptions {
  /** Injected so understanding is deterministic in tests. */
  readonly now?: number;
  /**
   * The subject of whatever is currently open in the workspace.
   *
   * Applied ONLY when `contextPolicy` resolves to `inherit` — that is,
   * when the question named no subject and is not globally scoped. This
   * is the single point at which ambient context can enter a query, and
   * it is deliberately narrow.
   */
  readonly ambientEntity?: ResolvedEntity | null;
  /**
   * The lens the officer has the surface set to, as a soft prior.
   *
   * Typed as `OfficerIntent` rather than a new domain enum: that vocabulary
   * already names every domain a lens could express — `port-intelligence`,
   * `cargo-intelligence`, `risk-assessment` — and a parallel enum would be
   * a second way to say the same thing, needing a mapping table that could
   * drift.
   *
   * Applied ONLY when the text itself classified as `unknown`. Any rule
   * match scores at least 0.3, so a query that named its own subject
   * always wins: "show me ports in Ghana" under a vessel lens is a port
   * question, because the officer said so. The lens breaks ties for bare
   * input like "Lagos", and nothing else.
   */
  readonly domainHint?: OfficerIntent | null;
}

/**
 * Confidence assigned to an intent that came from the lens rather than
 * the words. Below the classifier's 0.3 floor on purpose.
 */
const HINT_CONFIDENCE = 0.2;

export function understand(query: string, options: UnderstandOptions = {}): QueryUnderstanding {
  const now = options.now ?? Date.now();
  const text = query.trim();

  const classification = classifyOfficerIntent(text);

  // The lens speaks only where the text said nothing. `classifyOfficerIntent`
  // returns `unknown` at confidence 0 when no rule fired, and at least 0.3
  // when one did, so this branch cannot overrule an explicit request.
  const hinted = classification.intent === "unknown" && options.domainHint;
  const intent = hinted ? options.domainHint! : classification.intent;
  // Deliberately below the 0.3 floor a real rule match earns: this reading
  // came from a UI control, not from anything the officer wrote, and
  // downstream should be able to tell those apart.
  const intentConfidence = hinted ? HINT_CONFIDENCE : classification.confidence;

  const extracted = resolveEntities(text);
  const scope = resolveScope(
    intent,
    extracted,
    primaryEntityFor(extracted, preferredEntityKind(intent)),
  );
  const contextPolicy = resolveContextPolicy(scope, extracted);

  // The only place ambient context enters. A question that named its own
  // subject, or asked about everything, never reaches this branch.
  const entities =
    contextPolicy === "inherit" && options.ambientEntity ? [options.ambientEntity] : extracted;

  const primaryEntity = primaryEntityFor(entities, preferredEntityKind(intent));

  return {
    query: text,
    intent,
    intentConfidence,
    alternativeIntents: classification.alternatives,
    scope,
    entities,
    primaryEntity,
    timeWindow: resolveTimeWindow(text, intent, now),
    workspaceMode: resolveWorkspaceMode(intent, scope, primaryEntity),
    contextPolicy,
    plan: planRetrieval(intent, options),
    producedAt: new Date(now).toISOString(),
  };
}
