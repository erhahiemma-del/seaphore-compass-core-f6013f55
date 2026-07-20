/**
 * OSINT confidence scoring rules.
 *
 * Baseline confidence is derived from the connector's provenance grade.
 * Individual connectors can override per-record if they have stronger
 * signals (e.g. a corroborated match).
 */
import type { OsintConfidenceLevel, OsintProvenance } from "./types";

export function baseConfidence(provenance: OsintProvenance): number {
  switch (provenance) {
    case "government":
      return 0.9;
    case "commercial_verified":
      return 0.75;
    case "aggregated":
      return 0.6;
    case "scraped":
      return 0.4;
  }
}

export function confidenceLevelFor(score: number): OsintConfidenceLevel {
  if (score >= 0.95) return "AUDITED";
  if (score >= 0.85) return "VERIFIED";
  if (score >= 0.7) return "CORROBORATED";
  if (score >= 0.55) return "INFERRED";
  if (score >= 0.35) return "DECLARED";
  return "OBSERVED";
}
