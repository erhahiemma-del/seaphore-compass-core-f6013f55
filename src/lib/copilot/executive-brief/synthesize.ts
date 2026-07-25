/**
 * Executive Briefing synthesizer — presentation-layer only.
 *
 * Turns the pipeline's already-computed intelligence (AdaptiveBriefing +
 * OIE HumanResponse + IBE state) into the executive brief shape the
 * ExecutiveBriefing renderer consumes. No new inference, no new queries —
 * only reshape, humanise, and sanitise.
 */
import type {
  AdaptiveBriefing as AdaptiveBriefingData,
  EvidenceCardData,
  EvidenceGrade,
  PatternCardData,
} from "@/components/copilot/briefing/types";
import type { HumanResponse } from "@/services/oie/types";
import type { IbeResult } from "@/services/ibe/types";
import type {
  IdentityCandidate,
  IdentityConfidenceResult,
  IdentitySelection,
} from "@/intelligence/matching/identity-confidence";
import { sanitizeText } from "./sanitize";

export type StatusTone = "positive" | "warning" | "critical" | "neutral";

export interface KpiCard {
  key: string;
  label: string;
  value: string;
  tone: StatusTone;
  hint?: string;
}

export interface KeyFact {
  label: string;
  value: string;
}

export type RelationshipNodeKind =
  | "vessel"
  | "agent"
  | "operator"
  | "parent"
  | "director"
  | "beneficial-owner"
  | "port"
  | "cargo"
  | "case"
  | "other";

export interface RelationshipNode {
  id: string;
  label: string;
  kind: RelationshipNodeKind;
  hint?: string;
}

export type TimelineEventKind =
  | "arrival"
  | "departure"
  | "manifest"
  | "inspection"
  | "revenue"
  | "detention"
  | "cargo"
  | "ownership"
  | "compliance"
  | "sanction"
  | "signal"
  | "other";

export interface TimelineEvent {
  id: string;
  when: string;
  whenISO?: string;
  title: string;
  detail?: string;
  kind: TimelineEventKind;
  source?: string;
}

export interface RiskCheck {
  key: string;
  label: string;
  fired: boolean;
  detail?: string;
  tone: StatusTone;
}

export interface Insight {
  id: string;
  text: string;
  origin: "pattern" | "nudge" | "observation";
}

export interface Recommendation {
  id: string;
  text: string;
  rationale?: string;
  confidence?: string;
  priority: "primary" | "secondary";
}

export interface ConfidencePanel {
  dataCompleteness: number;
  relationshipConfidence: number;
  evidenceQuality: number;
  recency: number;
  operationalConfidence: number;
  headline: string;
}

export interface EvidenceGroup {
  key: string;
  label: string;
  items: EvidenceCardData[];
}

export interface IdentityResolutionRejection {
  id: string;
  label: string;
  score: number;
  reason: string;
}

export interface IdentityResolutionSection {
  /** Human-readable label for the selected vessel/entity. */
  selectedLabel: string;
  selectedId: string;
  imo?: string | null;
  mmsi?: string | null;
  flag?: string | null;
  callSign?: string | null;
  confidenceScore: number;
  tier: IdentityConfidenceResult["tier"];
  /** Signals that fired with positive contribution (matching criteria). */
  matchingCriteria: Array<{ label: string; detail: string; points: string }>;
  /** Candidates rejected outright (e.g. NO_MATCH). */
  rejectedCandidates: IdentityResolutionRejection[];
  /** Lower-scored alternates that were considered but not selected. */
  alternates: IdentityResolutionRejection[];
  /** Officer-facing sentence describing why this candidate was selected. */
  selectionReason: string;
  requiresConfirmation: boolean;
}

export interface ExecutiveBrief {
  executiveSummary: string;
  confidence: ConfidencePanel;
  kpis: KpiCard[];
  keyFacts: KeyFact[];
  identityResolution?: IdentityResolutionSection;
  relationships: RelationshipNode[];
  timeline: TimelineEvent[];
  risks: RiskCheck[];
  insights: Insight[];
  recommendations: Recommendation[];
  evidenceGroups: EvidenceGroup[];
  followUps: string[];
}

/* ─────────────────────────── helpers ─────────────────────────── */

const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100)));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function tierTone(tier: "low" | "medium" | "high"): StatusTone {
  return tier === "high" ? "positive" : tier === "medium" ? "warning" : "critical";
}

function riskTone(v: number): StatusTone {
  if (v >= 0.66) return "critical";
  if (v >= 0.33) return "warning";
  return "positive";
}

function badgeTone(badge?: string): StatusTone {
  if (!badge) return "neutral";
  if (badge.startsWith("High")) return "positive";
  if (badge.startsWith("Medium")) return "warning";
  return "critical";
}

/* ─────────────────────── executive summary ────────────────────── */

export function buildExecutiveSummary(
  briefing: AdaptiveBriefingData,
  human: HumanResponse | null,
): string {
  const first = sanitizeText(human?.executiveSummary || briefing.executive?.text);
  const impact = sanitizeText(human?.operationalImpact);
  const badge = human?.confidenceAssessment?.badge ?? "Insufficient Evidence";
  const tier = briefing.classification.tier;
  const assessment =
    tier === "high"
      ? "operational risk is currently Low"
      : tier === "medium"
        ? "operational picture requires attention"
        : "operational picture is incomplete";
  const conf = `Assessment held with ${badge.toLowerCase()} (${pct(
    briefing.classification.compositeConfidence,
  )}% composite); ${assessment}.`;
  if (first) {
    // 2–4 sentences: keep first sentence + up to two more, then append the confidence line.
    const trimmed = first
      .split(/(?<=[.!?])\s+/)
      .slice(0, 3)
      .join(" ");
    return `${trimmed} ${impact ? impact.split(/(?<=[.!?])\s+/)[0] + " " : ""}${conf}`.trim();
  }
  return `Available intelligence does not yet establish a firm conclusion for this query. ${conf}`.trim();
}

/* ─────────────────────── confidence panel ─────────────────────── */

export function buildConfidencePanel(
  briefing: AdaptiveBriefingData,
  ibe: IbeResult["ibe"] | null | undefined,
): ConfidencePanel {
  const q = briefing.evidenceSources?.queried ?? 0;
  const r = briefing.evidenceSources?.responded ?? 0;
  const c = briefing.evidenceSources?.corroborated ?? 0;
  const composite = briefing.classification.compositeConfidence ?? 0;

  const dataCompleteness = q > 0 ? clamp01(r / q) : composite;
  const relationshipConfidence = clamp01(
    ibe?.hypotheses?.length
      ? ibe.hypotheses.filter((h) => h.confidence === "leading" || h.confidence === "credible")
          .length /
          Math.max(1, ibe.hypotheses.length)
      : composite,
  );
  const evidenceQuality = clamp01(
    briefing.classification.evidenceStrength === "strong"
      ? 0.9
      : briefing.classification.evidenceStrength === "moderate"
        ? 0.6
        : 0.3,
  );
  const recency = clamp01(composite * 0.9 + 0.1);
  const operational = clamp01(
    composite * 0.6 + dataCompleteness * 0.2 + relationshipConfidence * 0.1 + evidenceQuality * 0.1,
  );
  return {
    dataCompleteness,
    relationshipConfidence,
    evidenceQuality,
    recency,
    operationalConfidence: operational,
    headline:
      operational >= 0.66
        ? "Confidence is strong across data, relationships, and evidence."
        : operational >= 0.33
          ? "Confidence is moderate — verify the weaker dimensions before deciding."
          : `${r} of ${q || "the required"} evidence sources have completed; treat this as directional only.`,
  };
}

/* ───────────────────────── KPI cards ─────────────────────────── */

export function buildKpiCards(
  briefing: AdaptiveBriefingData,
  ibe: IbeResult["ibe"] | null | undefined,
  human: HumanResponse | null,
): KpiCard[] {
  const impact = briefing.decisionImpact;
  const kpis: KpiCard[] = [];

  kpis.push({
    key: "risk",
    label: "Overall Risk",
    value: tierRiskLabel(briefing.classification.tier),
    tone: tierTone(briefing.classification.tier),
  });

  kpis.push({
    key: "confidence",
    label: "Confidence",
    value:
      human?.confidenceAssessment?.badge ??
      `${pct(briefing.classification.compositeConfidence)}% composite`,
    tone: badgeTone(human?.confidenceAssessment?.badge),
  });

  kpis.push({
    key: "operational",
    label: "Operational Status",
    value: ibe?.stage ? stageLabel(ibe.stage) : "Nominal",
    tone:
      ibe?.stage === "completed"
        ? "positive"
        : ibe?.stage === "decision_support"
          ? "warning"
          : "neutral",
  });

  const compliance = complianceStatus(briefing);
  kpis.push({
    key: "compliance",
    label: "Compliance",
    value: compliance.label,
    tone: compliance.tone,
  });

  const watchlist = watchlistStatus(briefing);
  kpis.push({
    key: "watchlist",
    label: "Watchlist",
    value: watchlist.label,
    tone: watchlist.tone,
  });

  kpis.push({
    key: "investigation",
    label: "Active Investigation",
    value: ibe?.stage && ibe.stage !== "completed" ? "Open" : "None",
    tone: ibe?.stage && ibe.stage !== "completed" ? "warning" : "neutral",
  });

  if (impact) {
    kpis.push({
      key: "revenue",
      label: "Revenue Exposure",
      value: `${pct(impact.revenue)}%`,
      tone: riskTone(impact.revenue),
    });
  }

  const lastEvidence = briefing.evidence?.[0]?.observedAt;
  kpis.push({
    key: "activity",
    label: "Last Activity",
    value: lastEvidence ? relative(lastEvidence) : "—",
    tone: "neutral",
  });

  return kpis;
}

function tierRiskLabel(tier: "low" | "medium" | "high"): string {
  // Confidence tier is inverse of risk here — high confidence, low residual risk.
  return tier === "high" ? "Low" : tier === "medium" ? "Elevated" : "Unclear";
}

function stageLabel(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function complianceStatus(b: AdaptiveBriefingData): { label: string; tone: StatusTone } {
  const gaps = b.intelligenceGaps?.length ?? 0;
  if (gaps === 0) return { label: "Clear", tone: "positive" };
  if (gaps < 3) return { label: "Attention", tone: "warning" };
  return { label: "Review Required", tone: "critical" };
}

function watchlistStatus(b: AdaptiveBriefingData): { label: string; tone: StatusTone } {
  const hit = b.evidence?.some((e) => /sanction|watchlist|ofac|un\b/i.test(e.summary ?? e.title));
  if (hit) return { label: "Match", tone: "critical" };
  return { label: "No Match", tone: "positive" };
}

function relative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const ms = Date.now() - d.getTime();
  const day = 24 * 3600_000;
  if (ms < day) return "Today";
  if (ms < 2 * day) return "Yesterday";
  if (ms < 30 * day) return `${Math.round(ms / day)}d ago`;
  if (ms < 365 * day) return `${Math.round(ms / (30 * day))}mo ago`;
  return `${Math.round(ms / (365 * day))}y ago`;
}

/* ─────────────────────────── key facts ───────────────────────── */

const FACT_LABELS: Record<string, string> = {
  imo: "IMO Number",
  mmsi: "MMSI",
  callsign: "Call Sign",
  "call sign": "Call Sign",
  flag: "Flag State",
  port: "Current Port",
  "last port": "Last Port",
  cargo: "Cargo Category",
  agent: "Registered Shipping Agent",
  operator: "Operating Company",
  parent: "Parent Company",
  registered: "First Registration",
  status: "Company Status",
};

export function buildKeyFacts(briefing: AdaptiveBriefingData): KeyFact[] {
  const facts: KeyFact[] = [];
  const primary = briefing.entities?.[0];
  if (!primary) return facts;
  if (primary.flag) facts.push({ label: "Flag State", value: primary.flag });
  if (primary.role) facts.push({ label: "Role", value: primary.role });
  if (primary.riskTier) {
    facts.push({
      label: "Risk Tier",
      value: primary.riskTier.replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }
  for (const ident of primary.identifiers ?? []) {
    const label = FACT_LABELS[ident.label.toLowerCase()] ?? ident.label;
    facts.push({ label, value: ident.value });
  }
  if (primary.lastSeen) {
    facts.push({ label: "Last Seen", value: relative(primary.lastSeen) });
  }
  // Include supporting entities (e.g. operator / agent) at most 4.
  for (const e of (briefing.entities ?? []).slice(1, 5)) {
    facts.push({
      label: (FACT_LABELS[e.type] ?? e.type.replace(/\b\w/g, (c) => c.toUpperCase())) as string,
      value: e.name,
    });
  }
  return facts;
}

/* ────────────────────────── relationships ────────────────────── */

const KIND_MAP: Record<string, RelationshipNodeKind> = {
  vessel: "vessel",
  company: "operator",
  operator: "operator",
  agent: "agent",
  parent: "parent",
  person: "director",
  port: "port",
  manifest: "cargo",
  sanction: "case",
};

export function buildRelationshipNodes(briefing: AdaptiveBriefingData): RelationshipNode[] {
  return (briefing.entities ?? []).slice(0, 8).map((e) => ({
    id: e.id,
    label: e.name,
    kind: KIND_MAP[e.type] ?? "other",
    hint: e.role ?? e.summary,
  }));
}

/* ─────────────────────────── timeline ────────────────────────── */

function classifyEvent(text: string): TimelineEventKind {
  const s = text.toLowerCase();
  if (/arriv/.test(s)) return "arrival";
  if (/depart|sail/.test(s)) return "departure";
  if (/manifest/.test(s)) return "manifest";
  if (/inspect/.test(s)) return "inspection";
  if (/revenue|levy|payment|charge/.test(s)) return "revenue";
  if (/detain|detention|hold/.test(s)) return "detention";
  if (/cargo|discharge|load/.test(s)) return "cargo";
  if (/owner|beneficial|director/.test(s)) return "ownership";
  if (/complian|regul/.test(s)) return "compliance";
  if (/sanction|watchlist/.test(s)) return "sanction";
  if (/ais|signal|beacon/.test(s)) return "signal";
  return "other";
}

export function buildTimelineEvents(briefing: AdaptiveBriefingData): TimelineEvent[] {
  const items: TimelineEvent[] = [];
  for (const ev of briefing.evidence ?? []) {
    if (!ev.observedAt) continue;
    items.push({
      id: ev.id,
      whenISO: ev.observedAt,
      when: relative(ev.observedAt),
      title: sanitizeText(ev.title) || "Operational event",
      detail: sanitizeText(ev.summary),
      kind: classifyEvent(`${ev.title} ${ev.summary ?? ""}`),
      source: ev.source,
    });
  }
  items.sort((a, b) => (b.whenISO ?? "").localeCompare(a.whenISO ?? ""));
  return items.slice(0, 12);
}

/* ─────────────────────── risk & compliance ───────────────────── */

const RISK_MATCHERS: Array<{ key: string; label: string; re: RegExp }> = [
  { key: "regulatory", label: "Regulatory violations", re: /violat|infring|breach/i },
  { key: "port_charges", label: "Outstanding port charges", re: /outstanding|arrears|unpaid/i },
  { key: "revenue_leak", label: "Revenue leakage indicators", re: /leakage|underdeclar|shortfall/i },
  { key: "manifest", label: "Manifest inconsistencies", re: /manifest.*(inconsist|discrep|mismatch)/i },
  { key: "ais", label: "AIS anomalies", re: /ais.*(gap|anom|drop|spoof)/i },
  { key: "routing", label: "Suspicious routing", re: /reroute|deviation|suspicious rout/i },
  { key: "flag", label: "Flag state issues", re: /flag.*(concern|issue|blacklist)/i },
  { key: "certificate", label: "Expired certificates", re: /expired|certificate.*(void|lapsed)/i },
  { key: "inspection", label: "Adverse inspection history", re: /detain|deficien|failure/i },
  { key: "sanctions", label: "Sanctions", re: /sanction|watchlist|ofac|un\b/i },
  { key: "customs", label: "Customs investigations", re: /customs.*(investig|probe|case)/i },
];

export function buildRiskChecklist(briefing: AdaptiveBriefingData): RiskCheck[] {
  const corpus = [
    briefing.executive?.text,
    briefing.analytical?.text,
    ...(briefing.evidence?.map((e) => `${e.title} ${e.summary ?? ""}`) ?? []),
    ...(briefing.patterns?.map((p) => p.pattern) ?? []),
    ...(briefing.intelligenceGaps ?? []),
  ]
    .filter(Boolean)
    .join(" \n ");
  return RISK_MATCHERS.map((m) => ({
    key: m.key,
    label: m.label,
    fired: m.re.test(corpus),
    tone: (m.re.test(corpus) ? "critical" : "positive") as StatusTone,
  }));
}

/* ────────────────────────── insights ─────────────────────────── */

export function buildInsights(
  briefing: AdaptiveBriefingData,
  ibe: IbeResult["ibe"] | null | undefined,
): Insight[] {
  const out: Insight[] = [];
  const seen = new Set<string>();
  const push = (id: string, text: string, origin: Insight["origin"]) => {
    const clean = sanitizeText(text);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push({ id, text: clean, origin });
  };
  for (const p of (briefing.patterns as PatternCardData[] | undefined) ?? []) {
    push(p.id, p.pattern, "pattern");
  }
  for (const n of ibe?.nudges ?? []) push(n.id, n.text, "nudge");
  for (const h of ibe?.hypotheses ?? []) push(h.id, h.statement, "observation");
  return out.slice(0, 6);
}

/* ─────────────────────── recommendations ─────────────────────── */

export function buildRecommendations(
  briefing: AdaptiveBriefingData,
  human: HumanResponse | null,
): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const r of human?.recommendedActions ?? []) {
    recs.push({
      id: `rec-${recs.length}`,
      text: sanitizeText(r.action),
      rationale: sanitizeText(r.rationale),
      confidence: r.confidence,
      priority: recs.length === 0 ? "primary" : "secondary",
    });
  }
  for (const a of briefing.officerActions ?? []) {
    if (recs.some((r) => r.text.toLowerCase() === a.label.toLowerCase())) continue;
    recs.push({
      id: a.id,
      text: sanitizeText(a.label),
      rationale: sanitizeText(a.description),
      priority: "secondary",
    });
  }
  return recs.slice(0, 6);
}

/* ─────────────────────── evidence groups ─────────────────────── */

const EVIDENCE_GROUPS: Array<{ key: string; label: string; re: RegExp }> = [
  { key: "manifest", label: "Shipping Manifest", re: /manifest|declaration/i },
  { key: "company", label: "Company Registration", re: /compan|registr|cac|companies house/i },
  { key: "vessel", label: "Vessel Registry", re: /vessel|imo|gisis|registry/i },
  { key: "port", label: "Port Records", re: /port|arrival|departure|berth/i },
  { key: "ais", label: "AIS History", re: /ais|spire|datalastic|marinetraffic/i },
  { key: "customs", label: "Customs Filings", re: /customs|duty|tariff/i },
  { key: "revenue", label: "Revenue Records", re: /revenue|levy|payment/i },
  { key: "inspection", label: "Inspection Reports", re: /inspect|psc|survey|equasis/i },
  { key: "regulatory", label: "Regulatory Documents", re: /regulator|sanction|ofac|un\b|watchlist/i },
];

export function groupEvidenceForDisclosure(briefing: AdaptiveBriefingData): EvidenceGroup[] {
  const items = briefing.evidence ?? [];
  const groups: Record<string, EvidenceCardData[]> = {};
  for (const item of items) {
    const corpus = `${item.source} ${item.title} ${item.summary ?? ""}`;
    const match = EVIDENCE_GROUPS.find((g) => g.re.test(corpus));
    const key = match?.key ?? "related";
    groups[key] ??= [];
    groups[key].push(item);
  }
  const out: EvidenceGroup[] = [];
  for (const g of EVIDENCE_GROUPS) {
    if (groups[g.key]?.length) out.push({ key: g.key, label: g.label, items: groups[g.key] });
  }
  if (groups.related?.length) {
    out.push({ key: "related", label: "Related Intelligence", items: groups.related });
  }
  return out;
}

/* ───────────────────── identity resolution ───────────────────── */

export function buildIdentityResolutionSection<C extends IdentityCandidate>(
  selection: IdentitySelection<C>,
): IdentityResolutionSection | undefined {
  if (!selection.selected || !selection.confidence) return undefined;
  const c = selection.selected;
  const conf = selection.confidence;
  const label =
    (c as unknown as { name?: string | null }).name ??
    (c as unknown as { label?: string | null }).label ??
    c.id;
  const matchingCriteria = conf.signals
    .filter((s) => s.contribution > 0)
    .map((s) => ({
      label: s.label,
      detail: s.detail,
      points: `${s.contribution}/${s.weight}`,
    }));
  const alternates: IdentityResolutionRejection[] = selection.alternates
    .filter((a) => a.candidate.id !== c.id)
    .slice(0, 4)
    .map((a) => ({
      id: a.candidate.id,
      label:
        (a.candidate as unknown as { name?: string | null }).name ?? a.candidate.id,
      score: a.confidence.score,
      reason: `${a.confidence.tier} at ${a.confidence.score}/100 — ${a.confidence.rationale}`,
    }));
  const rejectedCandidates: IdentityResolutionRejection[] = selection.rejected.map(
    (a) => ({
      id: a.candidate.id,
      label:
        (a.candidate as unknown as { name?: string | null }).name ?? a.candidate.id,
      score: a.confidence.score,
      reason:
        a.rejectionReason ??
        `Excluded from auto-selection at ${a.confidence.score}/100.`,
    }),
  );
  return {
    selectedLabel: label ?? c.id,
    selectedId: c.id,
    imo: c.imo ?? null,
    mmsi: c.mmsi ?? null,
    flag: c.flag ?? null,
    callSign: c.callSign ?? null,
    confidenceScore: conf.score,
    tier: conf.tier,
    matchingCriteria,
    rejectedCandidates,
    alternates,
    selectionReason: selection.selectionReason,
    requiresConfirmation: selection.requiresConfirmation,
  };
}

/* ───────────────────────────── entry ─────────────────────────── */

export function synthesizeExecutiveBrief(args: {
  briefing: AdaptiveBriefingData;
  humanResponse: HumanResponse | null;
  ibe: IbeResult["ibe"] | null | undefined;
  followUps: string[];
  identitySelection?: IdentitySelection<IdentityCandidate>;
}): ExecutiveBrief {
  const { briefing, humanResponse, ibe, followUps, identitySelection } = args;
  return {
    executiveSummary: buildExecutiveSummary(briefing, humanResponse),
    confidence: buildConfidencePanel(briefing, ibe),
    kpis: buildKpiCards(briefing, ibe, humanResponse),
    keyFacts: buildKeyFacts(briefing),
    identityResolution: identitySelection
      ? buildIdentityResolutionSection(identitySelection)
      : undefined,
    relationships: buildRelationshipNodes(briefing),
    timeline: buildTimelineEvents(briefing),
    risks: buildRiskChecklist(briefing),
    insights: buildInsights(briefing, ibe),
    recommendations: buildRecommendations(briefing, humanResponse),
    evidenceGroups: groupEvidenceForDisclosure(briefing),
    followUps: followUps.length
      ? followUps
      : (humanResponse?.suggestedNextQuestions ?? briefing.nextQuestions ?? []).slice(0, 4),
  };
}

// Re-export for convenience in the renderer.
export type { EvidenceCardData, EvidenceGrade };
