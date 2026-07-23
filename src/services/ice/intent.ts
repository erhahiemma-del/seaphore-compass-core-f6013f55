/**
 * Deterministic intent classifier for the ICE Source Planner. Pattern-
 * matched (not LLM-driven) so plans are reproducible.
 */

import type { Intent } from "./types";

const PATTERNS: ReadonlyArray<{ intent: Intent; rx: RegExp }> = [
  { intent: "INVESTIGATION",    rx: /\b(investigate|dig into|deep dive|full picture|due diligence)\b/i },
  { intent: "SANCTIONS_SCREEN", rx: /\b(sanction|blacklist|ofac|un list|watchlist|screen)\b/i },
  { intent: "OWNERSHIP_TRACE",  rx: /\b(owner|beneficial|ubo|shell company|corporate structure)\b/i },
  { intent: "COMPLIANCE_CHECK", rx: /\b(compliance|psc|detention|deficienc|class|nimasa|regulator)\b/i },
  { intent: "VOYAGE_ANALYSIS",  rx: /\b(voyage|eta|route|track|position|port call|arrival|departure)\b/i },
  { intent: "FACT_LOOKUP",      rx: /\b(what is|who is|imo\s?\d+|show|find|lookup)\b/i },
];

export function classifyIntent(text: string): Intent {
  for (const { intent, rx } of PATTERNS) if (rx.test(text)) return intent;
  return "OTHER";
}
