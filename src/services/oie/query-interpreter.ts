/**
 * OIE · Module 1 — Query Interpreter.
 *
 * Parses natural language into a structured `InterpretedQuery`. It does
 * NOT call a model; it uses deterministic maritime-domain patterns so
 * the same query always classifies the same way, regardless of which
 * reasoning provider follows.
 */
import type { InterpretedQuery, OperationalDomain } from "./types";

const IMO_RE = /\b(?:IMO\s*)?(\d{7})\b/gi;
const MMSI_RE = /\b(\d{9})\b/g;
const PORT_RE = /\b(?:port of|at|to|from)\s+([A-Z][a-zA-Z\-\s]{2,24})\b/g;
const COMPANY_HINT = /\b(shipping|holdings?|maritime|logistics|group|ltd|limited|plc|inc)\b/i;

const DOMAIN_KEYWORDS: Array<[OperationalDomain, RegExp]> = [
  ["revenue", /\b(revenue|leakage|underpay|invoic|tariff|fee|levy|duty)\b/i],
  ["ownership", /\b(owner|beneficial|shareholder|ubo|corporate|network)\b/i],
  ["manifest", /\b(manifest|bill of lading|BOL|declaration|cargo list)\b/i],
  ["cargo", /\b(cargo|container|TEU|goods|commodity)\b/i] as unknown as [OperationalDomain, RegExp],
  ["sanctions", /\b(sanction|OFAC|EU list|UN list|blacklist|blocked)\b/i],
  ["compliance", /\b(complian|regulation|breach|violation|nimasa|imo rule)\b/i],
  ["port", /\b(port|berth|terminal|call|arrival|departure)\b/i],
  ["voyage", /\b(voyage|route|passage|leg|transit)\b/i],
  ["vessel", /\b(vessel|ship|tanker|bulker|imo|mmsi)\b/i],
  ["evidence", /\b(evidence|document|proof|record|source)\b/i],
];

function detectDomains(q: string): OperationalDomain[] {
  const hits = DOMAIN_KEYWORDS.filter(([, re]) => re.test(q)).map(([d]) => d);
  return hits.length > 0 ? Array.from(new Set(hits)) : ["general"];
}

function detectIntent(q: string): InterpretedQuery["intent"] {
  if (/\b(who|what|where|when|show|list|find|lookup|profile)\b/i.test(q)) return "lookup";
  if (/\b(assess|evaluate|score|rank|risk|expos)\b/i.test(q)) return "assessment";
  if (/\b(forecast|predict|projected|next|will|likely)\b/i.test(q)) return "forecast";
  return "investigation";
}

function extractEntities(q: string): InterpretedQuery["entities"] {
  const out: InterpretedQuery["entities"] = [];
  const seen = new Set<string>();
  const push = (type: InterpretedQuery["entities"][number]["type"], value: string) => {
    const k = `${type}:${value.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ type, value });
  };

  for (const m of q.matchAll(IMO_RE)) push("imo", m[1]);
  for (const m of q.matchAll(MMSI_RE)) push("vessel", m[1]);
  for (const m of q.matchAll(PORT_RE)) push("port", m[1].trim());

  // Company heuristic: capitalised phrases containing a company hint token.
  const phraseRe = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\b/g;
  for (const m of q.matchAll(phraseRe)) {
    if (COMPANY_HINT.test(m[1])) push("company", m[1]);
  }
  return out;
}

export function interpretQuery(raw: string): InterpretedQuery {
  const q = raw.trim();
  const domains = detectDomains(q);
  const intent = detectIntent(q);
  const entities = extractEntities(q);
  const reasoning =
    `Operational domains: ${domains.join(", ")}. ` +
    `Intent: ${intent}. Entities detected: ${entities.length || "none"}.`;
  return { raw: q, intent, domains, entities, reasoning };
}
