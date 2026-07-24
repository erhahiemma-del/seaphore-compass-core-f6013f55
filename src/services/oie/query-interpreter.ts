/**
 * OIE · Module 1 — Query Interpreter.
 *
 * Deterministic maritime-domain interpreter. Recognises operational
 * INTENT (verb-shaped) rather than raw keywords, extracts entities,
 * and flags ambiguity so the clarifier can take over. Never calls a
 * model — the same officer question always classifies the same way.
 */
import type {
  EntityMention,
  InterpretedQuery,
  OperationalDomain,
  OperationalIntent,
} from "./types";

const IMO_RE = /\b(?:IMO[\s:#-]*)?(\d{7})\b/gi;
const MMSI_RE = /\b(\d{9})\b/g;
const PORT_HINT_RE =
  /\b(?:port of|at|to|from|calling at|arriving in|departing from)\s+([A-Z][a-zA-Z\-'\s]{2,30})/g;
const COMPANY_HINT_RE =
  /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})\s+(?:Shipping|Maritime|Holdings?|Logistics|Group|Ltd|Limited|Plc|Inc|LLC|Trading|Petroleum|Tankers?)\b/g;
const VESSEL_NAME_RE =
  /\b(?:vessel|ship|tanker|bulker|MV|MT|M\.V\.|M\.T\.)\s+([A-Z][A-Za-z0-9\-']+(?:\s+[A-Z][A-Za-z0-9\-']+){0,3})/g;
const QUOTED_RE = /["“]([^"”]{2,60})["”]/g;

const DOMAIN_PATTERNS: Array<[OperationalDomain, RegExp]> = [
  ["revenue", /\b(revenue|leakage|underpay(?:ment)?|invoic|tariff|fee|levy|duty|assessment fee|shortfall)/i],
  ["ownership", /\b(owner(?:ship)?|beneficial|shareholder|UBO|corporate|network|parent company|subsidiary)/i],
  ["manifest", /\b(manifest|bill of lading|BOL|declaration|cargo list|customs form)/i],
  ["cargo", /\b(cargo|container|TEU|goods|commodit|hazmat|dangerous goods)/i],
  ["sanctions", /\b(sanction|OFAC|EU list|UN list|blacklist|blocked|SDN)/i],
  ["compliance", /\b(complian|regulation|breach|violation|NIMASA|IMO rule|SOLAS|MARPOL|ISPS)/i],
  ["port", /\b(port|berth|terminal|call|arriv|departur|anchorage)/i],
  ["voyage", /\b(voyage|route|passage|leg|transit|last trip|previous voyage)/i],
  ["vessel", /\b(vessel|ship|tanker|bulker|IMO|MMSI|flag)/i],
  ["evidence", /\b(evidence|document|proof|record|source|attach)/i],
];

// Intent patterns are ordered — the FIRST match wins. Place more specific
// verb+object combinations above generic ones.
const INTENT_PATTERNS: Array<[OperationalIntent, RegExp]> = [
  // Compare / diff
  ["manifest_comparison", /\b(compare|diff|difference).{0,40}(manifest|voyage|declaration|cargo list)/i],
  ["voyage_comparison", /\b(compare|diff).{0,30}(voyage|trip|passage|leg|previous|last month)/i],

  // Arrival / activity search
  ["arrival_search", /\b(arriv|inbound|expected|due to (?:arrive|dock)|today'?s\s+\w*\s*vessel|today'?s\s+arriv)/i],

  // Risk / anomaly
  ["risk_investigation", /\b(why (?:is|are)|high[- ]?risk|risk score|red flag|flagged|anomal|which ones? (?:are|is)\s+(?:high[- ]?risk|risky|flagged))/i],
  ["operational_assessment", /\b(explain|why|what is happening|what does this mean|assess this)/i],

  // Domain-specific investigations
  ["revenue_leakage", /\b(revenue leakage|underpay|shortfall|missing (?:revenue|fee|levy)|leakage)/i],
  ["revenue_investigation", /\b(revenue|tariff|fee|levy)\b.*\b(assess|review|investigat|check)/i],
  ["ownership_investigation", /\b(who owns|owner(?:ship)?|beneficial|shareholder|corporate ties|network)/i],
  ["manifest_investigation", /\b(manifest|bill of lading|BOL|declaration).*\b(check|review|inspect|investigat|show|look)/i],
  ["cargo_investigation", /\b(cargo|container|hazmat|commodit)\b.*\b(check|inspect|review|show|investigat)/i],
  ["compliance_review", /\b(complian(?:ce|t)?|breach|violation|regulator|NIMASA)/i],
  ["vessel_investigation", /\b(investigat|dossier|profile|tell me about|look into|deep dive).*\b(vessel|ship|IMO)/i],

  // Executive
  ["executive_briefing", /\b(executive|director|leadership|board|summary of the day|daily briefing)/i],

  // Broad show / list
  ["vessel_investigation", /\b(show|list|find|display).*\b(vessel|ship|fleet)/i],
];

function detectDomains(q: string): OperationalDomain[] {
  const hits = DOMAIN_PATTERNS.filter(([, re]) => re.test(q)).map(([d]) => d);
  return hits.length > 0 ? Array.from(new Set(hits)) : ["general"];
}

function detectIntent(q: string, entities: EntityMention[]): {
  intent: OperationalIntent;
  ambiguous: boolean;
} {
  for (const [intent, re] of INTENT_PATTERNS) {
    if (re.test(q)) return { intent, ambiguous: false };
  }
  // No verb intent detected. If the query names an entity, resolve it
  // as a full entity dossier / executive briefing rather than
  // interrupting the officer with a clarification card (UX-001).
  if (entities.length > 0) return { intent: "entity_dossier", ambiguous: false };
  return { intent: "ambiguous", ambiguous: true };
}

function intentToMode(intent: OperationalIntent): InterpretedQuery["mode"] {
  switch (intent) {
    case "arrival_search":
    case "vessel_investigation":
    case "executive_briefing":
    case "entity_dossier":
      return "lookup";
    case "risk_investigation":
    case "operational_assessment":
    case "revenue_leakage":
    case "revenue_investigation":
    case "compliance_review":
      return "assessment";
    case "manifest_investigation":
    case "manifest_comparison":
    case "cargo_investigation":
    case "ownership_investigation":
    case "voyage_comparison":
      return "investigation";
    default:
      return "assessment";
  }
}

function extractEntities(q: string): EntityMention[] {
  const out: EntityMention[] = [];
  const seen = new Set<string>();
  const push = (type: EntityMention["type"], value: string, span?: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    const k = `${type}:${clean.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ type, value: clean, span });
  };

  for (const m of q.matchAll(IMO_RE)) push("imo", m[1], m[0]);
  for (const m of q.matchAll(MMSI_RE)) {
    // Skip if this MMSI is actually an IMO (already captured).
    if (!Array.from(q.matchAll(IMO_RE)).some((im) => im[1] === m[1])) push("mmsi", m[1], m[0]);
  }
  for (const m of q.matchAll(VESSEL_NAME_RE)) push("vessel", m[1], m[0]);
  for (const m of q.matchAll(QUOTED_RE)) push("vessel", m[1], m[0]);
  for (const m of q.matchAll(PORT_HINT_RE)) push("port", m[1].trim(), m[0]);
  for (const m of q.matchAll(COMPANY_HINT_RE)) push("company", m[0], m[0]);
  return out;
}

/**
 * Detects pronoun references ("it", "this", "them", "its", "their",
 * "they", "that") in the raw query — the caller resolves them to a
 * concrete anchor entity from mission context.
 */
export function containsPronounReference(q: string): boolean {
  return /\b(it|its|this|that|they|them|their|the vessel|the ship|the company|the manifest|the port)\b/i.test(
    q,
  );
}

export interface InterpretOptions {
  /** Anchor entity from mission context (last-mentioned entity). */
  anchor?: EntityMention;
  /** Text that has already had pronouns rewritten. */
  resolvedQuery?: string;
}

export function interpretQuery(raw: string, opts: InterpretOptions = {}): InterpretedQuery {
  const q = raw.trim();
  const resolved = (opts.resolvedQuery ?? raw).trim();
  const domains = detectDomains(resolved);
  const entities = extractEntities(resolved);
  // If pronoun resolution injected an entity, promote it to entities.
  if (opts.anchor && !entities.some((e) => e.value.toLowerCase() === opts.anchor!.value.toLowerCase())) {
    entities.unshift(opts.anchor);
  }
  const { intent, ambiguous } = detectIntent(resolved, entities);
  const mode = intentToMode(intent);
  const reasoning = [
    `Intent: ${intent}${ambiguous ? " (ambiguous)" : ""}.`,
    `Mode: ${mode}.`,
    `Domains: ${domains.join(", ")}.`,
    `Entities: ${entities.length > 0 ? entities.map((e) => `${e.type}=${e.value}`).join("; ") : "none"}.`,
    opts.anchor ? `Anchor carried from context: ${opts.anchor.type}=${opts.anchor.value}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    raw: q,
    resolved,
    intent,
    mode,
    domains,
    entities,
    anchor: opts.anchor,
    reasoning,
    ambiguous,
  };
}

/** Utility used by the resolver — extract just the entities from raw text. */
export { extractEntities };
