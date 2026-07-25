/**
 * Intelligence Evidence — officer-facing projection model.
 *
 * Golden Rule: every backend evidence artifact (GFW identity, GFW gap events,
 * AIS Behaviour Analyzer output, OSAE assessments, OSINT connectors) must be
 * projectable to the officer WITHOUT leaking raw API payloads.
 *
 * This module defines the sanitized {@link IntelligenceEvidenceItem} shape
 * consumed by `<IntelligenceEvidenceViewer />`, plus adapters that translate
 * backend artifacts into the shape. Adapters copy only fields safe for
 * officer view; they never carry raw response bodies, bearer tokens, or
 * internal identifiers.
 */

import type {
  AisContinuityReport,
  AisDarkEvidence,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import type { OsaeAssessment } from "@/services/osae";
import type {
  OperationalPattern,
  AlternativeExplanation,
  ConfidencePyramid,
  ReasoningStep,
  OklPatternKind,
  RiskLevel,
} from "@/services/okl/types";
import type { WorkspaceEvidence } from "@/stores/workspace.store";

/** Broad category — drives the filter chips in the viewer. */
export type EvidenceType =
  | "ais-continuity"
  | "movement"
  | "identity"
  | "sanctions"
  | "ownership"
  | "assessment"
  | "other";

/** Officer-facing verification status. */
export type EvidenceStatus = "verified" | "pending" | "historical" | "conflicting" | "rejected";

/** Confidence chip level, aligned with OC-001. */
export type EvidenceConfidence = "VERIFIED" | "OBSERVED" | "INFERRED" | "UNCONFIRMED";

/**
 * Sanitized evidence row shown in the Intelligence Evidence Explorer.
 * Never contains raw API payloads.
 */
export type EvidenceEntityType =
  | "vessel"
  | "company"
  | "person"
  | "cargo"
  | "port"
  | "incident"
  | "document";

export interface EvidenceEntityRef {
  type: EvidenceEntityType;
  name: string;
  /** Optional stable id (MMSI, IMO, company id) — used for dedup. */
  id?: string;
}

export interface IntelligenceEvidenceItem {
  /** Stable id (deterministic if possible for dedup). */
  id: string;
  /** Human-readable source label ("Global Fishing Watch", "OpenSanctions"). */
  source: string;
  /** ISO8601 timestamp associated with the evidence. */
  timestamp: string;
  /** Confidence chip level. */
  confidence: EvidenceConfidence;
  /** Optional 0..1 numeric confidence for sorting/tooltip. */
  confidenceScore?: number;
  /** Broad category. */
  evidenceType: EvidenceType;
  /** Verification status. */
  status: EvidenceStatus;
  /** Short officer-safe headline. */
  claim: string;
  /** Optional one-line context (never a raw payload). */
  summary?: string;
  /** Officer-facing link to the source (only when appropriate). */
  sourceUrl?: string;
  /** Which subject the evidence relates to (vessel, company, …). */
  subject?: string;
  /** Which producer generated this evidence. */
  producer?: "IAL" | "REASONING" | "OSAE" | "ICE" | "IFE" | "OKL" | "WORKSPACE";
  /** Hash for chain-of-custody (opaque; never a token). */
  hash?: string;
  /** Connector short-id (e.g. "gfw", "opensanctions", "companies-house"). */
  connector?: string;
  /** Investigation workspace id this evidence belongs to (if any). */
  investigationId?: string;
  /**
   * Entities the evidence references. Drives the Relationship Graph and
   * per-entity filter. Extracted upstream in adapters — no raw payloads.
   */
  entities?: EvidenceEntityRef[];
  /**
   * Officer-facing OKL explainability. Present when the evidence row was
   * produced by an Operational Knowledge Layer pattern detector. Carries
   * WHY the pattern was detected, supporting/contradictory evidence ids,
   * provenance, alternative explanations, confidence pyramid, and the
   * machine-readable reasoning trace. Rendered alongside the timeline in
   * the Intelligence Evidence Explorer.
   */
  oklExplainability?: OklExplainability;
}

export interface OklExplainability {
  readonly patternId: string;
  readonly patternKind: OklPatternKind;
  readonly patternName: string;
  readonly operationalImpact: string;
  readonly riskLevel: RiskLevel;
  /** One-line synthesis of "why this was detected". */
  readonly whyDetected: string;
  /** Full machine-readable reasoning trace from the detector. */
  readonly reasoning: ReadonlyArray<ReasoningStep>;
  /** Evidence ids from the UIP that support this conclusion. */
  readonly supportingEvidenceIds: ReadonlyArray<string>;
  /** Contradictory evidence ids surfaced by the IFE. */
  readonly contradictoryEvidenceIds: ReadonlyArray<string>;
  /** Connector short-ids that contributed evidence. */
  readonly sourceConnectors: ReadonlyArray<string>;
  /** Alternative benign explanations the officer should weigh. */
  readonly alternatives: ReadonlyArray<AlternativeExplanation>;
  /** Full 5-level Confidence Pyramid. */
  readonly confidencePyramid: ConfidencePyramid;
  /** Historical context (e.g. prior detections). */
  readonly historicalContext?: string;
  /** Provenance — where did this pattern come from? */
  readonly provenance: {
    readonly uipId: string;
    readonly fusedPackageId: string;
    readonly detector: OklPatternKind;
  };
  /** Officer-approval-gated recommendation labels, for quick scanning. */
  readonly recommendationLabels: ReadonlyArray<string>;
}

/* ────────────────────────── grade / status helpers ────────────────────────── */

const GRADE_TO_CONFIDENCE: Record<string, EvidenceConfidence> = {
  VERIFIED: "VERIFIED",
  CORROBORATED: "VERIFIED",
  OBSERVED: "OBSERVED",
  REPORTED: "INFERRED",
  INFERRED: "INFERRED",
  UNKNOWN: "UNCONFIRMED",
};

function gradeToConfidence(grade?: string): EvidenceConfidence {
  if (!grade) return "UNCONFIRMED";
  return GRADE_TO_CONFIDENCE[grade.toUpperCase()] ?? "UNCONFIRMED";
}

function categoryToStatus(cat: WorkspaceEvidence["category"]): EvidenceStatus {
  switch (cat) {
    case "COLLECTED":
      return "verified";
    case "PENDING":
      return "pending";
    case "CONFLICTING":
      return "conflicting";
    case "REJECTED":
      return "rejected";
  }
}

/* ────────────────────────── adapters ────────────────────────── */

/**
 * Adapt an AIS continuity report from AISBehaviourAnalyzer.
 * Emits one row per dark event plus a summary row for the whole window.
 */
export function fromAisContinuityReport(report: AisContinuityReport, subject?: string): IntelligenceEvidenceItem[] {
  const items: IntelligenceEvidenceItem[] = [];

  items.push({
    id: `ais.window.${report.vesselId}.${report.windowStart}`,
    source: "Global Fishing Watch · AIS Behaviour Analyzer",
    timestamp: report.windowEnd,
    confidence: report.continuous ? "OBSERVED" : "OBSERVED",
    confidenceScore: 0.75,
    evidenceType: "ais-continuity",
    status: report.continuous ? "verified" : "pending",
    claim: report.continuous
      ? `Continuous AIS coverage across the observed window (${report.totalEvents} positions).`
      : `${report.gapsDetected} AIS gap${report.gapsDetected === 1 ? "" : "s"} above the ${report.gapThresholdHours}h threshold.`,
    summary: `Window ${report.windowStart.slice(0, 10)} → ${report.windowEnd.slice(0, 10)} · ${report.totalEvents} positions`,
    subject,
    producer: "REASONING",
    connector: "gfw",
    entities: subject ? [{ type: "vessel", name: subject, id: report.vesselId }] : undefined,
  });

  for (const dark of report.darkEvents) {
    items.push(fromDarkEvent(dark, report.vesselId, subject));
  }
  return items;
}

/** Adapt a single dark-event evidence into a row. */
export function fromDarkEvent(dark: AisDarkEvidence, vesselId: string, subject?: string): IntelligenceEvidenceItem {
  return {
    id: `ais.dark.${vesselId}.${dark.startAt}`,
    source: "Global Fishing Watch · AIS Behaviour Analyzer",
    timestamp: dark.endAt,
    confidence: dark.confidence >= 0.8 ? "VERIFIED" : dark.confidence >= 0.6 ? "OBSERVED" : "INFERRED",
    confidenceScore: dark.confidence,
    evidenceType: "ais-continuity",
    status: "verified",
    claim: `AIS dark event · ${dark.durationHours.toFixed(1)}h`,
    summary: dark.explanation,
    subject,
    producer: "REASONING",
    connector: "gfw",
    entities: subject ? [{ type: "vessel", name: subject, id: vesselId }] : undefined,
  };
}

/** Adapt an OSAE assessment into a summary row. */
export function fromOsaeAssessment(a: OsaeAssessment, subject?: string): IntelligenceEvidenceItem {
  return {
    id: `osae.${a.vesselId}.${a.producedAt}`,
    source: "OSAE · Operational Situation Awareness Engine",
    timestamp: a.producedAt,
    confidence: a.evidence.length === 0 ? "UNCONFIRMED" : "OBSERVED",
    confidenceScore: a.evidence.length === 0 ? 0.2 : 0.7,
    evidenceType: "assessment",
    status: "verified",
    claim: `OSAE priority · ${a.priority.toUpperCase()}`,
    summary: a.summary,
    subject,
    producer: "OSAE",
    connector: "osae",
    entities: subject ? [{ type: "vessel", name: subject, id: a.vesselId }] : undefined,
  };
}

/** Adapt a GFW identity payload (already sanitized upstream). */
export function fromGfwIdentity(id: {
  vesselId: string;
  name?: string;
  mmsi?: string;
  imo?: string;
  flag?: string;
  callSign?: string;
  matchFields?: string;
  evidenceUrl?: string;
  collectedAt?: string;
}, subject?: string): IntelligenceEvidenceItem {
  const strongMatch = id.matchFields && id.matchFields !== "NO_MATCH";
  return {
    id: `gfw.identity.${id.vesselId}`,
    source: "Global Fishing Watch · Vessel Identity",
    timestamp: id.collectedAt ?? new Date().toISOString(),
    confidence: strongMatch ? "VERIFIED" : "INFERRED",
    confidenceScore: strongMatch ? 0.88 : 0.5,
    evidenceType: "identity",
    status: strongMatch ? "verified" : "pending",
    claim: `Vessel identity · ${id.name ?? "unnamed"} (${id.flag ?? "flag unknown"})`,
    summary: `MMSI ${id.mmsi ?? "—"} · IMO ${id.imo ?? "—"} · match=${id.matchFields ?? "—"}`,
    sourceUrl: id.evidenceUrl,
    subject: subject ?? id.name,
    producer: "IAL",
    connector: "gfw",
    entities: (subject ?? id.name)
      ? [{ type: "vessel", name: (subject ?? id.name)!, id: id.mmsi ?? id.imo ?? id.vesselId }]
      : undefined,
  };
}

/** Adapt a GFW gap event (already normalised — no raw payload). */
export function fromGfwGapEvent(e: {
  id: string;
  vessel: { name?: string | null; ssvid?: string; flag?: string };
  start: string;
  end: string;
  durationHours: number;
  intentionalDisabling: boolean;
  impliedSpeedKnots: number;
  evidenceUrl?: string;
}): IntelligenceEvidenceItem {
  return {
    id: `gfw.gap.${e.id}`,
    source: "Global Fishing Watch · Gaps Events",
    timestamp: e.end,
    confidence: e.intentionalDisabling ? "OBSERVED" : "INFERRED",
    confidenceScore: e.intentionalDisabling ? 0.8 : 0.55,
    evidenceType: "movement",
    status: "verified",
    claim: `AIS gap · ${e.durationHours.toFixed(1)}h${e.intentionalDisabling ? " (intentional disabling flag)" : ""}`,
    summary: `${e.vessel.name ?? "unnamed"} · MMSI ${e.vessel.ssvid ?? "—"} · implied speed ${e.impliedSpeedKnots.toFixed(3)} kn`,
    sourceUrl: e.evidenceUrl,
    subject: e.vessel.name ?? undefined,
    producer: "IAL",
    connector: "gfw",
    entities: e.vessel.name ? [{ type: "vessel", name: e.vessel.name, id: e.vessel.ssvid }] : undefined,
  };
}

/** Adapt a workspace evidence row (already presentation-safe). */
export function fromWorkspaceEvidence(
  w: WorkspaceEvidence,
  investigationId?: string,
): IntelligenceEvidenceItem {
  return {
    id: `ws.${w.id}`,
    source: w.source,
    timestamp: w.collectedAt,
    confidence: gradeToConfidence(w.grade),
    evidenceType: "other",
    status: categoryToStatus(w.category),
    claim: w.title,
    summary: w.summary,
    subject: w.entityName,
    hash: w.hash,
    producer: "WORKSPACE",
    connector: "workspace",
    investigationId,
    entities: w.entityName
      ? [{ type: "vessel", name: w.entityName, id: w.entityId }]
      : undefined,
  };
}

/* ────────────────────────── filters ────────────────────────── */

export interface EvidenceFilters {
  types: Set<EvidenceType>;
  statuses: Set<EvidenceStatus>;
  sources: Set<string>;
  search: string;
  /** Optional connector short-id filter (e.g. "gfw"). */
  connectors?: Set<string>;
  /** Optional investigation workspace id filter. */
  investigations?: Set<string>;
  /** Optional entity name filter (case-insensitive contains). */
  entity?: string;
  /** Optional confidence chip filter. */
  confidences?: Set<EvidenceConfidence>;
  /** Optional ISO timestamp lower bound (inclusive). */
  timeStart?: string;
  /** Optional ISO timestamp upper bound (inclusive). */
  timeEnd?: string;
}

function timeIn(t: string, start?: string, end?: string): boolean {
  const ts = Date.parse(t);
  if (Number.isNaN(ts)) return true;
  if (start) {
    const s = Date.parse(start);
    if (!Number.isNaN(s) && ts < s) return false;
  }
  if (end) {
    const e = Date.parse(end);
    if (!Number.isNaN(e) && ts > e) return false;
  }
  return true;
}

export function applyEvidenceFilters(
  items: IntelligenceEvidenceItem[],
  f: EvidenceFilters,
): IntelligenceEvidenceItem[] {
  const q = f.search.trim().toLowerCase();
  const entityQ = f.entity?.trim().toLowerCase() ?? "";
  return items.filter((it) => {
    if (f.types.size > 0 && !f.types.has(it.evidenceType)) return false;
    if (f.statuses.size > 0 && !f.statuses.has(it.status)) return false;
    if (f.sources.size > 0 && !f.sources.has(it.source)) return false;
    if (f.connectors && f.connectors.size > 0) {
      if (!it.connector || !f.connectors.has(it.connector)) return false;
    }
    if (f.investigations && f.investigations.size > 0) {
      if (!it.investigationId || !f.investigations.has(it.investigationId)) return false;
    }
    if (f.confidences && f.confidences.size > 0 && !f.confidences.has(it.confidence)) {
      return false;
    }
    if (!timeIn(it.timestamp, f.timeStart, f.timeEnd)) return false;
    if (entityQ) {
      const hasEntity =
        (it.subject?.toLowerCase().includes(entityQ) ?? false) ||
        (it.entities?.some((e) => e.name.toLowerCase().includes(entityQ)) ?? false);
      if (!hasEntity) return false;
    }
    if (
      q &&
      !(
        it.claim.toLowerCase().includes(q) ||
        it.source.toLowerCase().includes(q) ||
        (it.subject?.toLowerCase().includes(q) ?? false) ||
        (it.summary?.toLowerCase().includes(q) ?? false) ||
        (it.entities?.some((e) => e.name.toLowerCase().includes(q)) ?? false)
      )
    )
      return false;
    return true;
  });
}

/** Default (empty) filter shape — convenient for view state. */
export function emptyFilters(): EvidenceFilters {
  return {
    types: new Set(),
    statuses: new Set(),
    sources: new Set(),
    search: "",
    connectors: new Set(),
    investigations: new Set(),
    confidences: new Set(),
    entity: "",
    timeStart: undefined,
    timeEnd: undefined,
  };
}
