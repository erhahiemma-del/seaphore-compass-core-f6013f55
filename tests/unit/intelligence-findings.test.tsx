// @vitest-environment jsdom
/**
 * The findings projection says only what its domain already decided.
 *
 * These tests exist to hold two lines that matter to an officer: a
 * provider candidate is never reported as a fact about a hull, and a
 * source that said nothing is never counted as agreement.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AttentionCentre } from "@/features/maritime/AttentionCentre";
import { SanctionsIndicator } from "@/components/sanctions/SanctionsIndicator";
import { indicatorFor } from "@/lib/sanctions/indicator";
import { findingsFromScreenings } from "@/services/findings/from-sanctions";
import { corroborate } from "@/services/findings/corroboration";
import { orderFindings } from "@/services/findings/finding";
import type { SanctionsScreeningRecord } from "@/lib/sanctions/match-state";

afterEach(cleanup);

function screening(over: Partial<SanctionsScreeningRecord> = {}): SanctionsScreeningRecord {
  return {
    id: "scr-1",
    subjectName: "Opobo Pioneer",
    subjectImo: "SIM-0001",
    entityKind: "vessel",
    entityRole: "vessel",
    state: "REVIEW_REQUIRED",
    failureReason: null,
    errorMessage: null,
    topScore: 0.91,
    candidates: [
      {
        id: "ent-1",
        caption: "ADRIAN DARYA 1",
        schema: "Vessel",
        score: 0.91,
        matchBasis: ["name"],
        datasets: ["us_ofac_sdn"],
        topics: ["sanction"],
        programs: [],
        countries: ["ir"],
        identifiers: [],
        imoNumber: null,
      },
    ],
    provider: "OpenSanctions",
    dataset: "sanctions",
    scope: "vessel",
    screenedAt: "2026-08-30T10:00:00.000Z",
    decisions: [],
    ...over,
  };
}

describe("the sanctions finding projection", () => {
  it("never states a candidate as a fact about the vessel", () => {
    const [finding] = findingsFromScreenings([screening()]);
    const text = `${finding.summary} ${finding.reason}`.toLowerCase();

    // The one word this projection may never produce.
    expect(text).not.toMatch(/sanctioned/);
    expect(text).toMatch(/review/);
  });

  it("leaves a clean screening out of the attention list", () => {
    // A NO_MATCH asserts nothing, and listing it would read as clearance.
    expect(findingsFromScreenings([screening({ state: "NO_MATCH", candidates: [] })])).toHaveLength(
      0,
    );
  });

  it("keeps a provider failure as a collection gap, not a result", () => {
    const [finding] = findingsFromScreenings([
      screening({
        state: "SCREENING_UNAVAILABLE",
        failureReason: "PROVIDER_UNAVAILABLE",
        errorMessage: "gateway timeout",
        candidates: [],
        topScore: null,
      }),
    ]);

    expect(finding.attentionPriority).toBe("INFORMATIONAL");
    expect(finding.reason).toMatch(/No conclusion may be drawn|did not answer/);
  });

  it("counts one concern once when a subject was screened twice", () => {
    const findings = findingsFromScreenings([
      screening({ id: "old", screenedAt: "2026-08-01T00:00:00.000Z" }),
      screening({ id: "new", screenedAt: "2026-08-30T00:00:00.000Z" }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].sourceRecordId).toBe("new");
  });

  it("orders review above informational so the queue is actionable", () => {
    const ordered = orderFindings(
      findingsFromScreenings([
        screening({
          id: "gap",
          subjectImo: "SIM-0002",
          state: "SCREENING_UNAVAILABLE",
          candidates: [],
        }),
        screening(),
      ]),
    );

    expect(ordered[0].attentionPriority).toBe("REVIEW");
  });
});

describe("the vessel indicator", () => {
  it("reports an officer dismissal as dismissed, not as no match", () => {
    const record = screening({
      decisions: [
        {
          id: "d1",
          screeningId: "scr-1",
          candidateId: "ent-1",
          candidateCaption: "ADRIAN DARYA 1",
          decision: "DISMISSED",
          reason: "Different vessel — identifiers do not match",
          note: null,
          evidenceRef: null,
          officerId: "officer-1",
          decidedAt: "2026-08-30T11:00:00.000Z",
        },
      ],
    });

    expect(indicatorFor([record])).toBe("DISMISSED");
  });

  it("says nothing was checked when nothing was checked", () => {
    expect(indicatorFor([])).toBe("NOT_SCREENED");
  });

  it("carries its caveat and never the word sanctioned", () => {
    render(<SanctionsIndicator state="REVIEW_REQUIRED" onOpen={vi.fn()} />);
    const chip = screen.getByTestId("sanctions-indicator");

    expect(chip).toHaveAccessibleName(/No officer has ruled on it yet/);
    expect(chip.textContent?.toLowerCase()).not.toMatch(/sanctioned/);
  });
});

describe("corroboration", () => {
  it("treats a silent source as absence, never as agreement", () => {
    const result = corroborate([
      { source: "Datalastic", value: "NG" },
      { source: "OpenSanctions", value: null },
    ]);

    expect(result.level).toBe("SINGLE_SOURCE");
    expect(result.agreeing).toEqual(["Datalastic"]);
  });

  it("reports a disagreement instead of picking a winner", () => {
    const result = corroborate([
      { source: "Datalastic", value: "NG" },
      { source: "NPA", value: "LR" },
    ]);

    expect(result.level).toBe("SOURCE_CONFLICT");
    expect(result.claims).toHaveLength(2);
  });
});

describe("the attention centre with findings", () => {
  const NO_COUNTS = { URGENT: 0, ATTENTION: 0, WATCH: 0 } as const;

  function renderCentre(props: Partial<React.ComponentProps<typeof AttentionCentre>> = {}) {
    return render(
      <AttentionCentre
        alerts={[]}
        counts={NO_COUNTS}
        assessable
        unassessableCount={0}
        onView={vi.fn()}
        onAcknowledge={vi.fn()}
        {...props}
      />,
    );
  }

  it("lists findings under their own heading, apart from arrival alerts", () => {
    renderCentre({ findings: findingsFromScreenings([screening()]) });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    const section = screen.getByTestId("attention-findings");
    expect(section).toHaveTextContent("Sanctions");
    expect(section).toHaveTextContent("REVIEW_REQUIRED");
    // Findings carry no arrival lifecycle action.
    expect(screen.queryByRole("button", { name: /Acknowledge/ })).not.toBeInTheDocument();
  });

  it("counts findings as the officer's open work", () => {
    renderCentre({ findings: findingsFromScreenings([screening()]) });

    expect(screen.getByRole("button", { name: /1 active alert/ })).toBeInTheDocument();
  });

  it("attaches a finding to a case only when the officer asks", () => {
    const onLinkFinding = vi.fn();
    renderCentre({ findings: findingsFromScreenings([screening()]), onLinkFinding });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    expect(onLinkFinding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add to case" }));
    expect(onLinkFinding).toHaveBeenCalledTimes(1);
  });

  it("says why the findings list is empty rather than implying nothing was found", () => {
    renderCentre({ findingsUnavailableReason: "Sign in to see stored intelligence findings." });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    expect(screen.getByTestId("findings-unavailable")).toHaveTextContent(/Sign in/);
  });
});
