/**
 * OIE · Decision Support Generator.
 *
 * Turns raw composite confidence into an operational badge and a
 * plain-language explanation. Deterministic; the bands mirror the
 * OC-001 Confidence Ladder used across Seaphore.
 */
import type { ConfidenceMatrix } from "@/services/orchestration";
import type { ConfidenceBadge } from "./types";

export function badgeFromComposite(c: number, insufficient = false): ConfidenceBadge {
  if (insufficient) return "Insufficient Evidence";
  if (c >= 0.75) return "High Confidence";
  if (c >= 0.5) return "Medium Confidence";
  if (c > 0) return "Low Confidence";
  return "Insufficient Evidence";
}

export function explainMatrix(m: ConfidenceMatrix): string {
  const parts: string[] = [`overall ${(m.composite * 100).toFixed(0)}%`];
  if (m.corroboration >= 0.7) parts.push("multiple sources corroborate the key findings");
  else if (m.corroboration <= 0.3) parts.push("corroboration is limited");
  if (m.freshness >= 0.7) parts.push("evidence is recent");
  else if (m.freshness <= 0.3) parts.push("some evidence is dated");
  if (m.consistency <= 0.3) parts.push("conflicting reports remain unresolved");
  if (m.coverage <= 0.3) parts.push("intelligence coverage is thin");
  return parts.join("; ") + ".";
}
