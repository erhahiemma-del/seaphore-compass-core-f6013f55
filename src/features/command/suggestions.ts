/**
 * What the lens suggests searching for.
 *
 * Officer guidance, not data. Each cue fills the search box; none of them
 * asserts that a result exists, that an investigation is open, or that a
 * provider is reporting. "High-risk vessels" is a search an officer might
 * want to run, and running it returns whatever the registry actually
 * holds — including nothing, said plainly.
 *
 * That distinction is the whole reason these live here rather than being
 * derived from data: a suggestion drawn from live counts would become a
 * claim about the fleet, and this surface must not make one.
 *
 * ## Not the same as the entity-type vocabulary
 *
 * `lib/intelligence-modes` carries per-entity-type search vocabulary —
 * placeholder, prefix, suggested queries for *the kind of thing* being
 * searched. This is per *lens*: what the officer is likely to be looking
 * for from a given operational perspective. The two are orthogonal, in
 * the same way Mission Mode and Focus Subject are, and neither replaces
 * the other.
 */
import type { MissionMode } from "@/features/mission-control/modes";

export interface ModeSearchCues {
  /** One-tap searches. Each fills the input; none runs a workflow. */
  readonly cues: readonly string[];
  /**
   * What this lens emphasises in ranking, in the officer's words.
   *
   * Written to describe the affinity the ranking actually applies, so
   * the line is a true statement about behaviour rather than decoration.
   */
  readonly emphasis: string;
}

const CUES: Readonly<Record<string, ModeSearchCues>> = {
  "national-picture": {
    cues: ["Apapa arrivals", "High-risk vessels", "Revenue watch", "Open investigations"],
    emphasis: "national activity · ports · vessels",
  },
  "vessel-operations": {
    cues: ["Find vessel", "Last position", "Voyage history"],
    emphasis: "vessels · voyages",
  },
  "revenue-assurance": {
    cues: ["Manifest discrepancies", "Revenue exceptions", "Cargo declarations"],
    emphasis: "manifests · cargo · containers · companies",
  },
  "risk-compliance": {
    cues: ["Sanctions exposure", "Watchlist matches", "Ownership chains"],
    emphasis: "companies · vessels",
  },
  investigation: {
    cues: ["Open cases", "Linked entities", "Evidence records"],
    emphasis: "vessels · companies · documents",
  },
  "port-intelligence": {
    cues: ["Port congestion", "Expected arrivals", "Anchorage activity"],
    emphasis: "ports · voyages",
  },
  "decision-coordination": {
    cues: ["Pending decisions", "Approval queue", "Sharing queue"],
    emphasis: "documents · manifests",
  },
  "strategic-intelligence": {
    cues: ["Trade patterns", "Operator exposure", "Historical trends"],
    emphasis: "companies · ports",
  },
};

/**
 * Cues for a lens.
 *
 * An unknown mode returns no cues rather than a default set, because a
 * generic suggestion under a specific lens is worse than none — it reads
 * as advice and carries no perspective.
 */
export function searchCuesFor(mode: MissionMode): ModeSearchCues {
  return CUES[mode.id] ?? { cues: [], emphasis: "" };
}
