/**
 * SEAPHORE Confidence Ladder — data-layer enum.
 *
 * Every record in the database stores its own `confidence` column of type
 * `public.confidence_level`. The UI never re-infers confidence — it reads the
 * value from the record and renders the corresponding chip via
 * `toChipTier(record.confidence)`.
 *
 * Data ladder (canonical, per Data Model & Entity Reference):
 *   OBSERVED, DECLARED, INFERRED, CORROBORATED, VERIFIED, AUDITED
 *
 * UI chip ladder (per Design System OC-001):
 *   verified, observed, inferred, unconfirmed
 *
 * The mapping below is fixed. Do not localise or "adjust" it in a component.
 */

import type { Database } from "@/integrations/supabase/types";
import type { ConfidenceTier } from "@/components/confidence-chip";

export type ConfidenceLevel = Database["public"]["Enums"]["confidence_level"];

export const CONFIDENCE_LEVELS = [
  "OBSERVED",
  "DECLARED",
  "INFERRED",
  "CORROBORATED",
  "VERIFIED",
  "AUDITED",
] as const satisfies readonly ConfidenceLevel[];

export const CONFIDENCE_LEVEL_DESCRIPTIONS: Record<ConfidenceLevel, string> = {
  OBSERVED:     "Directly observed in source data",
  DECLARED:     "Stated by the declaring party (unverified)",
  INFERRED:     "Computed or derived from multiple sources",
  CORROBORATED: "Supported by two or more independent sources",
  VERIFIED:     "Confirmed by an authoritative external source",
  AUDITED:      "Human-confirmed and immutably recorded",
};

/**
 * Fixed mapping from data-layer confidence level to UI chip tier.
 * VERIFIED and AUDITED collapse to the "verified" chip; DECLARED and INFERRED
 * are surfaced as "inferred"; CORROBORATED as "observed"; OBSERVED stays
 * "observed". The only "unconfirmed" chip is reserved for records with no
 * confidence value — that indicates a data defect, not a legitimate state.
 */
export function toChipTier(level: ConfidenceLevel | null | undefined): ConfidenceTier {
  switch (level) {
    case "VERIFIED":
    case "AUDITED":
      return "verified";
    case "OBSERVED":
    case "CORROBORATED":
      return "observed";
    case "DECLARED":
    case "INFERRED":
      return "inferred";
    default:
      return "unconfirmed";
  }
}
