/**
 * Intelligence Behaviour Engine (IBE) — type contracts.
 *
 * The IBE is the *behavioural* layer above OIE. OIE knows how to
 * retrieve, correlate and reason across evidence. IBE knows how a
 * senior maritime intelligence officer would *conduct themselves*
 * around that evidence:
 *
 *   • acknowledge previous work and remember decisions,
 *   • think before responding,
 *   • proactively surface what the officer would miss,
 *   • maintain hypotheses across turns,
 *   • adapt tone to the officer's persona,
 *   • coach the officer through the investigation,
 *   • never end a turn transactionally.
 *
 * IBE never bypasses OIE. It shapes the *behaviour* around the
 * operational briefing OIE already produces.
 */
import type { HumanResponse, OIEResult } from "@/services/oie/types";
import type { ResponseContract } from "./response-contract";
import type { MissionContext } from "@/stores/mission-context.store";

/** How the Copilot speaks to the current officer. */
export type OfficerPersona =
  "executive" | "operational" | "analyst" | "investigator" | "trainer" | "briefing";

/** Where the investigation currently sits in its lifecycle. */
export type InvestigationStage =
  | "planning"
  | "collecting"
  | "correlating"
  | "validating"
  | "reviewing"
  | "decision_support"
  | "completed";

/** A running hypothesis maintained across turns. */
export interface IbeHypothesis {
  id: string;
  statement: string;
  domain:
    "sanctions" | "ownership" | "revenue" | "ais" | "compliance" | "cargo" | "identity" | "other";
  supporting: string[];
  contradicting: string[];
  /** Free-form confidence in officer language (never a percentage). */
  confidence: "leading" | "credible" | "possible" | "weak";
  /** What evidence would raise or refute the hypothesis. */
  nextEvidenceNeeded: string[];
  createdAt: number;
  updatedAt: number;
}

/** A proactive nudge — something the officer would miss. */
export interface ProactiveNudge {
  id: string;
  priority: "critical" | "high" | "monitor";
  /** One sentence, natural language, no jargon. */
  text: string;
  /** Which mission slice motivated the nudge. */
  origin: "ownership" | "sanctions" | "ais" | "revenue" | "weather" | "compliance" | "conversation";
}

/** IBE's internal reasoning pre-pass, exposed for observability. */
export interface IbeThought {
  objective: string;
  known: string[];
  missing: string[];
  shouldCollectMore: boolean;
  canAnswerConfidently: boolean;
  mustExplainUncertainty: boolean;
  nextRecommendation: string;
}

export interface IbeContext {
  persona: OfficerPersona;
  stage: InvestigationStage;
  mission: MissionContext | null;
  /** Rolling summary of what the Copilot has already told the officer. */
  priorTurnCount: number;
  hasPriorFindings: boolean;
}

/** OIEResult enriched by the IBE. */
export type IbeResult = OIEResult & {
  ibe?: {
    thought: IbeThought;
    persona: OfficerPersona;
    stage: InvestigationStage;
    hypotheses: IbeHypothesis[];
    nudges: ProactiveNudge[];
    acknowledgement: string | null;
    closer: string;
    /** The (possibly rewritten) HumanResponse for the officer. */
    humanResponse?: HumanResponse;
    /** Nine-step Response Contract audit for this turn. */
    contract?: ResponseContract;
  };
};
