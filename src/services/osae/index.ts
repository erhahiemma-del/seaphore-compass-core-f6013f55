/**
 * Operational Situation Awareness Engine (OSAE) — minimal surface.
 *
 * OSAE is the sole authority for interpreting evidence into
 * operational priority, risk, and recommendation. Connectors and
 * analyzers publish evidence here; OSAE consumers (ICE, OIE) read the
 * resulting assessments.
 *
 * The Sprint 1C GFW connector is the first producer, publishing AIS
 * continuity evidence. Full OSAE fusion logic will land in a
 * subsequent sprint — this module reserves the boundary so no
 * connector or analyser assigns risk itself.
 */
import type {
  AisContinuityReport,
  AisDarkEvidence,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";

export type OperationalPriority = "watch" | "monitor" | "act" | "urgent";

export interface OsaeAssessment {
  vesselId: string;
  /** Priority assigned by OSAE — connectors never set this. */
  priority: OperationalPriority;
  /** OSAE-produced narrative — never phrased as "risk level". */
  summary: string;
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

function assess(report: AisContinuityReport): OsaeAssessment {
  const longestGap = report.darkEvents.reduce(
    (m, d) => Math.max(m, d.durationHours),
    0,
  );
  const historical = report.darkEvents[0]?.historicalFrequency ?? 0;

  // OSAE priority rubric — NOT a risk score. Priority controls how
  // quickly an officer should look, not what the answer is.
  let priority: OperationalPriority = "watch";
  if (report.gapsDetected === 0) priority = "watch";
  else if (longestGap >= 24 || historical >= 3) priority = "urgent";
  else if (longestGap >= 12 || historical >= 1) priority = "act";
  else priority = "monitor";

  const summary =
    report.gapsDetected === 0
      ? "Continuous AIS coverage across the observed window."
      : `${report.gapsDetected} AIS transmission gap${report.gapsDetected === 1 ? "" : "s"} observed; longest ${longestGap.toFixed(0)}h. Officer review requested.`;

  return {
    vesselId: report.vesselId,
    priority,
    summary,
    evidence: report.darkEvents,
    producedAt: new Date().toISOString(),
  };
}

export const OSAE = {
  /**
   * Publish an AIS continuity report from the AIS Behaviour Analyzer.
   * Returns the OSAE assessment (priority + narrative) — the only
   * component allowed to shape that judgement.
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

  /** Test seam. */
  __reset(): void {
    state.reports.clear();
    state.assessments.clear();
  },
};
