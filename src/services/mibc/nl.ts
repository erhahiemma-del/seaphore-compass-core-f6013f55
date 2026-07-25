/**
 * MIBC natural-language request parser.
 *
 * Deterministic keyword parser — deliberately not an LLM. NL commands like
 * "Generate yesterday's revenue report" resolve to a { reportType, period }
 * request the engine can execute against Investigation Workspaces.
 */
import type { ReportType, ReportPeriod } from "./types";

export interface ParsedReportRequest {
  reportType: ReportType;
  period: ReportPeriod;
  focus?: string; // free-text focus for title / filtering hints
  confidence: number; // 0..1 – parser confidence
}

const TYPE_KEYWORDS: Array<[ReportType, string[]]> = [
  ["EXECUTIVE_BRIEF", ["executive", "exec brief", "director brief"]],
  ["OPERATIONAL_BRIEF", ["operational", "ops brief"]],
  ["INVESTIGATION_REPORT", ["investigation", "case report"]],
  ["REVENUE_INTELLIGENCE", ["revenue"]],
  ["CARGO_INTELLIGENCE", ["cargo"]],
  ["CONTAINER_INTELLIGENCE", ["container"]],
  ["MANIFEST_INTELLIGENCE", ["manifest"]],
  ["COMPLIANCE_REPORT", ["compliance"]],
  ["PORT_INTELLIGENCE", ["port", "lagos", "tin can", "onne", "apapa"]],
  ["HISTORICAL_COMPARISON", ["compare", "versus", " vs ", "comparison"]],
  ["TREND_ANALYSIS", ["trend", "trend analysis"]],
];

const PERIOD_KEYWORDS: Array<[ReportPeriod, string[]]> = [
  ["YESTERDAY", ["yesterday"]],
  ["LAST_7D", ["7 day", "seven day", "week", "last week", "past week"]],
  ["LAST_30D", ["30 day", "thirty day", "month", "last month", "past month"]],
  ["QUARTER", ["quarter", "quarterly", "q1", "q2", "q3", "q4"]],
  ["YEAR", ["year", "annual", "ytd"]],
];

export function parseReportRequest(text: string): ParsedReportRequest {
  const q = text.toLowerCase();
  let reportType: ReportType = "EXECUTIVE_BRIEF";
  let matched = 0;
  for (const [type, kws] of TYPE_KEYWORDS) {
    if (kws.some((k) => q.includes(k))) {
      reportType = type;
      matched++;
      break;
    }
  }
  let period: ReportPeriod = "ON_DEMAND";
  for (const [p, kws] of PERIOD_KEYWORDS) {
    if (kws.some((k) => q.includes(k))) {
      period = p;
      matched++;
      break;
    }
  }
  return {
    reportType,
    period,
    focus: text.trim(),
    confidence: Math.min(1, matched / 2),
  };
}
