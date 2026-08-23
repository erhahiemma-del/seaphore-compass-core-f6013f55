/**
 * Orchestration — intent classification.
 *
 * Deterministic and pattern-matched, for the same reason
 * `ice/intent.ts` is: a plan an officer cannot reproduce is a plan they
 * cannot audit. An LLM classifier would make the same question route
 * differently on two runs.
 *
 * This is a superset of ICE's seven-value `Intent`, not a replacement.
 * ICE classifies to pick *connectors*; this classifies to pick a
 * *workspace*. `toIceIntent` maps across so the ICE source planner is
 * reused rather than reimplemented.
 */
import type { Intent as IceIntent } from "@/services/ice/types";

import type { OfficerIntent } from "./types";

/**
 * Ordered rules. First match wins, so the list runs from most specific to
 * most general — "revenue leakage across the fleet" is a revenue question
 * that happens to mention the fleet, not a fleet question.
 *
 * `weight` is the classifier's confidence when the rule fires. Rules
 * keyed to an unambiguous noun score high; rules keyed to a verb that
 * appears in many kinds of question score lower.
 */
interface IntentRule {
  readonly intent: OfficerIntent;
  readonly rx: RegExp;
  readonly weight: number;
}

const RULES: readonly IntentRule[] = [
  // ── Unambiguous document and object nouns ───────────────────────
  // The manifest rule precedes the container-number one: in "pull the
  // manifest for MSCU1234567" the container is the lookup key, not the
  // subject. The noun the officer asked for wins over the identifier they
  // supplied to find it.
  {
    intent: "manifest-intelligence",
    rx: /\b(manifest|bill of lading|b\/l|bol|declaration)s?\b/i,
    weight: 0.9,
  },
  { intent: "container-intelligence", rx: /\b[A-Z]{3}[UJZ]\s?\d{7}\b/, weight: 0.95 },
  { intent: "container-intelligence", rx: /\bcontainers?\b/i, weight: 0.85 },

  // Replay and forecast name operations, not domains — "replay the
  // voyage" is a replay of a voyage, and "forecast revenue leakage" is a
  // forecast of revenue. The operation is what the officer asked for; the
  // domain rides along in `alternatives` and still reaches the capability
  // list.
  {
    intent: "historical-replay",
    rx: /\b(replay|rewind|play ?back|reconstruct)\b/i,
    weight: 0.92,
  },
  {
    intent: "trend-analysis",
    rx: /\b(forecast|predict|project(?:ion|ed)?|outlook)\b/i,
    weight: 0.92,
  },

  // ── Named analytical domains ────────────────────────────────────
  {
    intent: "revenue-intelligence",
    rx: /\b(revenue|levy|levies|leakage|underdeclar\w*|shortfall|tariff|duty|duties|billing)\b/i,
    weight: 0.9,
  },
  {
    intent: "compliance-intelligence",
    rx: /\b(complian\w*|psc|port state control|detention|deficienc\w*|inspection|certificate|sanction\w*|ofac|watchlist|blacklist)\b/i,
    weight: 0.88,
  },
  {
    intent: "ownership-intelligence",
    rx: /\b(ownership|beneficial owner\w*|ubo|shareholder|shell compan\w*|corporate structure|who owns)\b/i,
    weight: 0.9,
  },
  {
    intent: "cargo-intelligence",
    rx: /\b(cargo|commodit\w*|tonnage|consignment|shipment)s?\b/i,
    weight: 0.85,
  },
  {
    intent: "port-intelligence",
    rx: /\b(port|berth|anchorage|terminal|congestion|arrivals?|departures?|apapa|tin can|onne|calabar|warri)\b/i,
    weight: 0.8,
  },
  {
    intent: "voyage-intelligence",
    rx: /\b(voyage|route|passage|itinerary|eta|port calls?|track)\b/i,
    weight: 0.82,
  },

  // ── Analytical modes ────────────────────────────────────────────
  { intent: "historical-replay", rx: /\bwhat happened on\b/i, weight: 0.9 },
  { intent: "comparison", rx: /\b(compare|versus|vs\.?|against|differ\w*)\b/i, weight: 0.85 },
  {
    intent: "trend-analysis",
    rx: /\b(trend|over time|month[- ]on[- ]month|year[- ]on[- ]year|growth|declin\w*|trajector\w*)\b/i,
    weight: 0.85,
  },
  {
    intent: "pattern-detection",
    rx: /\b(pattern|recurring|repeated\w*|anomal\w*|unusual|outlier)s?\b/i,
    weight: 0.85,
  },
  {
    intent: "mission-planning",
    rx: /\b(mission|deploy\w*|taskings?|patrol|intercept|plan (?:a|the) )\b/i,
    weight: 0.85,
  },
  { intent: "officer-notes", rx: /\b(note|annotate|log (?:this|that)|remember)\b/i, weight: 0.8 },

  // ── Output-shape requests ───────────────────────────────────────
  {
    intent: "executive-brief",
    rx: /\b(executive brief|brief me|briefing|daily brief|sitrep|situation report)\b/i,
    weight: 0.92,
  },
  {
    intent: "strategic-summary",
    rx: /\b(strategic|overall picture|big picture|summar(?:y|ise|ize)|state of)\b/i,
    weight: 0.8,
  },
  {
    intent: "operational-recommendation",
    rx: /\b(what should (?:i|we)|recommend\w*|next step|advise|course of action|priorit(?:y|ies|ise|ize))\b/i,
    weight: 0.85,
  },
  {
    intent: "risk-assessment",
    rx: /\b(risk|threat|exposure|suspicious|concern\w*|red flags?)\b/i,
    weight: 0.78,
  },

  // ── Entity-directed ─────────────────────────────────────────────
  {
    intent: "company-intelligence",
    rx: /\b(?:owned|operated) by\b|\b(compan(?:y|ies)|group|holdings?|ltd|limited|plc|llc|gmbh|maersk|msc)\b/i,
    weight: 0.8,
  },
  {
    intent: "vessel-investigation",
    rx: /\b(investigate|dig into|deep dive|due diligence|full picture on|look into)\b/i,
    weight: 0.9,
  },
  {
    intent: "fleet-intelligence",
    rx: /\b(fleet|all vessels|vessels? (?:are )?(?:live|active|at sea|underway)|how many vessels|live (?:traffic|fleet))\b/i,
    weight: 0.88,
  },
  {
    intent: "vessel-investigation",
    rx: /\b(?:imo\s*:?\s*)?\b\d{7}\b|\b(mv|m\/v|mt|m\/t)\s+\w+/i,
    weight: 0.85,
  },

  // ── Fallback ────────────────────────────────────────────────────
  {
    intent: "natural-language-search",
    rx: /\b(find|search|show|list|where is|which|who|what)\b/i,
    weight: 0.5,
  },
];

export interface IntentClassification {
  readonly intent: OfficerIntent;
  /** Confidence in the classification. Never confidence in an answer. */
  readonly confidence: number;
  /** Other rules that fired, most confident first. */
  readonly alternatives: readonly OfficerIntent[];
}

/**
 * Classify a question.
 *
 * Every rule is evaluated rather than stopping at the first, so a question
 * that fires several can report the runners-up. An officer whose question
 * was ambiguous should be able to see that it was, not just receive one
 * confident answer to a question they may not have asked.
 */
export function classifyOfficerIntent(raw: string): IntentClassification {
  const text = raw.trim();
  if (text.length < 2) {
    return { intent: "unknown", confidence: 0, alternatives: [] };
  }

  const hits: { intent: OfficerIntent; weight: number }[] = [];
  for (const rule of RULES) {
    if (!rule.rx.test(text)) continue;
    if (hits.some((h) => h.intent === rule.intent)) continue;
    hits.push({ intent: rule.intent, weight: rule.weight });
  }

  if (hits.length === 0) {
    return { intent: "unknown", confidence: 0, alternatives: [] };
  }

  const [best, ...rest] = hits;

  // Several competing readings mean the question was ambiguous, and the
  // classifier should say so rather than round its own uncertainty away.
  const contested = rest.filter((h) => best.weight - h.weight < 0.1).length;
  const confidence = Math.max(0.3, Number((best.weight - contested * 0.08).toFixed(3)));

  return {
    intent: best.intent,
    confidence,
    alternatives: rest.slice(0, 3).map((h) => h.intent),
  };
}

/**
 * Map to ICE's connector-planning vocabulary.
 *
 * Many G6.0 intents collapse to one ICE intent, which is correct: ICE only
 * needs to know which connectors to call, and cargo, manifest and container
 * questions all want the same ones.
 */
const ICE_MAP: Readonly<Record<OfficerIntent, IceIntent>> = {
  "fleet-intelligence": "FACT_LOOKUP",
  "vessel-investigation": "INVESTIGATION",
  "manifest-intelligence": "FACT_LOOKUP",
  "cargo-intelligence": "FACT_LOOKUP",
  "container-intelligence": "FACT_LOOKUP",
  "ownership-intelligence": "OWNERSHIP_TRACE",
  "company-intelligence": "OWNERSHIP_TRACE",
  "compliance-intelligence": "COMPLIANCE_CHECK",
  "revenue-intelligence": "COMPLIANCE_CHECK",
  "port-intelligence": "VOYAGE_ANALYSIS",
  "voyage-intelligence": "VOYAGE_ANALYSIS",
  "risk-assessment": "INVESTIGATION",
  "operational-recommendation": "INVESTIGATION",
  "strategic-summary": "FACT_LOOKUP",
  "executive-brief": "FACT_LOOKUP",
  "pattern-detection": "INVESTIGATION",
  "trend-analysis": "FACT_LOOKUP",
  "historical-replay": "VOYAGE_ANALYSIS",
  comparison: "FACT_LOOKUP",
  "natural-language-search": "FACT_LOOKUP",
  "officer-notes": "OTHER",
  "mission-planning": "INVESTIGATION",
  unknown: "OTHER",
};

export function toIceIntent(intent: OfficerIntent): IceIntent {
  return ICE_MAP[intent];
}
