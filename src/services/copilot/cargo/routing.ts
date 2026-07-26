/**
 * SPRINT CAP-04 — Cargo Investigation Copilot · prompt routing.
 *
 * Decides whether an officer's question is a cargo investigation and,
 * if so, which of the CAP-04 investigations it is and what entity it is
 * about. Routing is lexical + graph-resolved — no model call, no
 * provider call, no acquisition. If the subject cannot be resolved
 * against the Canonical UIP the route says so instead of guessing.
 */
import type { CargoGraphQuery } from "@/services/cargo-graph";
import type { CargoIntent, CargoRoute } from "./types";

interface IntentRule {
  readonly intent: CargoIntent;
  readonly patterns: ReadonlyArray<RegExp>;
  readonly weight: number;
}

/** Ordered by specificity — the most specific matching rule wins. */
const RULES: ReadonlyArray<IntentRule> = [
  {
    intent: "revenue-leakage",
    weight: 0.95,
    patterns: [
      /revenue\s+leak/i,
      /under[-\s]?declar/i,
      /duty\s+(short|loss|leak)/i,
      /explain\s+(the\s+)?revenue/i,
      /lost\s+revenue/i,
    ],
  },
  {
    intent: "cargo-risk",
    weight: 0.92,
    patterns: [
      /why\s+.*(cargo|shipment|container|consignment).*(high\s+risk|risky|flagged)/i,
      /(cargo|shipment|container)\s+risk/i,
      /explain\s+.*risk.*(cargo|shipment|container)/i,
    ],
  },
  {
    intent: "containers-for-company",
    weight: 0.9,
    patterns: [
      /container[s]?\s+(linked|connected|related|belonging)\s+to/i,
      /(show|list|find)\s+.*container[s]?\s+.*(company|shipper|consignee|importer|exporter)/i,
      /every\s+container/i,
    ],
  },
  {
    intent: "bills-of-lading",
    weight: 0.9,
    patterns: [
      /bill[s]?\s+of\s+lading/i,
      /\bb\/?l[s]?\b/i,
      /\bbol[s]?\b/i,
    ],
  },
  {
    intent: "related-vessels",
    weight: 0.85,
    patterns: [
      /related\s+vessel/i,
      /(show|list|which)\s+vessel[s]?\s+(linked|related|connected|carried)/i,
      /vessel[s]?\s+(linked|connected)\s+to/i,
    ],
  },
  {
    intent: "cargo-timeline",
    weight: 0.8,
    patterns: [
      /(cargo|shipment|container|manifest)\s+timeline/i,
      /timeline\s+(of|for)\s+(this\s+)?(cargo|shipment|container|consignment)/i,
      /chronolog/i,
    ],
  },
  {
    intent: "investigate-shipment",
    weight: 0.75,
    patterns: [
      /investigate\s+(this\s+)?(shipment|cargo|consignment|container|manifest|bill\s+of\s+lading)/i,
      /(shipment|consignment)\s+dossier/i,
      /(analyse|analyze|review)\s+(this\s+)?(shipment|cargo|consignment)/i,
      /cargo\s+intelligence/i,
      /manifest\s+intelligence/i,
      /customs\s+intelligence/i,
    ],
  },
];

/** Canonical id appearing verbatim in the query, e.g. a pasted entity id. */
const CANONICAL_ID = /\b((?:cargo|vessel|company|port|voyage|portcall):[A-Za-z0-9:._\-/]+)\b/;
/** Common cargo identifiers officers type: container units and IMO numbers. */
const CONTAINER_UNIT = /\b([A-Z]{4}\d{7})\b/;
const IMO_NUMBER = /\bIMO\s*(\d{7})\b/i;

const STOP_WORDS = new Set([
  "the", "this", "that", "for", "of", "to", "and", "show", "me", "all", "every",
  "find", "list", "explain", "why", "is", "are", "linked", "related", "please",
  "investigate", "cargo", "shipment", "container", "containers", "company",
  "vessel", "vessels", "bill", "bills", "lading", "manifest", "risk", "high",
  "revenue", "leakage", "customs", "intelligence", "timeline",
]);

/** Lift the most plausible subject phrase from the query. */
export function extractSubjectTerm(query: string): string | null {
  const canonical = query.match(CANONICAL_ID);
  if (canonical) return canonical[1];
  const unit = query.match(CONTAINER_UNIT);
  if (unit) return unit[1];
  const imo = query.match(IMO_NUMBER);
  if (imo) return imo[1];

  // Prefer an explicit "… to/for <subject>" tail.
  const tail = query.match(/\b(?:to|for|about|on)\s+([^?.,]{2,60})$/i);
  const candidate = (tail?.[1] ?? query)
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9:._\-/]/g, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
  if (candidate.length === 0) return null;
  return candidate.join(" ").trim() || null;
}

export interface CargoRoutingOptions {
  /** Graph query used to resolve the subject. Omitted → no resolution. */
  readonly graph?: CargoGraphQuery | null;
  /** Sticky focus from the conversation, used when the query names none. */
  readonly stickyFocusId?: string | null;
}

/**
 * Route an officer question. Returns `null` when the question is not a
 * cargo investigation — the caller then falls through to the normal OIE
 * pipeline untouched.
 */
export function routeCargoQuery(
  query: string,
  opts: CargoRoutingOptions = {},
): CargoRoute | null {
  const text = query.trim();
  if (text.length === 0) return null;

  let matched: { intent: CargoIntent; trigger: string; weight: number } | null = null;
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const m = text.match(pattern);
      if (m) {
        matched = { intent: rule.intent, trigger: m[0].trim(), weight: rule.weight };
        break;
      }
    }
    if (matched) break;
  }
  if (!matched) return null;

  const subjectTerm = extractSubjectTerm(text);
  const { focusId, resolution, bonus } = resolveFocus(subjectTerm, opts);

  return {
    intent: matched.intent,
    trigger: matched.trigger,
    subjectTerm,
    focusId,
    resolution,
    score: Math.min(1, matched.weight + bonus),
  };
}

function resolveFocus(
  subjectTerm: string | null,
  opts: CargoRoutingOptions,
): { focusId: string | null; resolution: string; bonus: number } {
  const graph = opts.graph ?? null;
  if (!graph) {
    return {
      focusId: opts.stickyFocusId ?? null,
      resolution: opts.stickyFocusId
        ? "Using the entity carried over from the previous question; no cargo graph was available to confirm it."
        : "No cargo graph was available, so no subject could be resolved.",
      bonus: 0,
    };
  }

  if (subjectTerm) {
    const direct = graph.node(subjectTerm);
    if (direct) {
      return {
        focusId: direct.id,
        resolution: `Resolved "${subjectTerm}" to ${direct.label} by canonical id.`,
        bonus: 0.05,
      };
    }
    const hits = graph.search(subjectTerm, 5);
    if (hits.length === 1) {
      return {
        focusId: hits[0].id,
        resolution: `Resolved "${subjectTerm}" to ${hits[0].label} — one matching entity in the Canonical UIP.`,
        bonus: 0.05,
      };
    }
    if (hits.length > 1) {
      return {
        focusId: hits[0].id,
        resolution: `"${subjectTerm}" matched ${hits.length} entities; showing ${hits[0].label}. Name the entity precisely to switch focus.`,
        bonus: 0,
      };
    }
  }

  if (opts.stickyFocusId && graph.node(opts.stickyFocusId)) {
    return {
      focusId: opts.stickyFocusId,
      resolution: "No subject named, so the entity from the previous question is carried forward.",
      bonus: 0,
    };
  }

  return {
    focusId: null,
    resolution: subjectTerm
      ? `No entity matching "${subjectTerm}" exists in the Canonical UIP. Nothing is assumed in its place.`
      : "No subject was named and none is carried over from the conversation.",
    bonus: 0,
  };
}
