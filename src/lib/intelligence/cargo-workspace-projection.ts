/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT CAP-02 — Cargo Intelligence Workspace (pure projection model)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Six operational intelligence centres projected from the Canonical UIP
 *  and the DIAG-02 coverage report. This module owns NO intelligence:
 *  it never acquires, fuses, scores or persists anything, and it holds
 *  no mock data. Revenue findings come from
 *  `capability.revenue-leakage-detection`; every other number is counted
 *  directly off `uip.rawEvidence`.
 *
 *  Golden Rule: with no Canonical UIP, no provider, or no evidence, the
 *  centre reports its honest operational state — never a fabricated
 *  number and never a bare "0".
 * ─────────────────────────────────────────────────────────────────────
 */
import type { EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import type { LeakageFinding } from "@/services/revenue-leakage";
import type { KpiCoverage, KpiDomainKey, KpiStateCode } from "./coverage-model";
import { KPI_STATE_META } from "./coverage-model";
import { gradeToTier, type PanelConfidence } from "./dashboard-projection";

/* ───────────────────────────── vocabulary ───────────────────────────── */

export type CargoCentreId = "manifest" | "container" | "cargo" | "trade" | "revenue" | "cargo-risk";

/**
 * Officer-facing state vocabulary for the Cargo workspace. Same machine
 * states as DIAG-02 — only the wording is centre-specific.
 */
export const CARGO_STATE_LABEL: Record<KpiStateCode, string> = {
  ACTIVE: "Active",
  AWAITING_CREDENTIALS: "Awaiting Credentials",
  PROVIDER_OFFLINE: "Provider Offline",
  RATE_LIMITED: "Rate Limited",
  NO_EVIDENCE: "No Evidence",
  PROJECTION_MISSING: "Projection Missing",
  DASHBOARD_MAPPING_ERROR: "Projection Missing",
  NO_PROVIDER: "Awaiting Provider",
};

export function cargoStateTone(state: KpiStateCode): "good" | "warn" | "bad" | "neutral" | "info" {
  return KPI_STATE_META[state].tone;
}

export interface CargoCentreDefinition {
  readonly id: CargoCentreId;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string;
  /** DIAG-02 coverage domain this centre inherits its provider state from. */
  readonly coverageKey: KpiDomainKey;
  readonly capabilityId: string;
  readonly projectionContractId: string;
  /** Where the officer inspects the capability that produces the numbers. */
  readonly capabilityHref: string;
  /** Canonical evidence kinds this centre projects. */
  readonly evidenceKinds: ReadonlyArray<NormalizedEvidence["kind"]>;
}

export const CARGO_CENTRES: ReadonlyArray<CargoCentreDefinition> = [
  {
    id: "manifest",
    slug: "manifest",
    title: "Manifest Intelligence",
    subtitle: "Declared manifests, bills of lading and voyage records",
    coverageKey: "manifest",
    capabilityId: "capability.cargo",
    projectionContractId: "cargo.workspace.manifest",
    capabilityHref: "/manifest",
    evidenceKinds: ["cargo", "voyage", "port-call"],
  },
  {
    id: "container",
    slug: "container",
    title: "Container Intelligence",
    subtitle: "Container movements, gate events and port-call attribution",
    coverageKey: "container",
    capabilityId: "capability.cargo",
    projectionContractId: "cargo.workspace.container",
    capabilityHref: "/admin/provider-health",
    evidenceKinds: ["cargo", "port-call"],
  },
  {
    id: "cargo",
    slug: "cargo",
    title: "Cargo Intelligence",
    subtitle: "Commodities, HS codes and cargo items inside every voyage",
    coverageKey: "manifest",
    capabilityId: "capability.cargo",
    projectionContractId: "cargo.workspace.cargo",
    capabilityHref: "/cargo",
    evidenceKinds: ["cargo"],
  },
  {
    id: "trade",
    slug: "trade",
    title: "Trade Intelligence",
    subtitle: "Shippers, consignees and trade-lane structure",
    coverageKey: "container",
    capabilityId: "capability.cargo",
    projectionContractId: "cargo.workspace.trade",
    capabilityHref: "/ownership",
    evidenceKinds: ["cargo", "ownership", "voyage"],
  },
  {
    id: "revenue",
    slug: "revenue",
    title: "Revenue Intelligence",
    subtitle: "Duty exposure and leakage detected on cargo evidence",
    coverageKey: "revenue",
    capabilityId: "capability.revenue-leakage-detection",
    projectionContractId: "cargo.workspace.revenue",
    capabilityHref: "/revenue-leakage",
    evidenceKinds: ["cargo", "voyage"],
  },
  {
    id: "cargo-risk",
    slug: "cargo-risk",
    title: "Cargo Risk Intelligence",
    subtitle: "Sanctions, compliance and screening exposure on cargo chains",
    coverageKey: "risk",
    capabilityId: "capability.cargo",
    projectionContractId: "cargo.workspace.risk",
    capabilityHref: "/national-risk",
    evidenceKinds: ["sanctions", "compliance", "cargo"],
  },
];

export function cargoCentreBySlug(slug: string | undefined): CargoCentreDefinition | undefined {
  return CARGO_CENTRES.find((c) => c.slug === slug);
}

/* ───────────────────────────── projections ──────────────────────────── */

export interface CargoKpi {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly confidence: PanelConfidence;
}

export interface CargoTimelineItem {
  readonly id: string;
  readonly at: string;
  readonly title: string;
  readonly detail: string;
  readonly confidence: PanelConfidence;
}

export interface CargoEvidenceRow {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly grade: EvidenceGrade;
  readonly confidence: PanelConfidence;
  readonly observedAt: string;
  readonly hash: string;
  readonly entityId: string;
  readonly entityLabel: string;
}

export interface CargoInvestigationLead {
  readonly entityId: string;
  readonly label: string;
  readonly evidenceCount: number;
  readonly confidence: PanelConfidence;
}

export interface CargoCentreData {
  readonly kpis: ReadonlyArray<CargoKpi>;
  readonly timeline: ReadonlyArray<CargoTimelineItem>;
  readonly evidence: ReadonlyArray<CargoEvidenceRow>;
  readonly leads: ReadonlyArray<CargoInvestigationLead>;
  readonly summary: ReadonlyArray<string>;
  readonly confidence: PanelConfidence;
  readonly evidenceCount: number;
}

export interface CargoCentreProjection {
  readonly centre: CargoCentreDefinition;
  readonly state: KpiStateCode;
  readonly stateLabel: string;
  readonly stateDetail: string;
  readonly rootCauseDetail: string;
  readonly uipId: string | null;
  readonly data: CargoCentreData | null;
  /** Next actions the system recommends — the officer decides. */
  readonly recommendedActions: ReadonlyArray<string>;
}

const GRADE_RANK: Record<EvidenceGrade, number> = {
  UNKNOWN: 0,
  INFERRED: 1,
  REPORTED: 2,
  OBSERVED: 3,
  CORROBORATED: 4,
  VERIFIED: 5,
};

function weakest(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  return grades.reduce((min, g) => (GRADE_RANK[g] < GRADE_RANK[min] ? g : min), grades[0]!);
}

function stateFrom(
  coverage: KpiCoverage | undefined,
  uipId: string | null,
  hasEvidence: boolean,
): { state: KpiStateCode; detail: string } {
  if (!coverage) {
    return {
      state: "PROJECTION_MISSING",
      detail:
        "No coverage declaration reached this centre. Seaphore will not claim a cargo number it cannot trace.",
    };
  }
  if (coverage.dashboardStatus === "MAPPING_ERROR") {
    return { state: "PROJECTION_MISSING", detail: coverage.rootCauseDetail };
  }
  if (coverage.state !== "ACTIVE" && coverage.state !== "NO_EVIDENCE") {
    return { state: coverage.state, detail: coverage.stateDetail };
  }
  if (!uipId) {
    return {
      state: "NO_EVIDENCE",
      detail:
        "No Canonical UIP in this session yet. Run a Copilot investigation to populate this centre.",
    };
  }
  if (!hasEvidence) {
    return {
      state: "NO_EVIDENCE",
      detail: "The Canonical UIP carries no cargo evidence for this centre yet.",
    };
  }
  return { state: "ACTIVE", detail: coverage.stateDetail };
}

const NUM = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const STR = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v : undefined;

function fieldOf(e: NormalizedEvidence, keys: ReadonlyArray<string>): string | undefined {
  for (const k of keys) {
    const s = STR(e.fields[k]);
    if (s) return s;
  }
  return undefined;
}

function distinct(values: ReadonlyArray<string | undefined>): number {
  return new Set(values.filter((v): v is string => Boolean(v))).size;
}

function fmtMoney(n: number, currency: string): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B ${currency}`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${currency}`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K ${currency}`;
  return `${n} ${currency}`;
}

function leadsFrom(
  evidence: ReadonlyArray<NormalizedEvidence>,
): ReadonlyArray<CargoInvestigationLead> {
  const byEntity = new Map<string, { label: string; grades: EvidenceGrade[] }>();
  for (const e of evidence) {
    const cur = byEntity.get(e.entity.id) ?? { label: e.entity.label ?? e.entity.id, grades: [] };
    cur.grades.push(e.grade);
    byEntity.set(e.entity.id, cur);
  }
  return [...byEntity.entries()]
    .map(([entityId, v]) => ({
      entityId,
      label: v.label,
      evidenceCount: v.grades.length,
      confidence: gradeToTier(weakest(v.grades)),
    }))
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .slice(0, 6);
}

function timelineFrom(
  evidence: ReadonlyArray<NormalizedEvidence>,
): ReadonlyArray<CargoTimelineItem> {
  return [...evidence]
    .sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))
    .slice(0, 12)
    .map((e) => ({
      id: e.id,
      at: e.observedAt,
      title: `${e.kind} · ${e.entity.label ?? e.entity.id}`,
      detail: `${e.sourceName} · ${e.grade}${e.excerpt ? ` · ${e.excerpt}` : ""}`,
      confidence: gradeToTier(e.grade),
    }));
}

function evidenceRows(
  evidence: ReadonlyArray<NormalizedEvidence>,
): ReadonlyArray<CargoEvidenceRow> {
  return [...evidence]
    .sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))
    .slice(0, 10)
    .map((e) => ({
      id: e.id,
      title:
        fieldOf(e, ["billOfLading", "manifestId", "containerNumber", "commodity", "name"]) ??
        `${e.kind} record`,
      source: e.sourceName,
      grade: e.grade,
      confidence: gradeToTier(e.grade),
      observedAt: e.observedAt,
      hash: e.hash,
      entityId: e.entity.id,
      entityLabel: e.entity.label ?? e.entity.id,
    }));
}

function kpisFor(
  centre: CargoCentreDefinition,
  evidence: ReadonlyArray<NormalizedEvidence>,
  findings: ReadonlyArray<LeakageFinding>,
  tier: PanelConfidence,
): ReadonlyArray<CargoKpi> {
  const cargo = evidence.filter((e) => e.kind === "cargo");
  const count = (n: number) => `${n}`;

  switch (centre.id) {
    case "manifest": {
      const mismatches = evidence.filter((e) => {
        const declared = NUM(e.fields["declaredTonnage"]) ?? NUM(e.fields["manifestTonnage"]);
        const actual = NUM(e.fields["actualTonnage"]);
        return declared !== undefined && actual !== undefined && Math.abs(actual - declared) > 0;
      }).length;
      return [
        {
          key: "manifests",
          label: "Manifest records",
          value: count(cargo.length),
          hint: "Cargo declarations in the Canonical UIP",
          confidence: tier,
        },
        {
          key: "voyages",
          label: "Voyage records",
          value: count(evidence.filter((e) => e.kind === "voyage").length),
          hint: "Voyages carrying declared cargo",
          confidence: tier,
        },
        {
          key: "portcalls",
          label: "Port calls",
          value: count(evidence.filter((e) => e.kind === "port-call").length),
          hint: "Observed port calls for attribution",
          confidence: tier,
        },
        {
          key: "mismatch",
          label: "Declared vs actual mismatches",
          value: count(mismatches),
          hint: "Tonnage discrepancies detected in evidence",
          confidence: mismatches > 0 ? tier : "inferred",
        },
      ];
    }
    case "container": {
      const containers = distinct(cargo.map((e) => fieldOf(e, ["containerNumber", "containerNo"])));
      const gates = evidence.filter((e) => e.kind === "port-call").length;
      return [
        {
          key: "containers",
          label: "Containers tracked",
          value: count(containers),
          hint: "Distinct container numbers in evidence",
          confidence: tier,
        },
        {
          key: "movements",
          label: "Movement events",
          value: count(gates),
          hint: "Port-call events attributable to containers",
          confidence: tier,
        },
        {
          key: "records",
          label: "Container records",
          value: count(cargo.length),
          hint: "Cargo evidence rows carrying container data",
          confidence: tier,
        },
        {
          key: "unlinked",
          label: "Records without container ID",
          value: count(
            cargo.length -
              cargo.filter((e) => fieldOf(e, ["containerNumber", "containerNo"])).length,
          ),
          hint: "Cargo evidence that cannot be attributed to a box",
          confidence: tier,
        },
      ];
    }
    case "cargo": {
      const hs = distinct(cargo.map((e) => fieldOf(e, ["hsCode", "hs_code"])));
      const commodities = distinct(cargo.map((e) => fieldOf(e, ["commodity", "description"])));
      const dangerous = cargo.filter((e) => e.fields["dangerousGoods"] === true).length;
      return [
        {
          key: "items",
          label: "Cargo items",
          value: count(cargo.length),
          hint: "Cargo evidence rows in the Canonical UIP",
          confidence: tier,
        },
        {
          key: "hs",
          label: "Distinct HS codes",
          value: count(hs),
          hint: "HS codes observed across cargo evidence",
          confidence: tier,
        },
        {
          key: "commodities",
          label: "Commodities",
          value: count(commodities),
          hint: "Distinct declared commodities",
          confidence: tier,
        },
        {
          key: "dg",
          label: "Dangerous goods flags",
          value: count(dangerous),
          hint: "Cargo evidence flagged as dangerous goods",
          confidence: tier,
        },
      ];
    }
    case "trade": {
      const shippers = distinct(cargo.map((e) => fieldOf(e, ["shipper", "shipperName"])));
      const consignees = distinct(cargo.map((e) => fieldOf(e, ["consignee", "consigneeName"])));
      const lanes = distinct(
        cargo.map((e) => {
          const o = fieldOf(e, ["originPort", "loadPort"]);
          const d = fieldOf(e, ["destinationPort", "dischargePort"]);
          return o && d ? `${o}→${d}` : undefined;
        }),
      );
      return [
        {
          key: "shippers",
          label: "Shippers",
          value: count(shippers),
          hint: "Distinct shippers named in cargo evidence",
          confidence: tier,
        },
        {
          key: "consignees",
          label: "Consignees",
          value: count(consignees),
          hint: "Distinct consignees named in cargo evidence",
          confidence: tier,
        },
        {
          key: "lanes",
          label: "Trade lanes",
          value: count(lanes),
          hint: "Origin → destination pairs observed",
          confidence: tier,
        },
        {
          key: "ownership",
          label: "Ownership links",
          value: count(evidence.filter((e) => e.kind === "ownership").length),
          hint: "Ownership evidence connected to trade parties",
          confidence: tier,
        },
      ];
    }
    case "revenue": {
      const currency = findings[0]?.magnitudeCurrency ?? "USD";
      const total = findings.reduce((s, f) => s + f.magnitude, 0);
      return [
        {
          key: "findings",
          label: "Leakage findings",
          value: count(findings.length),
          hint: "Produced by capability.revenue-leakage-detection",
          confidence: tier,
        },
        {
          key: "exposure",
          label: "Estimated exposure",
          value: fmtMoney(total, currency),
          hint: "Sum of finding magnitudes — an estimate, not an assessment",
          confidence: tier,
        },
        {
          key: "priority",
          label: "High / critical",
          value: count(
            findings.filter((f) => f.priority === "critical" || f.priority === "high").length,
          ),
          hint: "Findings the system ranks highest",
          confidence: tier,
        },
        {
          key: "approved",
          label: "Officer approved",
          value: count(findings.filter((f) => f.humanApproved).length),
          hint: "Enforcement requires officer approval",
          confidence: "verified",
        },
      ];
    }
    case "cargo-risk":
    default: {
      const sanctions = evidence.filter((e) => e.kind === "sanctions").length;
      const compliance = evidence.filter((e) => e.kind === "compliance").length;
      const flagged = evidence.filter(
        (e) => e.fields["sanctioned"] === true || e.fields["watchlisted"] === true,
      ).length;
      return [
        {
          key: "screened",
          label: "Screened records",
          value: count(sanctions + compliance),
          hint: "Sanctions and compliance evidence in the UIP",
          confidence: tier,
        },
        {
          key: "hits",
          label: "Screening hits",
          value: count(flagged),
          hint: "Evidence explicitly flagged by a screening provider",
          confidence: tier,
        },
        {
          key: "compliance",
          label: "Compliance records",
          value: count(compliance),
          hint: "Compliance evidence attached to cargo chains",
          confidence: tier,
        },
        {
          key: "chains",
          label: "Cargo chains screened",
          value: count(distinct(evidence.map((e) => e.entity.id))),
          hint: "Distinct entities carrying screened cargo evidence",
          confidence: tier,
        },
      ];
    }
  }
}

function summaryFor(
  centre: CargoCentreDefinition,
  kpis: ReadonlyArray<CargoKpi>,
  tier: PanelConfidence,
  evidenceCount: number,
  uipId: string,
): ReadonlyArray<string> {
  const headline = kpis
    .slice(0, 3)
    .map((k) => `${k.label.toLowerCase()}: ${k.value}`)
    .join(", ");
  return [
    `${centre.title} is projecting ${evidenceCount} evidence record${evidenceCount === 1 ? "" : "s"} from Canonical UIP ${uipId}.`,
    `Observed ${headline}.`,
    `Weakest supporting evidence grade in this projection is ${tier}; every figure above inherits that ceiling.`,
    "System recommends; officer decides. No enforcement action follows from this summary.",
  ];
}

function actionsFor(state: KpiStateCode, centre: CargoCentreDefinition): ReadonlyArray<string> {
  switch (state) {
    case "ACTIVE":
      return [
        "Open the highest-evidence lead in the Investigation Workspace.",
        "Review the evidence panel before recording any decision.",
      ];
    case "NO_EVIDENCE":
      return [
        "Run a Copilot investigation to populate the Canonical UIP.",
        `Confirm the ${centre.title} capability returned rows for this entity.`,
      ];
    case "AWAITING_CREDENTIALS":
      return ["Provide the missing provider credentials in Administration → Provider Health."];
    case "NO_PROVIDER":
      return [
        `No certified provider serves ${centre.title} yet — cargo providers are sequenced in CAPABILITY.CARGO v1.0.`,
      ];
    case "PROVIDER_OFFLINE":
    case "RATE_LIMITED":
      return ["Inspect provider health and retry once the provider recovers."];
    default:
      return ["Declare a projection binding for this centre before relying on its numbers."];
  }
}

export function projectCargoCentre(input: {
  centre: CargoCentreDefinition;
  uipId: string | null;
  evidence: ReadonlyArray<NormalizedEvidence>;
  findings: ReadonlyArray<LeakageFinding>;
  coverage: KpiCoverage | undefined;
}): CargoCentreProjection {
  const { centre, uipId, coverage } = input;
  const scoped = input.evidence.filter((e) => centre.evidenceKinds.includes(e.kind));
  const findings = centre.id === "revenue" ? input.findings : [];
  const hasEvidence = centre.id === "revenue" ? findings.length > 0 : scoped.length > 0;
  const { state, detail } = stateFrom(coverage, uipId, hasEvidence);

  const base = {
    centre,
    stateLabel: CARGO_STATE_LABEL[state],
    stateDetail: detail,
    rootCauseDetail: coverage?.rootCauseDetail ?? detail,
    uipId,
    recommendedActions: actionsFor(state, centre),
  };

  if (state !== "ACTIVE" || !uipId) {
    return { ...base, state, data: null };
  }

  const grades =
    centre.id === "revenue" ? findings.map((f) => f.confidence) : scoped.map((e) => e.grade);
  const tier = gradeToTier(weakest(grades));
  const kpis = kpisFor(centre, scoped, findings, tier);
  const evidenceCount = centre.id === "revenue" ? findings.length : scoped.length;

  return {
    ...base,
    state,
    data: {
      kpis,
      timeline: timelineFrom(scoped),
      evidence: evidenceRows(scoped),
      leads: leadsFrom(scoped),
      summary: summaryFor(centre, kpis, tier, evidenceCount, uipId),
      confidence: tier,
      evidenceCount,
    },
  };
}

/** Every centre projected at once — used by Mission Control's workspace strip. */
export function projectCargoWorkspace(input: {
  uipId: string | null;
  evidence: ReadonlyArray<NormalizedEvidence>;
  findings: ReadonlyArray<LeakageFinding>;
  coverageByKey: (key: KpiDomainKey) => KpiCoverage | undefined;
}): ReadonlyArray<CargoCentreProjection> {
  return CARGO_CENTRES.map((centre) =>
    projectCargoCentre({
      centre,
      uipId: input.uipId,
      evidence: input.evidence,
      findings: input.findings,
      coverage: input.coverageByKey(centre.coverageKey),
    }),
  );
}
