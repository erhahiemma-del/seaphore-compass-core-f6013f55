/**
 * Intent hints — Sprint UX-04. PRESENTATION ONLY.
 *
 * Infers a *display* label for what the officer appears to be asking, so the
 * console can echo it back above the input. This never filters, routes or
 * constrains anything: query execution stays exactly as it was (the raw text
 * is handed to the canonical pipeline untouched). The hint is a courtesy, and
 * the officer can dismiss it.
 */

export type IntentHintKey =
  "IMO" | "VESSEL" | "COMPANY" | "MANIFEST" | "CONTAINER" | "BOL" | "VOYAGE" | "PORT" | "SANCTIONS";

export interface IntentHint {
  key: IntentHintKey;
  /** Officer-facing label, e.g. "Vessel Investigation". */
  label: string;
}

const HINTS: Record<IntentHintKey, string> = {
  IMO: "IMO Lookup",
  VESSEL: "Vessel Investigation",
  COMPANY: "Company Investigation",
  MANIFEST: "Manifest Analysis",
  CONTAINER: "Container Trace",
  BOL: "Bill of Lading Check",
  VOYAGE: "Voyage History",
  PORT: "Port Activity",
  SANCTIONS: "Sanctions Screening",
};

/** ISO 6346 container number, e.g. MSCU1234567. */
const CONTAINER = /\b[A-Z]{3}[UJZ]\s?\d{7}\b/;
/** 7-digit IMO number, with or without the "IMO" prefix. */
const IMO = /\b(?:imo\s*(?:no\.?|number)?\s*:?\s*)?\d{7}\b/i;

const COMPANY_MARKERS =
  /\b(ltd|limited|plc|llc|inc|gmbh|b\.?v\.?|s\.?a\.?|pte|marine|maritime|shipping|lines?|holdings?|group|company|owner|operator|owned by|owns)\b/i;

const VESSEL_MARKERS = /\b(mv|m\/v|mt|m\/t|ss|vessel|ship|tanker|bulker|imo)\b/i;

/**
 * Best-effort intent hint for a free-text query. Returns null when the text is
 * too short or too ambiguous to label honestly — an absent badge is better
 * than a confident guess (Honesty Rule: never fabricate certainty).
 */
export function detectIntentHint(raw: string): IntentHint | null {
  const text = raw.trim();
  if (text.length < 3) return null;

  const hit = (key: IntentHintKey): IntentHint => ({ key, label: HINTS[key] });

  if (CONTAINER.test(text.toUpperCase())) return hit("CONTAINER");
  if (/\b(bol|b\/l|bill of lading)\b/i.test(text)) return hit("BOL");
  if (/\bmanifest/i.test(text)) return hit("MANIFEST");
  if (/\b(sanction|ofac|sdn|designat|screen)/i.test(text)) return hit("SANCTIONS");
  if (/\b(voyage|itinerary|previous (?:voyages|calls)|port calls?)\b/i.test(text))
    return hit("VOYAGE");
  if (/\b(port of|apapa|tin can|onne|calabar|warri|lagos|terminal|berth|anchorage)\b/i.test(text))
    return hit("PORT");
  if (IMO.test(text)) return hit("IMO");
  if (COMPANY_MARKERS.test(text) && !VESSEL_MARKERS.test(text)) return hit("COMPANY");
  if (VESSEL_MARKERS.test(text)) return hit("VESSEL");
  if (/\b(ownership|beneficial owner|shareholder)/i.test(text)) return hit("COMPANY");
  // A bare proper-noun phrase most often names a vessel in this console.
  if (/^[A-Z][\w'-]*(\s+[A-Z][\w'-]*)+$/.test(text)) return hit("VESSEL");

  return null;
}
