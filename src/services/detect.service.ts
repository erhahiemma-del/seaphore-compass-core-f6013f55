/**
 * Detect Intelligence Feed service.
 *
 * The Detect page reads *only* through this service, which reads only through
 * signalRepository. No UI component imports mock data. Aggregates (ribbon,
 * timeline, domain distribution, heatmap, type tiles, AI summary) are computed
 * from real DB rows.
 */
import { signalRepository, type Signal, type SignalDomain, type SignalType } from "@/services/repositories/signal.repository";
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import type { RiskLevel } from "@/components/intelligence/RiskPill";
import type { TimelineRange } from "@/components/signal-timeline-chart";

export type { Signal, SignalDomain, SignalType };
export type { TimelineRange };

export const SIGNAL_DOMAINS: SignalDomain[] = [
  "Manifest",
  "Cargo",
  "Revenue",
  "Vessel Movement",
  "Port Operations",
  "Ownership",
  "Compliance",
  "Alerts",
];

export interface RibbonMetric { value: number; delta: number }
export interface SignalRibbon {
  total: RibbonMetric;
  high: RibbonMetric;
  medium: RibbonMetric;
  low: RibbonMetric;
  fresh: RibbonMetric;
  ack: RibbonMetric;
  confidence: ConfidenceTier;
}

export interface TimelineBucket {
  label: string;
  High: number;
  Medium: number;
  Low: number;
  Info: number;
}

export interface DomainSlice { domain: SignalDomain; count: number }
export interface HeatmapRow {
  domain: SignalDomain;
  High: number;
  Medium: number;
  Low: number;
}
export interface TypeTile { type: SignalType; count: number; confidence: ConfidenceTier }
export interface CopilotCard { title: string; observation: string; confidence: ConfidenceTier }

export interface DetectFeed {
  signals: Signal[];
  countsByDomain: Record<SignalDomain | "All", number>;
  ribbon: SignalRibbon;
  timeline: TimelineBucket[];
  domainSlice: DomainSlice[];
  heatmap: HeatmapRow[];
  typeTiles: TypeTile[];
  aiSummary: CopilotCard[];
}

function bucketise(signals: Signal[], range: TimelineRange): TimelineBucket[] {
  const now = Date.now();
  const cfg =
    range === "6H"
      ? { buckets: 6, stepMs: 60 * 60_000, fmt: (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:00` }
      : range === "24H"
      ? { buckets: 12, stepMs: 2 * 60 * 60_000, fmt: (d: Date) => String(d.getUTCHours()).padStart(2, "0") }
      : { buckets: 7, stepMs: 24 * 60 * 60_000, fmt: (d: Date) => d.toLocaleDateString("en-GB", { month: "short", day: "2-digit" }) };
  const start = now - cfg.buckets * cfg.stepMs;
  const out: TimelineBucket[] = Array.from({ length: cfg.buckets }, (_, i) => ({
    label: cfg.fmt(new Date(start + i * cfg.stepMs + cfg.stepMs)),
    High: 0, Medium: 0, Low: 0, Info: 0,
  }));
  for (const s of signals) {
    const t = new Date(s.detectedAt).getTime();
    if (t < start || t > now) continue;
    const idx = Math.min(cfg.buckets - 1, Math.max(0, Math.floor((t - start) / cfg.stepMs)));
    const bucket = out[idx];
    if (s.risk === "HIGH") bucket.High += 1;
    else if (s.risk === "MEDIUM") bucket.Medium += 1;
    else bucket.Low += 1;
    if (s.status === "NEW") bucket.Info += 1;
  }
  return out;
}

function computeCountsByDomain(signals: Signal[]): Record<SignalDomain | "All", number> {
  const out: Record<string, number> = { All: signals.length };
  for (const d of SIGNAL_DOMAINS) out[d] = 0;
  for (const s of signals) out[s.domain] = (out[s.domain] ?? 0) + 1;
  return out as Record<SignalDomain | "All", number>;
}

function computeRibbon(signals: Signal[]): SignalRibbon {
  const risk = (r: RiskLevel) => signals.filter((s) => s.risk === r).length;
  const status = (v: "NEW" | "ACK") => signals.filter((s) => s.status === v).length;
  return {
    total:  { value: signals.length,  delta: 0 },
    high:   { value: risk("HIGH"),    delta: 0 },
    medium: { value: risk("MEDIUM"),  delta: 0 },
    low:    { value: risk("LOW"),     delta: 0 },
    fresh:  { value: status("NEW"),   delta: 0 },
    ack:    { value: status("ACK"),   delta: 0 },
    confidence: "observed",
  };
}

function computeDomainSlice(signals: Signal[]): DomainSlice[] {
  return SIGNAL_DOMAINS.map((d) => ({ domain: d, count: signals.filter((s) => s.domain === d).length }));
}

function computeHeatmap(signals: Signal[]): HeatmapRow[] {
  return SIGNAL_DOMAINS.map((d) => {
    const rows = signals.filter((s) => s.domain === d);
    return {
      domain: d,
      High: rows.filter((s) => s.risk === "HIGH").length,
      Medium: rows.filter((s) => s.risk === "MEDIUM").length,
      Low: rows.filter((s) => s.risk === "LOW").length,
    };
  });
}

const ALL_TYPES: SignalType[] = ["Anomalies", "Discrepancies", "Duplicates", "Changes", "Gaps", "Matches"];

function computeTypeTiles(signals: Signal[]): TypeTile[] {
  return ALL_TYPES.map((t) => {
    const rows = signals.filter((s) => s.type === t);
    // Confidence for the tile = strongest observed within the type; default observed.
    const rank: Record<ConfidenceTier, number> = { unconfirmed: 0, inferred: 1, observed: 2, verified: 3 };
    const conf = rows.reduce<ConfidenceTier>((acc, r) => (rank[r.confidence] > rank[acc] ? r.confidence : acc), "observed");
    return { type: t, count: rows.length, confidence: conf };
  });
}

/**
 * Deterministic AI-style summary derived from real signals.
 * Language is observed-first, per HR-3 / COP-1..7.
 */
function computeAiSummary(signals: Signal[]): CopilotCard[] {
  const cards: CopilotCard[] = [];
  const byDomain = new Map<SignalDomain, Signal[]>();
  for (const s of signals) {
    const arr = byDomain.get(s.domain) ?? [];
    arr.push(s);
    byDomain.set(s.domain, arr);
  }
  const highestFirst = [...byDomain.entries()].sort((a, b) => {
    const ah = a[1].filter((s) => s.risk === "HIGH").length;
    const bh = b[1].filter((s) => s.risk === "HIGH").length;
    return bh - ah || b[1].length - a[1].length;
  });
  for (const [domain, rows] of highestFirst.slice(0, 4)) {
    const high = rows.filter((s) => s.risk === "HIGH").length;
    const conf: ConfidenceTier = rows.some((r) => r.confidence === "verified")
      ? "verified"
      : rows.some((r) => r.confidence === "observed")
      ? "observed"
      : "inferred";
    cards.push({
      title: `${domain} activity observed in feed`,
      observation:
        high > 0
          ? `${rows.length} signal${rows.length === 1 ? "" : "s"} observed in ${domain}, including ${high} at HIGH severity.`
          : `${rows.length} signal${rows.length === 1 ? "" : "s"} observed in ${domain} within the current window.`,
      confidence: conf,
    });
  }
  return cards;
}

/** Primary entrypoint — Detect page consumes only this. */
export async function getDetectFeed(input: { range: TimelineRange; domain?: SignalDomain | "All" } = { range: "24H" }): Promise<DetectFeed> {
  const signals = await signalRepository.listSignals({
    domain: input.domain,
    limit: 200,
  });
  return {
    signals,
    countsByDomain: computeCountsByDomain(signals),
    ribbon: computeRibbon(signals),
    timeline: bucketise(signals, input.range),
    domainSlice: computeDomainSlice(signals),
    heatmap: computeHeatmap(signals),
    typeTiles: computeTypeTiles(signals),
    aiSummary: computeAiSummary(signals),
  };
}
