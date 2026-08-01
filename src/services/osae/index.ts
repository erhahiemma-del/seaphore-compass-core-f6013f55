/**
 * Operational Situation Awareness Engine (OSAE) — voyage-aware surface.
 *
 * OSAE is the sole authority for interpreting evidence into
 * operational priority, risk, and recommendation. Connectors and
 * analyzers publish evidence here; OSAE consumers (ICE, OIE) read the
 * resulting assessments.
 *
 * Sprint 1D-AIS: OSAE now assesses individual segmented AIS
 * interruption events AND produces an overall operational assessment.
 * The overall priority is the max across per-event priorities, lifted
 * by detected recurring patterns.
 */
import type {
  AisContinuityReport,
  AisDarkEvidence,
  AisPattern,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";

export type OperationalPriority = "watch" | "monitor" | "act" | "urgent";

export interface PerEventAssessment {
  startAt: string;
  endAt: string;
  durationHours: number;
  kind: AisDarkEvidence["kind"];
  priority: OperationalPriority;
  rationale: string;
}

export interface OsaeAssessment {
  vesselId: string;
  /** Overall priority assigned by OSAE — connectors never set this. */
  priority: OperationalPriority;
  /** OSAE-produced narrative — never phrased as "risk level". */
  summary: string;
  /** Per-event assessments — one per discrete interruption. */
  eventAssessments: PerEventAssessment[];
  /** Behavioural patterns lifted from the continuity report. */
  patterns: AisPattern[];
  totalInterruptions: number;
  longestInterruptionHours: number;
  /** Evidence that fed this assessment. */
  evidence: AisDarkEvidence[];
  producedAt: string;
}

interface OsaeState {
  reports: Map<string, AisContinuityReport>;
  assessments: Map<string, OsaeAssessment>;
}

const state: OsaeState = {
  reports: new Map(),
  assessments: new Map(),
};

const PRIORITY_RANK: Record<OperationalPriority, number> = {
  watch: 0,
  monitor: 1,
  act: 2,
  urgent: 3,
};

function ranked(a: OperationalPriority, b: OperationalPriority): OperationalPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

function priorityForEvent(
  ev: AisDarkEvidence,
  historicalFrequency: number,
): { priority: OperationalPriority; rationale: string } {
  if (ev.kind === "coverage-uncertain") {
    return {
      priority: "watch",
      rationale:
        "Coverage-uncertain span — cannot be attributed to a single disabling event without additional evidence.",
    };
  }
  const near = typeof ev.distanceFromPortNm === "number" && ev.distanceFromPortNm <= 25;
  if (ev.durationHours >= 24 || (near && ev.durationHours >= 6)) {
    return {
      priority: "urgent",
      rationale:
        near && ev.durationHours >= 6
          ? "Disabling near port approach exceeding 6 hours warrants immediate officer review."
          : "Disabling exceeding 24 hours warrants immediate officer review.",
    };
  }
  if (ev.durationHours >= 12 || historicalFrequency >= 1) {
    return {
      priority: "act",
      rationale: "Disabling exceeds 12 hours or repeats prior behaviour; officer review requested.",
    };
  }
  if (ev.durationHours > 6) {
    return {
      priority: "monitor",
      rationale: "Short disabling event above the 6-hour threshold; monitor for repetition.",
    };
  }
  return { priority: "watch", rationale: "Observation logged." };
}

function assess(report: AisContinuityReport): OsaeAssessment {
  const historicalFrequency = report.darkEvents[0]?.historicalFrequency ?? 0;

  const eventAssessments: PerEventAssessment[] = report.darkEvents.map((ev) => {
    const { priority, rationale } = priorityForEvent(ev, historicalFrequency);
    return {
      startAt: ev.startAt,
      endAt: ev.endAt,
      durationHours: ev.durationHours,
      kind: ev.kind,
      priority,
      rationale,
    };
  });

  // Overall priority = max across per-event priorities, lifted by
  // patterns. Patterns can only *raise* priority, never lower it.
  let overall: OperationalPriority = "watch";
  for (const a of eventAssessments) overall = ranked(overall, a.priority);
  for (const p of report.patterns) {
    if (p.code === "repeated-disabling" && p.occurrences >= 3) {
      overall = ranked(overall, "urgent");
    } else if (p.code === "port-approach-disabling") {
      overall = ranked(overall, "act");
    } else if (p.code === "boundary-crossing") {
      overall = ranked(overall, "act");
    } else if (p.code === "offshore-loitering") {
      overall = ranked(overall, "monitor");
    }
  }

  const summary =
    report.totalInterruptions === 0
      ? report.gapsDetected === 0
        ? "Continuous AIS coverage across the observed window."
        : `${report.gapsDetected} coverage-uncertain span${report.gapsDetected === 1 ? "" : "s"} observed; no plausible discrete disabling event attributable.`
      : `${report.totalInterruptions} discrete AIS interruption${report.totalInterruptions === 1 ? "" : "s"} observed; longest ${report.longestInterruptionHours.toFixed(0)}h${report.patterns.length ? `; ${report.patterns.length} pattern${report.patterns.length === 1 ? "" : "s"} detected` : ""}. Officer review requested.`;

  return {
    vesselId: report.vesselId,
    priority: overall,
    summary,
    eventAssessments,
    patterns: report.patterns,
    totalInterruptions: report.totalInterruptions,
    longestInterruptionHours: report.longestInterruptionHours,
    evidence: report.darkEvents,
    producedAt: new Date().toISOString(),
  };
}

export const OSAE = {
  /**
   * Publish an AIS continuity report from the AIS Behaviour Analyzer.
   * Returns the OSAE assessment (priority + narrative + per-event
   * assessments) — the only component allowed to shape those judgements.
   */
  publishAisContinuity(report: AisContinuityReport): OsaeAssessment {
    state.reports.set(report.vesselId, report);
    const assessment = assess(report);
    state.assessments.set(report.vesselId, assessment);
    return assessment;
  },

  getReport(vesselId: string): AisContinuityReport | undefined {
    return state.reports.get(vesselId);
  },

  getAssessment(vesselId: string): OsaeAssessment | undefined {
    return state.assessments.get(vesselId);
  },

  /**
   * Operational-Runtime consumer surface. Returns the OSAE assessments
   * carried by the given Canonical UIP (populated during
   * `buildUnifiedIntelligencePackage`), keyed by canonical entity id.
   *
   * This is the *sole* sanctioned way downstream operational modules
   * (MIW, Mission Planning, MIBC) obtain OSAE judgements — never by
   * re-invoking the analyzer or reading raw connectors.
   */
  assessmentsForUip(
    uip:
      | {
          readonly osae: ReadonlyArray<{
            readonly entityId: string;
            readonly assessment: OsaeAssessment;
          }>;
        }
      | null
      | undefined,
  ): ReadonlyArray<{ entityId: string; assessment: OsaeAssessment }> {
    if (!uip) return [];
    return uip.osae.map((o) => ({ entityId: o.entityId, assessment: o.assessment }));
  },

  /** Test seam. */
  __reset(): void {
    state.reports.clear();
    state.assessments.clear();
  },
};
