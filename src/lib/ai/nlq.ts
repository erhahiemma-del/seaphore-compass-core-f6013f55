/**
 * Natural Language Query utilities.
 *
 * Not a keyword matcher — this classifies a free-text query into one of the
 * four canonical intelligence modes and extracts likely entity references
 * (IMO, container, BOL, company). The classification primes the mode chip
 * in the AskCopilot dialog and biases the retrieval workflow. The live
 * model call still owns final reasoning (COP-5).
 */
import type { CopilotMode } from "./types";

const MODE_HINTS: Array<{ mode: CopilotMode; patterns: RegExp[] }> = [
  {
    mode: "SEARCH",
    patterns: [
      /\b(show|find|list|lookup|look up|which|who|where)\b/i,
      /\b(vessel|imo|company|manifest|container|bol|port)\b/i,
    ],
  },
  {
    mode: "RETRIEVE",
    patterns: [
      /\b(timeline|events?|history|documents?|transactions?|inspections?|alerts?|arrivals?|departures?)\b/i,
      /\b(today|yesterday|this week|last week|between|since)\b/i,
    ],
  },
  {
    mode: "INTERPRET",
    patterns: [
      /\b(why|explain|reason|root cause|pattern|anomal|risk|impact|linked|connected|relationship)\b/i,
    ],
  },
  {
    mode: "ADVISE",
    patterns: [
      /\b(recommend|should|advise|priorit|forecast|scenario|allocate|brief|next steps?)\b/i,
    ],
  },
];

export function classifyMode(query: string): CopilotMode {
  const q = query.trim();
  if (!q) return "SEARCH";
  const scores: Record<CopilotMode, number> = {
    SEARCH: 0,
    RETRIEVE: 0,
    INTERPRET: 0,
    ADVISE: 0,
  };
  for (const { mode, patterns } of MODE_HINTS) {
    for (const p of patterns) if (p.test(q)) scores[mode] += 1;
  }
  // Interpret / Advise dominate when co-present.
  if (scores.ADVISE > 0) return "ADVISE";
  if (scores.INTERPRET > 0) return "INTERPRET";
  if (scores.RETRIEVE > 0) return "RETRIEVE";
  return "SEARCH";
}

export interface ExtractedEntity {
  kind: "imo" | "container" | "bol" | "voyage" | "company" | "port";
  value: string;
}

const IMO_RE = /\bIMO[:\s]*([0-9]{7})\b/i;
const CONTAINER_RE = /\b([A-Z]{4}[0-9]{7})\b/;
const BOL_RE = /\b(BOL|B\/L)[:\s]*([A-Z0-9-]{6,})/i;
const VOYAGE_RE = /\b(VOY|VOYAGE)[:\s]*([A-Z0-9-]{3,})/i;
const PORT_RE = /\b(Lagos|Apapa|Tin Can|Onne|Port Harcourt|Warri|Calabar)\b/i;

export function extractEntities(query: string): ExtractedEntity[] {
  const out: ExtractedEntity[] = [];
  const imo = IMO_RE.exec(query);
  if (imo) out.push({ kind: "imo", value: imo[1] });
  const c = CONTAINER_RE.exec(query);
  if (c) out.push({ kind: "container", value: c[1] });
  const bol = BOL_RE.exec(query);
  if (bol) out.push({ kind: "bol", value: bol[2] });
  const voy = VOYAGE_RE.exec(query);
  if (voy) out.push({ kind: "voyage", value: voy[2] });
  const port = PORT_RE.exec(query);
  if (port) out.push({ kind: "port", value: port[1] });
  return out;
}
