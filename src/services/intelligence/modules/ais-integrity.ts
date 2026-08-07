/**
 * Risk module — AIS Integrity.
 *
 * The one module with a connected data source. It is an *adapter*, not an
 * analyser: it reads the assessment OSAE has already published for a vessel
 * and reshapes it into `IntelligenceFinding`s.
 *
 * ## Nothing here re-analyses AIS
 *
 * Contract prohibition 4. `AISBehaviourAnalyzer` segments the gaps,
 * `OSAE.publishAisContinuity` assigns the priority, and this module copies
 * both. It reads OSAE through `getReport`/`getAssessment` — the sanctioned
 * consumer surface — rather than re-invoking the analyzer, so a finding can
 * never disagree with the assessment an officer sees elsewhere.
 *
 * The only numbers it produces come from `reasoning`'s own ladder:
 * `anchorFromEvidence` → `propagate` → `bandOf`. It picks no thresholds of
 * its own.
 */
import type {
  AisContinuityReport,
  AisDarkEvidence,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { confidenceLevelFor } from "@/lib/osint/confidence";
import { OSAE, type OsaeAssessment } from "@/services/osae";
import {
  anchorFromEvidence,
  bandOf,
  propagate,
  requiresCounterHypothesis,
} from "@/services/reasoning";
import type { CounterHypothesis, WhyChainStep } from "@/services/reasoning/types";
import { freshnessBandForAge } from "@/services/geospatial";
import type { VesselProvenance } from "@/services/geospatial";

import type { FindingContext, RiskModule } from "../module-registry";
import type { EvidenceRef, IntelligenceFinding } from "../types";

/**
 * Provenance used when the caller supplied none.
 *
 * OSAE stores assessments without the lineage of the positions behind them,
 * so an unattributed finding is possible. Saying "unattributed" is the
 * honest option; inventing a connector name would be worse.
 */
const UNATTRIBUTED: Omit<VesselProvenance, "retrievedAt" | "observedAt"> = {
  source: "unattributed",
  provider: "Provenance not supplied by the caller",
};

function provenanceFor(context: FindingContext, evidence: AisDarkEvidence): VesselProvenance {
  const supplied = context.sources?.[0];
  if (supplied) return { ...supplied, observedAt: evidence.startAt };
  return {
    ...UNATTRIBUTED,
    retrievedAt: new Date(context.now).toISOString(),
    observedAt: evidence.startAt,
  };
}

/** Reshape one analyzer observation as a reference. The record stays OSAE's. */
function toEvidenceRef(
  evidence: AisDarkEvidence,
  index: number,
  vesselId: string,
  context: FindingContext,
): EvidenceRef {
  return {
    id: `ais-dark:${vesselId}:${index}`,
    type: evidence.type,
    // Grade comes from the OSINT engine's own thresholds, applied to the
    // analyzer's observation confidence. No second scale is introduced.
    grade: confidenceLevelFor(evidence.confidence),
    observationConfidence: evidence.confidence,
    summary: evidence.explanation,
    observedAt: evidence.startAt,
    provenance: provenanceFor(context, evidence),
    payloadRef: `osae:report:${vesselId}#${index}`,
  };
}

/**
 * State the conditions under which the interruptions are innocent.
 *
 * This is read off evidence the analyzer already recorded — severe weather,
 * sparse traffic, coverage-uncertain spans are exactly the circumstances in
 * which a transmission stop is equipment or coverage rather than intent.
 * The module authors no hypothesis of its own; it counts what is there.
 */
function counterHypothesisFor(report: AisContinuityReport): CounterHypothesis {
  const benign = report.darkEvents
    .map((evidence, index) => ({ evidence, index }))
    .filter(
      ({ evidence }) =>
        evidence.kind === "coverage-uncertain" ||
        evidence.weatherContext === "severe" ||
        evidence.trafficDensity === "sparse",
    );

  const refutingEvidenceIds = benign.map(({ index }) => `ais-dark:${report.vesselId}:${index}`);

  return {
    statement:
      "The interruptions reflect equipment failure or receiver coverage rather than deliberate disabling.",
    // Share of observations carrying a benign explanation. Not a risk score
    // — it is how much of the evidence argues the other way.
    likelihood:
      report.darkEvents.length === 0
        ? 0
        : Number((benign.length / report.darkEvents.length).toFixed(3)),
    refutingEvidenceIds,
  };
}

/** Steps trace observation → pattern → judgement, with the ladder's own values. */
function whyChainFor(
  report: AisContinuityReport,
  assessment: OsaeAssessment,
  ladder: ReturnType<typeof propagate>,
): readonly WhyChainStep[] {
  const evidenceIds = report.darkEvents.map((_, index) => `ais-dark:${report.vesselId}:${index}`);
  const steps: WhyChainStep[] = [
    {
      step: 1,
      statement: `${report.totalInterruptions} discrete AIS interruption${report.totalInterruptions === 1 ? "" : "s"} were segmented from ${report.totalEvents} position reports, the longest ${report.longestInterruptionHours.toFixed(0)} hours.`,
      evidenceIds,
      confidence: ladder.evidence,
    },
  ];

  if (report.patterns.length > 0) {
    steps.push({
      step: steps.length + 1,
      statement: report.patterns.map((pattern) => pattern.description).join(" "),
      evidenceIds: report.patterns.flatMap((pattern) =>
        pattern.evidenceIndices.map((index) => `ais-dark:${report.vesselId}:${index}`),
      ),
      confidence: ladder.pattern,
    });
  }

  steps.push({
    step: steps.length + 1,
    statement: assessment.summary,
    evidenceIds,
    confidence: ladder.assessment,
  });

  return steps;
}

function ageMsOf(report: AisContinuityReport, now: number): number | null {
  const observed = Date.parse(report.windowEnd);
  return Number.isNaN(observed) ? null : Math.max(0, now - observed);
}

/**
 * Absences the officer should know about.
 *
 * GFW is an activity feed, not live AIS: it reports neither course nor
 * speed, and its events lag by days. Both shape what this module can and
 * cannot say, so both are stated rather than left to be discovered.
 */
function gapsIn(report: AisContinuityReport): readonly string[] {
  const gaps: string[] = [];
  const uncertain = report.darkEvents.filter((e) => e.kind === "coverage-uncertain").length;
  if (uncertain > 0) {
    gaps.push(
      `${uncertain} span${uncertain === 1 ? "" : "s"} too long to attribute to a single disabling event`,
    );
  }
  if (report.darkEvents.some((e) => e.weatherContext === "unknown")) {
    gaps.push("no weather context for some interruptions");
  }
  if (report.darkEvents.some((e) => e.distanceFromCoastNm === null)) {
    gaps.push("no distance from coast for some interruptions");
  }
  return gaps;
}

function baseFinding(
  context: FindingContext,
  over: Partial<IntelligenceFinding> & Pick<IntelligenceFinding, "kind" | "statement" | "status">,
): IntelligenceFinding {
  return {
    id: `ais-integrity:${context.subjectId}:${over.kind}`,
    subject: { kind: "vessel", id: context.subjectId, displayName: context.displayName },
    module: "ais-integrity",
    producedAt: new Date(context.now).toISOString(),
    observedAt: null,
    evidence: [],
    assessment: null,
    priority: null,
    priorityRationale: null,
    dataQuality: {
      validation: "accepted",
      validationReasons: [],
      freshness: "unknown",
      ageMs: null,
      gaps: [],
    },
    provenance: { sources: context.sources ?? [], pipeline: [], corroboration: null },
    unavailableReason: null,
    ...over,
  };
}

async function evaluate(context: FindingContext): Promise<readonly IntelligenceFinding[]> {
  const report = OSAE.getReport(context.subjectId);
  const assessment = OSAE.getAssessment(context.subjectId);

  // No assessment is not the same as a clean vessel, and must never render
  // as one.
  if (!report || !assessment) {
    return [
      baseFinding(context, {
        kind: "ais-continuity:not-assessed",
        statement: "AIS continuity has not been assessed for this vessel.",
        status: "insufficient-evidence",
        unavailableReason:
          "No AIS continuity report has been published to OSAE for this vessel in this session.",
      }),
    ];
  }

  const ageMs = ageMsOf(report, context.now);
  const dataQuality = {
    validation: "accepted" as const,
    validationReasons: [],
    freshness: freshnessBandForAge(ageMs),
    ageMs,
    gaps: gapsIn(report),
  };

  if (report.darkEvents.length === 0) {
    return [
      baseFinding(context, {
        kind: "ais-continuity:continuous",
        statement: assessment.summary,
        status: "not-applicable",
        unavailableReason: "No transmission interruption exceeded the reporting threshold.",
        observedAt: report.windowEnd,
        dataQuality,
      }),
    ];
  }

  const evidence = report.darkEvents.map((item, index) =>
    toEvidenceRef(item, index, report.vesselId, context),
  );

  const ladder = propagate(anchorFromEvidence(report.darkEvents));
  const band = bandOf(ladder.assessment);

  return [
    baseFinding(context, {
      kind: "ais-continuity:interrupted",
      statement: assessment.summary,
      status: "supported",
      observedAt: report.darkEvents[report.darkEvents.length - 1].endAt,
      evidence,
      assessment: {
        statement: assessment.summary,
        confidence: ladder.assessment,
        band,
        propagation: ladder,
        whyChain: whyChainFor(report, assessment, ladder),
        // Required for high and medium bands — `reasoning` decides which.
        counterHypothesis: requiresCounterHypothesis(band) ? counterHypothesisFor(report) : null,
      },
      // Copied from OSAE. This module has no priority logic of its own.
      priority: assessment.priority,
      priorityRationale:
        assessment.eventAssessments.find((e) => e.priority === assessment.priority)?.rationale ??
        assessment.summary,
      dataQuality,
    }),
  ];
}

/** The AIS Integrity module. Registered `ready` — its source is connected. */
export const aisIntegrityModule: RiskModule = {
  id: "ais-integrity",
  label: "AIS Integrity",
  description:
    "Transmission interruptions segmented by the AIS Behaviour Analyzer, judged by OSAE.",
  status: "ready",
  requires: ["AIS position reports", "OSAE continuity assessment"],
  evaluate,
};
