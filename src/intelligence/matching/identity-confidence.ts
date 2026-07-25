/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE — IDENTITY CONFIDENCE SCORER
 * ─────────────────────────────────────────────────────────────────────
 *
 * Given an officer query (name / MMSI / IMO / call sign) and one or
 * more candidate vessel records, compute an Identity Confidence Score
 * 0–100 with a full breakdown of the contributing signals. Pure
 * function — no network, no globals. Safe to import in both browser
 * and server bundles.
 *
 * Signal weights (sum = 100):
 *
 *   IMO match                          30
 *   MMSI / SSVID match                 25
 *   Call sign match                    10
 *   Primary name similarity            20
 *   Alias / historical name match      10
 *   Flag match (when query implies)     5
 *
 * A candidate's raw score is:
 *
 *   score = Σ signal.contribution
 *
 * The provider's own match verdict (`matchFields`) is used as a
 * *modifier* rather than a signal:
 *
 *   NO_MATCH        →   × 0.35   (upstream said this is not the vessel)
 *   SHIPNAME        →   × 1.00
 *   SEVERAL_FIELDS  →   × 1.05, capped at 100
 *
 * Bands (default thresholds, tunable):
 *
 *   VERIFIED     ≥ 90    auto-select
 *   OBSERVED     ≥ 70    auto-select
 *   INFERRED     ≥ 50    officer confirmation required
 *   UNCONFIRMED  < 50    officer confirmation required
 *
 * Ambiguity: if the top two candidates fall within `tieBandPoints`
 * (default 8), the pipeline MUST prompt the officer to choose — never
 * auto-select on a photo-finish.
 * ─────────────────────────────────────────────────────────────────────
 */

export type IdentityConfidenceTier =
  | "VERIFIED"
  | "OBSERVED"
  | "INFERRED"
  | "UNCONFIRMED";

export type IdentitySignalKind =
  | "imo"
  | "mmsi"
  | "callSign"
  | "name"
  | "alias"
  | "historical"
  | "matchFields"
  | "vesselType"
  | "flag"
  | "provider-match-fields";

export interface IdentitySignal {
  kind: IdentitySignalKind;
  label: string;
  /** Points contributed to the raw score (0 = did not fire). */
  contribution: number;
  /** Max points this signal could contribute. */
  weight: number;
  /** Human-readable explanation shown in the officer confirm UI. */
  detail: string;
}

export interface IdentityCandidate {
  /** Stable id used to disambiguate; e.g. GFW vesselId. */
  id: string;
  name: string | null;
  imo?: string | null;
  mmsi?: string | null;
  callSign?: string | null;
  flag?: string | null;
  /** Vessel type (fishing, cargo, tanker, etc). */
  vesselType?: string | null;
  aliases?: string[];
  historicalNames?: string[];
  /** Upstream provider's own match verdict (GFW `matchFields`). */
  providerMatchFields?: string | null;
}

export interface IdentityConfidenceInput {
  /** Raw officer query. */
  query: string;
  /** Optional structured hints the officer supplied. */
  hints?: {
    imo?: string;
    mmsi?: string;
    callSign?: string;
    flag?: string;
    vesselType?: string;
  };
}

export interface IdentityConfidenceResult {
  candidateId: string;
  /** Raw sum 0-100 before provider modifier. */
  rawScore: number;
  /** Final score after provider modifier, clamped 0-100. */
  score: number;
  tier: IdentityConfidenceTier;
  signals: IdentitySignal[];
  /** Short single-sentence rationale for the assessment card. */
  rationale: string;
}

export interface IdentityAlternate<C extends IdentityCandidate> {
  candidate: C;
  confidence: IdentityConfidenceResult;
  /** True when the candidate was excluded from auto-selection (e.g. NO_MATCH). */
  rejected: boolean;
  /** Human-readable reason when `rejected` is true. */
  rejectionReason?: string;
}

export interface IdentitySelection<C extends IdentityCandidate> {
  /** Top-ranked candidate, or null when no candidates were provided. */
  selected: C | null;
  /** Score for the selected candidate. */
  confidence: IdentityConfidenceResult | null;
  /** Ranked list of alternates with their scores (top-first). */
  alternates: Array<IdentityAlternate<C>>;
  /** Candidates the resolver actively rejected (e.g. NO_MATCH). */
  rejected: Array<IdentityAlternate<C>>;
  /**
   * True when the pipeline MUST NOT auto-select — either the top
   * score is below `autoSelectThreshold` or the runner-up is within
   * `tieBandPoints`.
   */
  requiresConfirmation: boolean;
  /** Machine-readable reason for `requiresConfirmation`. */
  ambiguityReason:
    | "none"
    | "below-threshold"
    | "tied-candidates"
    | "no-candidates";
  /** Officer-facing sentence explaining WHY this candidate was selected. */
  selectionReason: string;
}

export interface IdentityScoringOptions {
  /** Default 70 — score at/above this auto-selects. */
  autoSelectThreshold?: number;
  /** Default 8 — max delta between #1 and #2 that still counts as a tie. */
  tieBandPoints?: number;
}

// ─────────────────────────────────────────────────────────────────────
// Weights (kept exported for tests + officer explainers)
// ─────────────────────────────────────────────────────────────────────

export const IDENTITY_WEIGHTS: Record<IdentitySignalKind, number> = {
  imo: 30,
  mmsi: 25,
  callSign: 10,
  name: 20,
  alias: 10,
  historical: 10,
  matchFields: 15, // Sprint 1C.1 — primary signal, not a modifier
  vesselType: 5,
  flag: 5,
  "provider-match-fields": 0, // legacy modifier bookkeeping only
};

// ─────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────

function normaliseIdentifier(v: string | null | undefined): string {
  return (v ?? "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

function normaliseName(v: string | null | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .replace(/\b(mv|m\/v|ms|m\/s|ss|s\/s|fv|f\/v|rv|r\/v|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function jaroWinkler(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m: boolean[] = new Array(a.length).fill(false);
  const n: boolean[] = new Array(b.length).fill(false);
  const range = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (n[j]) continue;
      if (a[i] !== b[j]) continue;
      m[i] = true;
      n[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!m[i]) continue;
    while (!n[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) /
    3;
  // Winkler prefix boost
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Public helper: 0-1 similarity between two vessel names. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const an = normaliseName(a);
  const bn = normaliseName(b);
  if (!an || !bn) return 0;
  return jaroWinkler(an, bn);
}

// ─────────────────────────────────────────────────────────────────────
// Signal firing
// ─────────────────────────────────────────────────────────────────────

interface ParsedQuery {
  raw: string;
  name: string;
  looksLikeImo: string | null;
  looksLikeMmsi: string | null;
  looksLikeCallSign: string | null;
}

function parseQuery(query: string, hints?: IdentityConfidenceInput["hints"]): ParsedQuery {
  const raw = query.trim();
  const digits = normaliseIdentifier(raw);
  // IMO is exactly 7 digits; MMSI is exactly 9 digits.
  const looksLikeImo = hints?.imo ?? (digits.length === 7 ? digits : null);
  const looksLikeMmsi = hints?.mmsi ?? (digits.length === 9 ? digits : null);
  // Call signs: 3–7 alphanumerics, mixed letters and digits.
  const cs = normaliseIdentifier(raw);
  const looksLikeCallSign =
    hints?.callSign ??
    (cs.length >= 3 && cs.length <= 7 && /[A-Z]/.test(cs) && /[0-9]/.test(cs) && !looksLikeImo && !looksLikeMmsi
      ? cs
      : null);
  return { raw, name: raw, looksLikeImo, looksLikeMmsi, looksLikeCallSign };
}

function fireSignal(
  kind: IdentitySignalKind,
  label: string,
  contribution: number,
  detail: string,
): IdentitySignal {
  return { kind, label, contribution, weight: IDENTITY_WEIGHTS[kind], detail };
}

/**
 * Score a single candidate against the query. Pure.
 */
export function scoreIdentityCandidate(
  candidate: IdentityCandidate,
  input: IdentityConfidenceInput,
): IdentityConfidenceResult {
  const q = parseQuery(input.query, input.hints);
  const signals: IdentitySignal[] = [];

  // IMO
  const candImo = normaliseIdentifier(candidate.imo);
  if (q.looksLikeImo && candImo) {
    const hit = candImo === normaliseIdentifier(q.looksLikeImo);
    signals.push(
      fireSignal(
        "imo",
        "IMO",
        hit ? IDENTITY_WEIGHTS.imo : 0,
        hit
          ? `Query IMO ${q.looksLikeImo} matches candidate IMO ${candidate.imo}.`
          : `Query IMO ${q.looksLikeImo} does not match candidate IMO ${candidate.imo}.`,
      ),
    );
  }

  // MMSI
  const candMmsi = normaliseIdentifier(candidate.mmsi);
  if (q.looksLikeMmsi && candMmsi) {
    const hit = candMmsi === normaliseIdentifier(q.looksLikeMmsi);
    signals.push(
      fireSignal(
        "mmsi",
        "MMSI",
        hit ? IDENTITY_WEIGHTS.mmsi : 0,
        hit
          ? `Query MMSI ${q.looksLikeMmsi} matches candidate MMSI ${candidate.mmsi}.`
          : `Query MMSI ${q.looksLikeMmsi} does not match candidate MMSI ${candidate.mmsi}.`,
      ),
    );
  }

  // Call sign
  const candCall = normaliseIdentifier(candidate.callSign);
  if (q.looksLikeCallSign && candCall) {
    const hit = candCall === normaliseIdentifier(q.looksLikeCallSign);
    signals.push(
      fireSignal(
        "callSign",
        "Call sign",
        hit ? IDENTITY_WEIGHTS.callSign : 0,
        hit
          ? `Query call sign ${q.looksLikeCallSign} matches candidate ${candidate.callSign}.`
          : `Query call sign ${q.looksLikeCallSign} does not match candidate ${candidate.callSign}.`,
      ),
    );
  }

  // Name similarity — only when the query looks like a name, not an id.
  if (!q.looksLikeImo && !q.looksLikeMmsi) {
    const sim = nameSimilarity(q.name, candidate.name);
    const pct = Math.round(sim * 100);
    const contribution = Math.round(sim * IDENTITY_WEIGHTS.name);
    signals.push(
      fireSignal(
        "name",
        "Name",
        contribution,
        `Name similarity between "${input.query}" and "${candidate.name ?? "(unnamed)"}" is ${pct}%.`,
      ),
    );
    // Alias / historical — take the best match across aliases and historical names.
    let bestAlias = 0;
    let bestAliasFrom: string | null = null;
    for (const a of candidate.aliases ?? []) {
      const s = nameSimilarity(q.name, a);
      if (s > bestAlias) {
        bestAlias = s;
        bestAliasFrom = a;
      }
    }
    if (bestAliasFrom) {
      signals.push(
        fireSignal(
          "alias",
          "Alias",
          Math.round(bestAlias * IDENTITY_WEIGHTS.alias),
          `Best alias match: "${bestAliasFrom}" at ${Math.round(bestAlias * 100)}%.`,
        ),
      );
    }
    let bestHist = 0;
    let bestHistFrom: string | null = null;
    for (const h of candidate.historicalNames ?? []) {
      const s = nameSimilarity(q.name, h);
      if (s > bestHist) {
        bestHist = s;
        bestHistFrom = h;
      }
    }
    if (bestHistFrom) {
      signals.push(
        fireSignal(
          "historical",
          "Historical name",
          Math.round(bestHist * IDENTITY_WEIGHTS.historical),
          `Prior name "${bestHistFrom}" matched at ${Math.round(bestHist * 100)}%.`,
        ),
      );
    }
  }

  // Vessel type — fires when the officer provided a type hint.
  if (input.hints?.vesselType && candidate.vesselType) {
    const hit =
      candidate.vesselType.toLowerCase() === input.hints.vesselType.toLowerCase();
    signals.push(
      fireSignal(
        "vesselType",
        "Vessel type",
        hit ? IDENTITY_WEIGHTS.vesselType : 0,
        hit
          ? `Vessel type ${candidate.vesselType} matches officer hint.`
          : `Vessel type ${candidate.vesselType} does not match officer hint ${input.hints.vesselType}.`,
      ),
    );
  }

  // Flag — only when the officer supplied a flag hint.
  if (input.hints?.flag && candidate.flag) {
    const hit = candidate.flag.toUpperCase() === input.hints.flag.toUpperCase();
    signals.push(
      fireSignal(
        "flag",
        "Flag",
        hit ? IDENTITY_WEIGHTS.flag : 0,
        hit
          ? `Flag ${candidate.flag} matches officer hint.`
          : `Flag ${candidate.flag} does not match officer hint ${input.hints.flag}.`,
      ),
    );
  }

  // matchFields (GFW provider verdict) — Sprint 1C.1 promotes this to a
  // primary signal. SHIPNAME / SEVERAL_FIELDS contribute full points;
  // NO_MATCH contributes 0 (and is further de-prioritised in selectIdentity).
  const mf = (candidate.providerMatchFields ?? "").toUpperCase();
  let mfContribution = 0;
  let mfDetail = "";
  if (mf === "SEVERAL_FIELDS") {
    mfContribution = IDENTITY_WEIGHTS.matchFields;
    mfDetail = "Provider matched several identity fields (strongest verdict).";
  } else if (mf === "SHIPNAME") {
    mfContribution = Math.round(IDENTITY_WEIGHTS.matchFields * 0.8);
    mfDetail = "Provider confirmed name match.";
  } else if (mf === "NO_MATCH") {
    mfContribution = 0;
    mfDetail = "Provider tagged this record as NO_MATCH.";
  } else if (mf) {
    mfContribution = Math.round(IDENTITY_WEIGHTS.matchFields * 0.5);
    mfDetail = `Provider verdict: ${mf}.`;
  }
  if (mf) {
    signals.push(
      fireSignal("matchFields", "Provider match fields", mfContribution, mfDetail),
    );
  }

  // Normalise: score as a percentage of the signals that were
  // *applicable* to this query. This lets a pure-name search reach 100
  // when the name is exact, without being penalised for the absence of
  // an IMO hint the officer did not supply.
  const contributionSum = signals.reduce((s, x) => s + x.contribution, 0);
  const applicableWeight = signals.reduce((s, x) => s + x.weight, 0);
  const rawScore =
    applicableWeight > 0
      ? Math.round((contributionSum / applicableWeight) * 100)
      : 0;

  // NO_MATCH damper preserved as a secondary safety belt on top of the
  // primary matchFields signal — a provider that says "not this vessel"
  // must never be able to hit VERIFIED on other signals alone.
  const modifier = mf === "NO_MATCH" ? 0.35 : 1;
  const score = Math.max(0, Math.min(100, Math.round(rawScore * modifier)));
  const tier: IdentityConfidenceTier =
    score >= 90 ? "VERIFIED" : score >= 70 ? "OBSERVED" : score >= 50 ? "INFERRED" : "UNCONFIRMED";

  const strongest = [...signals]
    .filter((s) => s.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)[0];
  const rationale = strongest
    ? `${tier} — ${strongest.label} contributed ${strongest.contribution}/${strongest.weight} points; total ${score}/100.`
    : `${tier} — no positive identity signals; total ${score}/100.`;

  return { candidateId: candidate.id, rawScore, score, tier, signals, rationale };
}

/**
 * Rank a list of candidates and decide whether the pipeline can
 * auto-select or must ask the officer.
 */
export function selectIdentity<C extends IdentityCandidate>(
  candidates: readonly C[],
  input: IdentityConfidenceInput,
  options: IdentityScoringOptions = {},
): IdentitySelection<C> {
  const autoSelectThreshold = options.autoSelectThreshold ?? 70;
  const tieBandPoints = options.tieBandPoints ?? 8;

  if (candidates.length === 0) {
    return {
      selected: null,
      confidence: null,
      alternates: [],
      rejected: [],
      requiresConfirmation: true,
      ambiguityReason: "no-candidates",
      selectionReason: "No candidates returned by upstream connectors.",
    };
  }

  const scored = candidates.map((candidate) => {
    const confidence = scoreIdentityCandidate(candidate, input);
    const mf = (candidate.providerMatchFields ?? "").toUpperCase();
    const isNoMatch = mf === "NO_MATCH";
    return {
      candidate,
      confidence,
      rejected: isNoMatch,
      rejectionReason: isNoMatch
        ? "Upstream provider tagged this record as NO_MATCH."
        : undefined,
    } satisfies IdentityAlternate<C>;
  });

  // De-prioritise NO_MATCH candidates: only surface them when nothing
  // else is on the table. Rejected candidates are always returned in
  // `rejected` so the officer can inspect them.
  const survivors = scored.filter((s) => !s.rejected);
  const rejected = scored
    .filter((s) => s.rejected)
    .sort((a, b) => b.confidence.score - a.confidence.score);
  const pool = survivors.length > 0 ? survivors : scored;
  const ranked = [...pool].sort((a, b) => b.confidence.score - a.confidence.score);

  const top = ranked[0];
  const runner = ranked[1];
  let requiresConfirmation = false;
  let ambiguityReason: IdentitySelection<C>["ambiguityReason"] = "none";
  // Tie beats threshold: two candidates the officer likely cares about
  // MUST always be disambiguated, even if both clear the auto-select bar.
  if (runner && top.confidence.score - runner.confidence.score <= tieBandPoints) {
    requiresConfirmation = true;
    ambiguityReason = "tied-candidates";
  } else if (top.confidence.score < autoSelectThreshold) {
    requiresConfirmation = true;
    ambiguityReason = "below-threshold";
  }

  const positiveSignals = top.confidence.signals
    .filter((s) => s.contribution > 0)
    .map((s) => s.label);
  const criteriaText = positiveSignals.length
    ? positiveSignals.join(", ")
    : "no positive identity signals";
  const selectionReason =
    survivors.length === 0
      ? `Only NO_MATCH candidates were available; surfaced the highest-scoring rejection at ${top.confidence.score}/100 for officer review.`
      : ambiguityReason === "tied-candidates"
        ? `Two candidates are within ${tieBandPoints} points (${top.confidence.score} vs ${runner!.confidence.score}); officer confirmation required. Matching criteria: ${criteriaText}.`
        : ambiguityReason === "below-threshold"
          ? `Top candidate scored ${top.confidence.score}/100 (below ${autoSelectThreshold}); officer confirmation required. Matching criteria: ${criteriaText}.`
          : `Selected on ${criteriaText}; confidence ${top.confidence.score}/100 (${top.confidence.tier}).`;

  return {
    selected: top.candidate,
    confidence: top.confidence,
    alternates: ranked,
    rejected,
    requiresConfirmation,
    ambiguityReason,
    selectionReason,
  };
}
