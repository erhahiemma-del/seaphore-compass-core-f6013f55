/**
 * SPRINT UX-004 — Adaptive Briefing Profile Registry
 *
 * Central catalogue mapping mission types to briefing profiles. Every
 * profile is a plain configuration object. The `detectMissionType`
 * classifier is a lightweight, deterministic string matcher — it does
 * NOT re-run reasoning. All heavy inference already happened upstream
 * in the OIE. This module only decides HOW the briefing is presented.
 */
import type { AdaptiveBriefing } from "../types";
import type {
  BriefingProfile,
  FollowUpCommand,
  InvestigationTask,
  KPI,
  MissionBriefingType,
} from "./types";

/* ─────────────── Shared task catalogue ─────────────── */

const TASK: Record<string, InvestigationTask> = {
  vessel: { key: "vessel", label: "Vessel identity", match: /vessel|imo\s*gisis|equasis|psix/i },
  registry: {
    key: "registry",
    label: "Registry / flag",
    match: /registry|flag|companies house|cac/i,
  },
  sanctions: {
    key: "sanctions",
    label: "Sanctions screening",
    match: /sanction|opensanctions|ofac|un\s*sanc|eu\s*sanc/i,
  },
  ownership: {
    key: "ownership",
    label: "Beneficial ownership",
    match: /owner|beneficial|corporate/i,
  },
  ais: {
    key: "ais",
    label: "AIS history",
    match: /ais|position|track|spire|datalastic|marinetraffic/i,
  },
  manifest: { key: "manifest", label: "Cargo manifest", match: /manifest|cargo|customs|volza/i },
  revenue: {
    key: "revenue",
    label: "Revenue exposure",
    match: /revenue|nimasa|levy|financial|platts/i,
  },
  insurance: { key: "insurance", label: "Insurance / P&I", match: /insurance|p&i|club/i },
  weather: {
    key: "weather",
    label: "Weather / conditions",
    match: /weather|copernicus|marine\s*weather/i,
  },
  port: { key: "port", label: "Port operations", match: /port|berth|congestion|terminal/i },
  psc: {
    key: "psc",
    label: "Port State Control",
    match: /psc|port\s*state|paris\s*mou|tokyo\s*mou/i,
  },
  documents: {
    key: "documents",
    label: "Certificates & docs",
    match: /certificate|document|class|survey/i,
  },
  incidents: {
    key: "incidents",
    label: "Historical incidents",
    match: /incident|casualty|detention|accident/i,
  },
};

/* ─────────────── Helpers ─────────────── */

const CURRENCY_RE =
  /(?:USD|NGN|EUR|GBP|\$|₦|€|£)\s?([\d,]+(?:\.\d+)?)\s?(?:million|m|bn|billion|k)?/gi;

function extractCurrency(briefing: AdaptiveBriefing): string | undefined {
  const bag = [
    briefing.executive?.text,
    briefing.analytical?.text,
    ...(briefing.criticalFindings ?? []).map((f) => f.title),
    ...(briefing.evidence ?? []).map((e) => `${e.title} ${e.summary ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ");
  const m = bag.match(CURRENCY_RE);
  return m?.[0]?.trim();
}

function countMatches(briefing: AdaptiveBriefing, re: RegExp): number {
  const bag = [
    ...(briefing.criticalFindings ?? []).map((f) => f.title),
    ...(briefing.evidence ?? []).map((e) => `${e.title} ${e.summary ?? ""}`),
    ...(briefing.intelligenceGaps ?? []),
  ]
    .join("\n")
    .match(re);
  return bag ? bag.length : 0;
}

function completenessTone(b: AdaptiveBriefing): KPI["tone"] {
  const q = b.evidenceSources?.queried ?? 0;
  const r = b.evidenceSources?.responded ?? 0;
  if (q === 0) return "neutral";
  const ratio = r / q;
  if (ratio >= 0.75) return "positive";
  if (ratio >= 0.4) return "warning";
  return "critical";
}

function tierTone(b: AdaptiveBriefing): KPI["tone"] {
  return b.classification.tier === "high"
    ? "positive"
    : b.classification.tier === "medium"
      ? "warning"
      : "critical";
}

/* ─────────────── Common slot lists ─────────────── */

const COMMON_TAIL: BriefingProfile["sectionOrder"] = [
  "counterHypotheses",
  "officerActions",
  "override",
  "followUpCommands",
  "nextQuestions",
  "sources",
];

/* ─────────────── Profiles ─────────────── */

const SANCTIONS: BriefingProfile = {
  id: "SANCTIONS_SCREENING",
  badge: "Sanctions Screening",
  label: "Sanctions Briefing",
  purpose: "Determine whether the subject is sanctioned and by whom.",
  defaultRecommendation: "Freeze commercial engagement pending sanctions verification.",
  sectionOrder: [
    "header",
    "kpis",
    "criticalFindings",
    "evidence",
    "entities",
    "gaps",
    "analytical",
    "decisionImpact",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [TASK.vessel, TASK.sanctions, TASK.ownership, TASK.registry, TASK.documents],
  confidenceFactors: [
    "Evidence sources completed",
    "Beneficial ownership verified",
    "Sanction list agreement across providers",
  ],
  computeKPIs(b) {
    const kpis: KPI[] = [];
    const hits = countMatches(b, /sanction(ed|s)?|ofac|un\s*sanc|eu\s*sanc|match/gi);
    kpis.push({
      label: "Sanctions Status",
      value: hits > 0 ? `${hits} potential match${hits === 1 ? "" : "es"}` : "No match found",
      tone: hits > 0 ? "critical" : "positive",
    });
    kpis.push({
      label: "Entities Screened",
      value: String((b.entities ?? []).length),
      hint: "Vessel, owners, operators, agents",
      tone: (b.entities ?? []).length > 0 ? "positive" : "warning",
    });
    kpis.push({
      label: "Source Agreement",
      value: `${b.evidenceSources?.corroborated ?? 0} / ${b.evidenceSources?.responded ?? 0}`,
      hint: "Corroborated across providers",
      tone: completenessTone(b),
    });
    return kpis;
  },
  followUpCommands(b) {
    const cmds: FollowUpCommand[] = [
      {
        label: "Explain sanctions match",
        query: `Explain the sanctions match for ${subjectFrom(b)}`,
      },
      { label: "Show sanction evidence", query: `Show sanction evidence for ${subjectFrom(b)}` },
      {
        label: "Generate compliance report",
        query: `Generate compliance report for ${subjectFrom(b)}`,
      },
      {
        label: "Resolve beneficial ownership",
        query: `Resolve beneficial ownership for ${subjectFrom(b)}`,
      },
    ];
    return cmds;
  },
  recommendation(b) {
    if (countMatches(b, /sanction/gi) > 0)
      return "Freeze commercial engagement and escalate to Compliance.";
    if ((b.evidenceSources?.responded ?? 0) === 0)
      return "Continue sanctions collection before clearing the subject.";
    return "Clear for onward operations; retain screening record.";
  },
};

const REVENUE: BriefingProfile = {
  id: "REVENUE_LEAKAGE",
  badge: "Revenue Leakage",
  label: "Revenue Briefing",
  purpose: "Quantify revenue at risk and identify recovery opportunities.",
  defaultRecommendation: "Initiate revenue recovery review with Finance.",
  sectionOrder: [
    "header",
    "kpis",
    "decisionImpact",
    "criticalFindings",
    "analytical",
    "evidence",
    "entities",
    "gaps",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [TASK.revenue, TASK.manifest, TASK.vessel, TASK.port, TASK.ownership],
  confidenceFactors: [
    "Revenue sources aligned",
    "Manifest confidence",
    "Historical validation window",
  ],
  computeKPIs(b) {
    const amount = extractCurrency(b);
    const affectedOps = (b.entities ?? []).filter((e) => e.type === "company").length;
    const revImpact = b.decisionImpact?.revenue ?? 0;
    return [
      {
        label: "Revenue at Risk",
        value: amount ?? "Under quantification",
        tone: amount ? "critical" : "neutral",
        hint: "Extracted from evidence",
      },
      {
        label: "Recovery Potential",
        value: revImpact > 0 ? `${Math.round(revImpact * 100)}%` : "TBD",
        tone: revImpact >= 0.5 ? "positive" : "warning",
      },
      {
        label: "Affected Operators",
        value: String(affectedOps),
        tone: affectedOps > 0 ? "warning" : "neutral",
      },
    ];
  },
  followUpCommands(b) {
    return [
      { label: "Recover revenue", query: `Draft revenue recovery plan for ${subjectFrom(b)}` },
      {
        label: "Compare previous month",
        query: `Compare revenue against previous month for ${subjectFrom(b)}`,
      },
      { label: "Show affected operators", query: `Show affected operators for ${subjectFrom(b)}` },
      {
        label: "Priority ports",
        query: `Identify priority ports contributing to leakage for ${subjectFrom(b)}`,
      },
    ];
  },
};

const AIS: BriefingProfile = {
  id: "AIS_INVESTIGATION",
  badge: "AIS Intelligence",
  label: "AIS Briefing",
  purpose: "Reconstruct voyage, detect dark periods, and expose deviations.",
  defaultRecommendation: "Investigate detected AIS anomalies before clearance.",
  sectionOrder: [
    "header",
    "kpis",
    "patterns", // Timeline / movement first
    "criticalFindings",
    "evidence",
    "entities",
    "analytical",
    "gaps",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [TASK.ais, TASK.vessel, TASK.port, TASK.weather],
  confidenceFactors: ["AIS coverage window", "Satellite overlap", "Timeline completeness"],
  computeKPIs(b) {
    const darkPeriods = countMatches(b, /dark\s*period|ais\s*gap|silent/gi);
    const deviations = countMatches(b, /deviation|off\s*route|off-route/gi);
    const portCalls = countMatches(b, /port\s*call|berth(ed)?|arrival|departure/gi);
    return [
      {
        label: "Dark Periods",
        value: String(darkPeriods),
        tone: darkPeriods > 0 ? "critical" : "positive",
      },
      {
        label: "Route Deviations",
        value: String(deviations),
        tone: deviations > 0 ? "warning" : "positive",
      },
      {
        label: "Port Calls Observed",
        value: String(portCalls),
        tone: "neutral",
      },
    ];
  },
  followUpCommands(b) {
    return [
      { label: "Replay voyage", query: `Replay voyage timeline for ${subjectFrom(b)}` },
      {
        label: "Investigate dark period",
        query: `Investigate AIS dark period for ${subjectFrom(b)}`,
      },
      {
        label: "Compare route",
        query: `Compare route against declared voyage for ${subjectFrom(b)}`,
      },
      {
        label: "Show speed analysis",
        query: `Show speed and heading analysis for ${subjectFrom(b)}`,
      },
    ];
  },
};

const OWNERSHIP: BriefingProfile = {
  id: "OWNERSHIP_INVESTIGATION",
  badge: "Ownership Intelligence",
  label: "Ownership Briefing",
  purpose: "Reveal registered and beneficial ownership across jurisdictions.",
  defaultRecommendation: "Verify beneficial ownership before onboarding.",
  sectionOrder: [
    "header",
    "kpis",
    "entities", // Corporate structure first
    "criticalFindings",
    "evidence",
    "analytical",
    "gaps",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [TASK.ownership, TASK.registry, TASK.sanctions, TASK.vessel, TASK.documents],
  confidenceFactors: [
    "Corporate registry coverage",
    "Beneficial owner disclosure",
    "Sanctions cross-reference",
  ],
  computeKPIs(b) {
    const companies = (b.entities ?? []).filter((e) => e.type === "company");
    const jurisdictions = new Set(
      (b.entities ?? []).map((e) => e.flag).filter((f): f is string => Boolean(f)),
    );
    const sanctionsExposure = countMatches(b, /sanction(ed|s)?/gi);
    return [
      {
        label: "Companies Identified",
        value: String(companies.length),
        tone: companies.length > 0 ? "positive" : "warning",
      },
      {
        label: "Jurisdictions",
        value: String(jurisdictions.size),
        tone: jurisdictions.size > 2 ? "warning" : "neutral",
      },
      {
        label: "Sanctions Exposure",
        value:
          sanctionsExposure > 0
            ? `${sanctionsExposure} link${sanctionsExposure === 1 ? "" : "s"}`
            : "None detected",
        tone: sanctionsExposure > 0 ? "critical" : "positive",
      },
    ];
  },
  followUpCommands(b) {
    return [
      { label: "Map corporate structure", query: `Map corporate structure for ${subjectFrom(b)}` },
      {
        label: "Trace holding companies",
        query: `Trace holding companies behind ${subjectFrom(b)}`,
      },
      { label: "Screen all owners", query: `Screen all beneficial owners of ${subjectFrom(b)}` },
      {
        label: "Compare jurisdictions",
        query: `Compare ownership across jurisdictions for ${subjectFrom(b)}`,
      },
    ];
  },
};

const PORT: BriefingProfile = {
  id: "PORT_CONGESTION",
  badge: "Port Operations",
  label: "Port Operations Briefing",
  purpose: "Assess port congestion and expected operational delay.",
  defaultRecommendation: "Adjust ETA and berth allocation to current congestion.",
  sectionOrder: [
    "header",
    "kpis",
    "analytical",
    "criticalFindings",
    "evidence",
    "entities",
    "gaps",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [TASK.port, TASK.ais, TASK.weather, TASK.manifest],
  confidenceFactors: ["AIS density coverage", "Berth availability reports", "Weather stability"],
  computeKPIs(b) {
    const delayMatch = b.executive?.text?.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?)/i);
    return [
      {
        label: "Expected Delay",
        value: delayMatch?.[0] ?? "Under assessment",
        tone: delayMatch ? "warning" : "neutral",
      },
      {
        label: "Berth Availability",
        value: countMatches(b, /berth\s*(free|available|open)/gi) > 0 ? "Partial" : "Congested",
        tone: "warning",
      },
      {
        label: "Traffic Density",
        value: countMatches(b, /density|congestion|queue|waiting/gi) > 0 ? "Elevated" : "Normal",
        tone: "warning",
      },
    ];
  },
  followUpCommands(b) {
    return [
      { label: "Show waiting fleet", query: `List vessels waiting at ${subjectFrom(b)}` },
      {
        label: "Reroute options",
        query: `Suggest reroute options given congestion at ${subjectFrom(b)}`,
      },
      { label: "Berth forecast", query: `Forecast berth availability for ${subjectFrom(b)}` },
      {
        label: "Weather impact",
        query: `Assess weather impact on operations at ${subjectFrom(b)}`,
      },
    ];
  },
};

const VESSEL_RISK: BriefingProfile = {
  id: "VESSEL_RISK",
  badge: "Vessel Risk",
  label: "Vessel Risk Briefing",
  purpose: "Aggregate risk drivers into a single decision.",
  defaultRecommendation: "Initiate risk mitigation before onward operations.",
  sectionOrder: [
    "header",
    "kpis",
    "criticalFindings",
    "patterns",
    "evidence",
    "entities",
    "analytical",
    "gaps",
    "decisionImpact",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [
    TASK.vessel,
    TASK.incidents,
    TASK.psc,
    TASK.ais,
    TASK.manifest,
    TASK.insurance,
    TASK.sanctions,
  ],
  confidenceFactors: [
    "Historical incident coverage",
    "AIS behaviour signal quality",
    "Compliance record completeness",
  ],
  computeKPIs(b) {
    const incidents = countMatches(b, /incident|casualty|detention|accident/gi);
    const compliance = countMatches(b, /compliance|violation|non-?compliance|breach/gi);
    return [
      {
        label: "Current Risk Level",
        value: b.classification.tier.toUpperCase(),
        tone: tierTone(b),
      },
      {
        label: "Historical Incidents",
        value: String(incidents),
        tone: incidents > 0 ? "warning" : "positive",
      },
      {
        label: "Compliance Issues",
        value: String(compliance),
        tone: compliance > 0 ? "critical" : "positive",
      },
    ];
  },
  followUpCommands(b) {
    return [
      {
        label: "Explain risk drivers",
        query: `Explain the top risk drivers for ${subjectFrom(b)}`,
      },
      { label: "Show incident history", query: `Show historical incidents for ${subjectFrom(b)}` },
      {
        label: "Compare peer vessels",
        query: `Compare risk against peer vessels of ${subjectFrom(b)}`,
      },
      { label: "Cargo risk", query: `Assess cargo risk for ${subjectFrom(b)}` },
    ];
  },
};

const COMPLIANCE: BriefingProfile = {
  id: "COMPLIANCE_REVIEW",
  badge: "Compliance Review",
  label: "Compliance Briefing",
  purpose: "Consolidate regulatory posture across all applicable regimes.",
  defaultRecommendation: "Address outstanding regulatory findings before clearance.",
  sectionOrder: [
    "header",
    "kpis",
    "criticalFindings",
    "evidence",
    "entities",
    "analytical",
    "gaps",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [TASK.sanctions, TASK.psc, TASK.documents, TASK.registry, TASK.ownership],
  confidenceFactors: ["Regulator source coverage", "Document freshness", "Cross-regime agreement"],
  computeKPIs(b) {
    const findings = (b.criticalFindings ?? []).length;
    const missingDocs = countMatches(b, /missing|expired|invalid|absent/gi);
    return [
      {
        label: "Regulatory Findings",
        value: String(findings),
        tone: findings > 0 ? "warning" : "positive",
      },
      {
        label: "Missing Documents",
        value: String(missingDocs),
        tone: missingDocs > 0 ? "critical" : "positive",
      },
      {
        label: "Compliance Score",
        value: `${Math.round((b.classification.compositeConfidence ?? 0) * 100)}%`,
        tone: tierTone(b),
      },
    ];
  },
  followUpCommands(b) {
    return [
      {
        label: "List required actions",
        query: `List required compliance actions for ${subjectFrom(b)}`,
      },
      { label: "Show PSC history", query: `Show Port State Control history for ${subjectFrom(b)}` },
      { label: "Verify certificates", query: `Verify certificate validity for ${subjectFrom(b)}` },
      { label: "Sanctions status", query: `Show sanctions status for ${subjectFrom(b)}` },
    ];
  },
};

const ENVIRONMENT: BriefingProfile = {
  id: "ENVIRONMENTAL_RISK",
  badge: "Environmental",
  label: "Environmental Briefing",
  purpose: "Surface weather, sea state, and protected-water exposure.",
  defaultRecommendation: "Adjust routing / operations to environmental exposure.",
  sectionOrder: [
    "header",
    "kpis",
    "analytical",
    "criticalFindings",
    "evidence",
    "entities",
    "gaps",
    ...COMMON_TAIL,
  ],
  investigationTasks: [TASK.weather, TASK.ais, TASK.port],
  confidenceFactors: [
    "Weather source freshness",
    "Sea-state model coverage",
    "Protected-area registry currency",
  ],
  computeKPIs(b) {
    const alerts = countMatches(b, /alert|advisory|warning/gi);
    const protectedHits = countMatches(b, /protected|marpol|mpa|sanctuary/gi);
    const pollution = countMatches(b, /pollution|spill|discharge/gi);
    return [
      {
        label: "Environmental Alerts",
        value: String(alerts),
        tone: alerts > 0 ? "warning" : "positive",
      },
      {
        label: "Protected Waters",
        value: protectedHits > 0 ? "Nearby" : "Clear",
        tone: protectedHits > 0 ? "warning" : "positive",
      },
      {
        label: "Pollution Risk",
        value: pollution > 0 ? "Flagged" : "None reported",
        tone: pollution > 0 ? "critical" : "positive",
      },
    ];
  },
  followUpCommands(b) {
    return [
      { label: "Show weather window", query: `Show weather window for ${subjectFrom(b)}` },
      {
        label: "Protected-area proximity",
        query: `Show protected-area proximity for ${subjectFrom(b)}`,
      },
      { label: "Sea-state forecast", query: `Show sea-state forecast for ${subjectFrom(b)}` },
    ];
  },
};

const GENERIC: BriefingProfile = {
  id: "GENERIC",
  badge: "Intelligence Briefing",
  label: "Intelligence Briefing",
  purpose: "General maritime intelligence assessment.",
  defaultRecommendation: "Continue evidence collection and reassess.",
  sectionOrder: [
    "header",
    "gaps",
    "criticalFindings",
    "evidence",
    "entities",
    "patterns",
    "analytical",
    "decisionImpact",
    "decisionRequired",
    ...COMMON_TAIL,
  ],
  investigationTasks: [
    TASK.vessel,
    TASK.registry,
    TASK.sanctions,
    TASK.ownership,
    TASK.ais,
    TASK.manifest,
    TASK.revenue,
    TASK.insurance,
    TASK.weather,
  ],
  confidenceFactors: [],
  computeKPIs() {
    return [];
  },
  followUpCommands() {
    return [];
  },
};

/* ─────────────── Registry & detection ─────────────── */

export const BRIEFING_PROFILES: Record<MissionBriefingType, BriefingProfile> = {
  SANCTIONS_SCREENING: SANCTIONS,
  REVENUE_LEAKAGE: REVENUE,
  AIS_INVESTIGATION: AIS,
  OWNERSHIP_INVESTIGATION: OWNERSHIP,
  PORT_CONGESTION: PORT,
  VESSEL_RISK: VESSEL_RISK,
  COMPLIANCE_REVIEW: COMPLIANCE,
  ENVIRONMENTAL_RISK: ENVIRONMENT,
  GENERIC,
};

export function getProfile(type: MissionBriefingType | string | undefined): BriefingProfile {
  if (!type) return GENERIC;
  return BRIEFING_PROFILES[type as MissionBriefingType] ?? GENERIC;
}

/**
 * Lightweight, deterministic mission classifier. Inspects the briefing's
 * query, typeBadge and evidence to pick the correct profile. Never
 * fabricates data; on ambiguity returns GENERIC so the renderer falls
 * back to the neutral layout.
 */
export function detectMissionType(briefing: AdaptiveBriefing): MissionBriefingType {
  // 1. Explicit missionType wins (set by dispatcher / mission builder).
  const explicit = (briefing as unknown as { missionType?: string }).missionType;
  if (explicit && explicit in BRIEFING_PROFILES) return explicit as MissionBriefingType;

  const bag = [
    briefing.query ?? "",
    briefing.classification?.typeBadge ?? "",
    briefing.executive?.text ?? "",
    ...(briefing.criticalFindings ?? []).map((f) => f.title),
    ...(briefing.intelligenceGaps ?? []),
  ]
    .join(" \n ")
    .toLowerCase();

  const rules: Array<[MissionBriefingType, RegExp]> = [
    ["SANCTIONS_SCREENING", /\bsanction|ofac|un\s*sanc|eu\s*sanc\b|screening/],
    ["REVENUE_LEAKAGE", /revenue|leak|levy|underpay|financial\s+exposure|recover/],
    [
      "OWNERSHIP_INVESTIGATION",
      /beneficial\s+owner|corporate\s+structure|shell\s+company|holding\s+compan|ownership/,
    ],
    [
      "PORT_CONGESTION",
      /port\s+congestion|berth|waiting\s+time|expected\s+delay|terminal\s+traffic/,
    ],
    ["COMPLIANCE_REVIEW", /compliance|regulator|port\s+state|psc|certificate/],
    ["ENVIRONMENTAL_RISK", /weather|sea\s*state|pollution|protected\s+water|marpol/],
    [
      "AIS_INVESTIGATION",
      /\bais\b|dark\s*period|voyage|route\s*deviation|track|position\s+history/,
    ],
    ["VESSEL_RISK", /risk|incident|casualty|detention|hazard/],
  ];

  for (const [type, re] of rules) {
    if (re.test(bag)) return type;
  }
  return "GENERIC";
}

function subjectFrom(b: AdaptiveBriefing): string {
  const vessel = (b.entities ?? []).find((e) => e.type === "vessel");
  if (vessel) return vessel.name;
  const m = b.query?.match(/(MV|MT|SS)\s+[A-Z][\w\s-]*/i);
  return m?.[0]?.trim() ?? "the subject";
}
