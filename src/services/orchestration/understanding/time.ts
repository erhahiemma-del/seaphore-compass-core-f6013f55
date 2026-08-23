/**
 * Orchestration — time-window resolution.
 *
 * Reads the period out of the question, or falls back to a per-intent
 * default. The fallback is always flagged `inferred: true`, because an
 * officer reading "3 AIS interruptions" needs to know whether that is
 * across an hour or across a year, and a window they did not choose is a
 * window they should be told about.
 */
import type { OfficerIntent, TimeWindow } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface Rule {
  readonly rx: RegExp;
  /** Duration, or a function of the captured quantity. */
  readonly span: number | ((n: number) => number);
  readonly label: string | ((n: number) => string);
}

const RULES: readonly Rule[] = [
  {
    rx: /\blast\s+(\d+)\s*min(?:ute)?s?\b/i,
    span: (n) => n * MINUTE,
    label: (n) => `last ${n} minutes`,
  },
  {
    rx: /\blast\s+(\d+)\s*(?:h|hours?|hrs?)\b/i,
    span: (n) => n * HOUR,
    label: (n) => `last ${n} hours`,
  },
  { rx: /\blast\s+(\d+)\s*days?\b/i, span: (n) => n * DAY, label: (n) => `last ${n} days` },
  { rx: /\blast\s+(\d+)\s*weeks?\b/i, span: (n) => n * 7 * DAY, label: (n) => `last ${n} weeks` },
  {
    rx: /\blast\s+(\d+)\s*months?\b/i,
    span: (n) => n * 30 * DAY,
    label: (n) => `last ${n} months`,
  },

  // Calendar words outrank "live"/"now": in "what vessels are live
  // today?" the officer named a period, and a named period beats an
  // implied one.
  { rx: /\btoday\b/i, span: DAY, label: "today" },
  { rx: /\byesterday\b/i, span: 2 * DAY, label: "last 2 days" },
  { rx: /\bthis week\b/i, span: 7 * DAY, label: "this week" },
  { rx: /\blast week\b/i, span: 14 * DAY, label: "last 2 weeks" },
  { rx: /\bthis month\b/i, span: 30 * DAY, label: "this month" },
  { rx: /\blast month\b/i, span: 60 * DAY, label: "last 2 months" },
  { rx: /\bthis (?:quarter|qtr)\b/i, span: 90 * DAY, label: "this quarter" },
  { rx: /\bthis year\b/i, span: 365 * DAY, label: "this year" },
  {
    rx: /\ball time|ever|histor(?:y|ical)\b/i,
    span: 5 * 365 * DAY,
    label: "all available history",
  },

  // Last, so any named period above wins over an implied "right now".
  {
    rx: /\b(?:right )?now|live|currently|at this moment\b/i,
    span: 15 * MINUTE,
    label: "last 15 minutes",
  },
];

/**
 * Default windows.
 *
 * These are not arbitrary. A fleet question is about now, so it gets
 * minutes. An investigation has to reach back far enough to see repeated
 * behaviour, so it gets 90 days. Revenue and compliance follow reporting
 * periods rather than operational ones.
 */
const DEFAULTS: Readonly<Record<OfficerIntent, { span: number; label: string }>> = {
  "fleet-intelligence": { span: 15 * MINUTE, label: "last 15 minutes" },
  "vessel-investigation": { span: 90 * DAY, label: "last 90 days" },
  "manifest-intelligence": { span: 30 * DAY, label: "last 30 days" },
  "cargo-intelligence": { span: 30 * DAY, label: "last 30 days" },
  "container-intelligence": { span: 90 * DAY, label: "last 90 days" },
  "ownership-intelligence": { span: 365 * DAY, label: "last 12 months" },
  "company-intelligence": { span: 365 * DAY, label: "last 12 months" },
  "compliance-intelligence": { span: 365 * DAY, label: "last 12 months" },
  "revenue-intelligence": { span: 90 * DAY, label: "last quarter" },
  "port-intelligence": { span: 7 * DAY, label: "last 7 days" },
  "voyage-intelligence": { span: 90 * DAY, label: "last 90 days" },
  "risk-assessment": { span: 90 * DAY, label: "last 90 days" },
  "operational-recommendation": { span: 24 * HOUR, label: "last 24 hours" },
  "strategic-summary": { span: 30 * DAY, label: "last 30 days" },
  "executive-brief": { span: 24 * HOUR, label: "last 24 hours" },
  "pattern-detection": { span: 180 * DAY, label: "last 6 months" },
  "trend-analysis": { span: 365 * DAY, label: "last 12 months" },
  "historical-replay": { span: 30 * DAY, label: "last 30 days" },
  comparison: { span: 90 * DAY, label: "last 90 days" },
  "natural-language-search": { span: 30 * DAY, label: "last 30 days" },
  "officer-notes": { span: 7 * DAY, label: "last 7 days" },
  "mission-planning": { span: 24 * HOUR, label: "last 24 hours" },
  unknown: { span: 30 * DAY, label: "last 30 days" },
};

/**
 * Resolve the period a question covers.
 *
 * `now` is injected so plans are deterministic in tests and identical
 * across a request that spans a clock tick.
 */
export function resolveTimeWindow(raw: string, intent: OfficerIntent, now: number): TimeWindow {
  for (const rule of RULES) {
    const match = raw.match(rule.rx);
    if (!match) continue;
    const quantity = Number(match[1]);
    const span = typeof rule.span === "function" ? rule.span(quantity) : rule.span;
    const label = typeof rule.label === "function" ? rule.label(quantity) : rule.label;
    if (!Number.isFinite(span) || span <= 0) continue;
    return { fromMs: now - span, toMs: now, label, inferred: false };
  }

  const fallback = DEFAULTS[intent];
  return {
    fromMs: now - fallback.span,
    toMs: now,
    label: fallback.label,
    inferred: true,
  };
}
