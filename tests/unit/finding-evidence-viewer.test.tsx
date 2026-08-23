// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FindingEvidenceViewer } from "@/components/intelligence/FindingEvidenceViewer";
import type { IntelligenceFinding } from "@/services/intelligence";

afterEach(() => cleanup());

const NOW = Date.parse("2026-08-06T12:00:00.000Z");

function finding(over: Partial<IntelligenceFinding> = {}): IntelligenceFinding {
  return {
    id: "f1",
    subject: { kind: "vessel", id: "9411765", displayName: "MV Test" },
    module: "ais-integrity",
    kind: "ais-continuity:interrupted",
    statement: "2 discrete AIS interruptions observed; longest 50h.",
    producedAt: new Date(NOW).toISOString(),
    observedAt: new Date(NOW - 10 * 3_600_000).toISOString(),
    evidence: [
      {
        id: "e1",
        type: "AIS_DARK",
        grade: "CORROBORATED",
        observationConfidence: 0.9,
        summary: "AIS transmission ceased for 30 hours in clear weather.",
        observedAt: new Date(NOW - 90 * 3_600_000).toISOString(),
        provenance: {
          source: "global-fishing-watch",
          provider: "Global Fishing Watch",
          datasetId: "public-global-fishing-events:latest",
          retrievedAt: new Date(NOW).toISOString(),
          observedAt: new Date(NOW - 90 * 3_600_000).toISOString(),
        },
        payloadRef: "osae:report:9411765#0",
      },
    ],
    assessment: {
      statement: "Interruptions consistent with deliberate disabling.",
      confidence: 0.55,
      band: "medium",
      propagation: {
        evidence: 0.7,
        relationship: 0.663,
        pattern: 0.619,
        assessment: 0.55,
        recommendation: 0.508,
      },
      whyChain: [
        {
          step: 1,
          statement: "Two interruptions were segmented.",
          evidenceIds: ["e1"],
          confidence: 0.7,
        },
        { step: 2, statement: "Officer review requested.", evidenceIds: ["e1"], confidence: 0.55 },
      ],
      counterHypothesis: {
        statement: "The interruptions reflect equipment failure or receiver coverage.",
        likelihood: 0.25,
        refutingEvidenceIds: ["e1"],
      },
    },
    priority: "act",
    priorityRationale: "Disabling exceeds 12 hours; officer review requested.",
    dataQuality: {
      validation: "accepted",
      validationReasons: [],
      freshness: "stale",
      ageMs: 10 * 3_600_000,
      gaps: ["no distance from coast for some interruptions"],
    },
    provenance: {
      sources: [],
      pipeline: [
        { contributorId: "c1", stage: "normalize", recordedAt: new Date(NOW).toISOString() },
      ],
      corroboration: null,
    },
    status: "supported",
    unavailableReason: null,
    ...over,
  };
}

describe("FindingEvidenceViewer", () => {
  it("shows the statement and OSAE's priority with its rationale", () => {
    render(<FindingEvidenceViewer finding={finding()} />);

    expect(screen.getByText(/2 discrete AIS interruptions/)).toBeInTheDocument();
    expect(screen.getByText("act")).toBeInTheDocument();
    expect(screen.getByText("OSAE:")).toBeInTheDocument();
  });

  it("keeps evidence grade and assessment confidence visibly separate", () => {
    // The distinction the model exists to preserve. One chip would destroy it.
    render(<FindingEvidenceViewer finding={finding()} />);

    expect(screen.getByText("CORROBORATED")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText(/how good the source is/)).toBeInTheDocument();
    expect(screen.getByText(/how sure the conclusion is/)).toBeInTheDocument();
  });

  it("shows observation confidence apart from assessment confidence", () => {
    render(<FindingEvidenceViewer finding={finding()} />);

    expect(screen.getByText("Observation confidence")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("renders the whole propagation ladder, not just the final number", () => {
    render(<FindingEvidenceViewer finding={finding()} />);

    for (const rung of ["Evidence", "Relationship", "Pattern", "Assessment", "Recommendation"]) {
      expect(screen.getByText(rung)).toBeInTheDocument();
    }
  });

  it("shows the counter-hypothesis for a medium band", () => {
    render(<FindingEvidenceViewer finding={finding()} />);

    expect(screen.getByText("What would refute this")).toBeInTheDocument();
    expect(screen.getByText(/equipment failure/)).toBeInTheDocument();
  });

  it("warns when a confident assessment arrives without one", () => {
    const f = finding();
    render(
      <FindingEvidenceViewer
        finding={{ ...f, assessment: { ...f.assessment!, counterHypothesis: null } }}
      />,
    );

    expect(screen.getByText(/Treat it as unverified/)).toBeInTheDocument();
  });

  it("stays silent about refutation when the band does not require it", () => {
    const f = finding();
    render(
      <FindingEvidenceViewer
        finding={{
          ...f,
          assessment: { ...f.assessment!, band: "low", counterHypothesis: null },
        }}
      />,
    );

    expect(screen.queryByText(/Treat it as unverified/)).not.toBeInTheDocument();
    expect(screen.queryByText("What would refute this")).not.toBeInTheDocument();
  });

  it("names the provider, dataset and connector behind each evidence item", () => {
    render(<FindingEvidenceViewer finding={finding()} />);

    expect(screen.getByText("Global Fishing Watch")).toBeInTheDocument();
    expect(screen.getByText("public-global-fishing-events:latest")).toBeInTheDocument();
    expect(screen.getByText(/Connector global-fishing-watch/)).toBeInTheDocument();
  });

  it("surfaces what the finding does not cover", () => {
    render(<FindingEvidenceViewer finding={finding()} />);

    expect(screen.getByText(/Not covered: no distance from coast/)).toBeInTheDocument();
  });

  it("explains an absence instead of rendering an empty card", () => {
    render(
      <FindingEvidenceViewer
        finding={finding({
          status: "pending-source",
          statement: "Ownership could not be evaluated.",
          evidence: [],
          assessment: null,
          priority: null,
          priorityRationale: null,
          unavailableReason: "OpenCorporates is not wired to the map.",
        })}
      />,
    );

    expect(screen.getByText("Awaiting data source")).toBeInTheDocument();
    expect(screen.getByText("OpenCorporates is not wired to the map.")).toBeInTheDocument();
    expect(screen.queryByText("Evidence (0)")).not.toBeInTheDocument();
  });

  it("recomputes freshness from age rather than trusting the cached band", () => {
    // dataQuality.freshness says "stale"; ageMs of 2 minutes does not.
    render(
      <FindingEvidenceViewer
        finding={finding({
          dataQuality: {
            validation: "accepted",
            validationReasons: [],
            freshness: "stale",
            ageMs: 2 * 60_000,
            gaps: [],
          },
        })}
      />,
    );

    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });
});
