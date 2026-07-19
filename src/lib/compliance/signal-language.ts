/**
 * HR-3 — System-generated text uses observed language. The system observes;
 * the officer concludes. This guard rejects conclusive verbs and offers a
 * neutral replacement so authors cannot ship "revenue fraud detected".
 */

const FORBIDDEN: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bfraud detected\b/i, replacement: "discrepancy observed" },
  { pattern: /\bfraud confirmed\b/i, replacement: "discrepancy observed" },
  { pattern: /\bcrime detected\b/i, replacement: "anomaly observed" },
  { pattern: /\bsmuggling detected\b/i, replacement: "manifest–cargo mismatch observed" },
  { pattern: /\bcriminal\b/i, replacement: "subject" },
  { pattern: /\bguilty\b/i, replacement: "flagged" },
  { pattern: /\billegal\b/i, replacement: "non-compliant (observed)" },
  { pattern: /\bproven\b/i, replacement: "observed" },
  { pattern: /\bconfirmed fraud\b/i, replacement: "revenue discrepancy observed" },
  { pattern: /\bconvicted\b/i, replacement: "subject" },
  { pattern: /\bconfirmed sanctions violation\b/i, replacement: "sanctions match observed" },
];

export interface LanguageViolation {
  match: string;
  suggestion: string;
}

export function scanSignalLanguage(text: string): LanguageViolation[] {
  const hits: LanguageViolation[] = [];
  for (const { pattern, replacement } of FORBIDDEN) {
    const m = text.match(pattern);
    if (m) hits.push({ match: m[0], suggestion: replacement });
  }
  return hits;
}

/**
 * Throws when a system-generated signal uses conclusive language.
 * Used by <SignalStatement> and Copilot output primitives.
 */
export function assertObservedLanguage(text: string, context: string): void {
  const hits = scanSignalLanguage(text);
  if (hits.length === 0) return;
  const details = hits.map((h) => `"${h.match}" → "${h.suggestion}"`).join("; ");
  throw new Error(
    `[HR-3] ${context}: system-generated text must use observed language. ${details}`,
  );
}
