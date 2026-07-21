/**
 * LAYER 2.2 — Intent Classifier.
 * Determines query intent (mode + capabilities + entities). NEVER retrieves data.
 * This is a deterministic, model-independent heuristic classifier so that the
 * pipeline can start reasoning about scope before any model call.
 */
import type { CapabilityId, Intent, OfficerQuery, Workspace } from "./types";
import { WORKSPACE_CONTRACTS } from "./workspace-contracts";

const MODE_HINTS = {
  investigation: [/investigat/i, /case /i, /open a case/i, /suspicious/i, /fraud/i],
  forecast: [/forecast/i, /predict/i, /trend/i, /next (week|month|quarter)/i],
  assessment: [/assess/i, /evaluat/i, /review /i, /analy(z|s)e/i, /why /i],
  lookup: [/what is/i, /who is/i, /lookup/i, /find /i, /show me/i],
} as const;

const CAPABILITY_HINTS: Record<CapabilityId, RegExp[]> = {
  OWNERSHIP_ANALYSIS: [/owner/i, /beneficial/i, /director/i, /shareholder/i, /parent compan/i],
  REVENUE_LEAKAGE_DETECTION: [/revenue/i, /duty/i, /under[- ]declar/i, /tariff/i, /leakage/i],
  MANIFEST_CORRELATION: [/manifest/i, /declar/i, /cargo/i, /bill of lading/i, /container/i],
  RELATIONSHIP_DISCOVERY: [/related/i, /connect/i, /link/i, /network/i, /affiliat/i],
  PATTERN_DETECTION: [/pattern/i, /similar/i, /historical/i, /previous case/i],
  COMPLIANCE_ASSESSMENT: [/complian/i, /certificate/i, /isps/i, /marpol/i, /regulator/i],
  SANCTIONS_SCREENING: [/sanction/i, /ofac/i, /designated/i, /blacklist/i],
  EVIDENCE_SEARCH: [/evidence/i, /document/i, /record/i, /file/i],
  DOCUMENT_ANALYSIS: [/analyze document/i, /extract/i, /parse/i, /ocr/i],
  RISK_SCORING: [/risk score/i, /risk level/i, /risk /i],
  RECOMMENDATION_ENGINE: [/recommend/i, /what should/i, /action/i, /next step/i],
};

const IMO_RE = /\bIMO\s?\d{7}\b/gi;
const MMSI_RE = /\b\d{9}\b/g;
const RC_RE = /\bRC[- ]?\d{5,8}\b/gi;

/** Module hint → primary capability biased into the scheduler. */
const MODULE_HINT_CAPABILITY: Record<string, CapabilityId> = {
  manifest: "MANIFEST_CORRELATION",
  cargo: "MANIFEST_CORRELATION",
  revenue: "REVENUE_LEAKAGE_DETECTION",
  vessel: "PATTERN_DETECTION",
  ports: "PATTERN_DETECTION",
  ownership: "OWNERSHIP_ANALYSIS",
  compliance: "COMPLIANCE_ASSESSMENT",
  evidence: "EVIDENCE_SEARCH",
  alerts: "RISK_SCORING",
  memory: "PATTERN_DETECTION",
  administration: "EVIDENCE_SEARCH",
  seaphore: "EVIDENCE_SEARCH",
};


export function classifyIntent(query: OfficerQuery): Intent {
  const q = query.query;

  // Mode detection — investigation > forecast > assessment > lookup
  let mode: Intent["mode"] = "lookup";
  for (const [candidate, patterns] of Object.entries(MODE_HINTS) as Array<
    [Intent["mode"], readonly RegExp[]]
  >) {
    if (patterns.some((p) => p.test(q))) {
      mode = candidate;
      break;
    }
  }

  // Capability detection
  const capabilities: CapabilityId[] = [];
  for (const [cap, patterns] of Object.entries(CAPABILITY_HINTS) as Array<
    [CapabilityId, RegExp[]]
  >) {
    if (patterns.some((p) => p.test(q))) capabilities.push(cap);
  }

  // Module-hint bias — when the query originates from a specialist Copilot
  // surface (Manifest / Revenue / etc.), prepend that module's primary
  // capability so the Agent Scheduler consults its specialist first.
  const moduleCapability = MODULE_HINT_CAPABILITY[query.moduleHint ?? ""];
  if (moduleCapability && !capabilities.includes(moduleCapability)) {
    capabilities.unshift(moduleCapability);
  }

  if (capabilities.length === 0) capabilities.push("EVIDENCE_SEARCH");


  // Entity extraction — non-fabricating; only lifts literals present in query
  const entities: Intent["entities"] = [];
  for (const m of q.matchAll(IMO_RE)) entities.push({ type: "vessel_imo", value: m[0] });
  for (const m of q.matchAll(MMSI_RE)) entities.push({ type: "vessel_mmsi", value: m[0] });
  for (const m of q.matchAll(RC_RE)) entities.push({ type: "company_rc", value: m[0] });

  // Workspace — from context if provided, else infer from dominant capability
  const workspace: Workspace | undefined =
    query.context?.workspace ??
    Object.values(WORKSPACE_CONTRACTS).find((w) =>
      w.capabilities.some((c) => capabilities.includes(c)),
    )?.id;

  return {
    mode,
    capabilities,
    entities,
    workspace,
    raw: q,
    reasoning: `mode=${mode}; capabilities=[${capabilities.join(",")}]; entities=${entities.length}`,
  };
}
