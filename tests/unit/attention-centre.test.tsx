// @vitest-environment jsdom
/**
 * The attention centre says only what it was given.
 *
 * The count is the number an officer plans their shift around, and the
 * empty state is the sentence they read when they decide nothing needs
 * doing. Both are asserted here for what they must never claim.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AttentionCentre } from "@/features/maritime/AttentionCentre";
import type { AlertPresentation } from "@/services/alerts";

function presentation(over: Partial<AlertPresentation> = {}): AlertPresentation {
  return {
    alertId: "alert_SIM-0001#1",
    imo: "SIM-0001",
    vesselName: "Opobo Pioneer",
    condition: "APPROACHING_24H",
    severity: "URGENT",
    lifecycleState: "OPEN",
    acknowledged: false,
    visualState: "ACTIVE",
    remindable: true,
    displayPriority: 18,
    headline: "Approaching within 24 hours",
    arrivalLine: "Approximately 18 hours · Estimated",
    reason: "Vessel meets the current 24-hour operational approach threshold.",
    provenance: {
      source: "simulated",
      positionAge: "Fresh",
      arrivalBasis: "Estimated",
      boundaryAccuracy: "Approximate",
    },
    assessmentUnavailable: false,
    actions: ["ACKNOWLEDGE", "ADD_UPDATE", "RESOLVE"],
    ...over,
  };
}

afterEach(cleanup);

const NO_COUNTS = { URGENT: 0, ATTENTION: 0, WATCH: 0 };

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

describe("the attention badge", () => {
  it("counts the alerts it was given and says so to a screen reader", () => {
    renderCentre({
      alerts: [presentation(), presentation({ alertId: "b", imo: "SIM-0002" })],
      counts: { URGENT: 2, ATTENTION: 0, WATCH: 0 },
    });

    expect(screen.getByRole("button", { name: /2 active alerts/ })).toBeInTheDocument();
  });

  it("says nothing about vessels when nothing was assessed", () => {
    renderCentre({ assessable: false });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    const empty = screen.getByTestId("attention-empty");
    /*
     * The distinction the whole empty state exists for. With no
     * assessment there is no all-clear to report, and "no vessels require
     * attention" would be a conclusion nobody reached.
     */
    expect(empty).toHaveTextContent(/No assessment has been made/);
    expect(empty.textContent).not.toMatch(/all clear/i);
  });

  it("qualifies an all-clear by what could actually be assessed", () => {
    renderCentre({ assessable: true });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    expect(screen.getByTestId("attention-empty")).toHaveTextContent(
      "No active alerts from the currently assessable vessel data.",
    );
  });
});

describe("the attention list", () => {
  it("shows the arrival with its basis, never a bare number", () => {
    renderCentre({ alerts: [presentation()], counts: { URGENT: 1, ATTENTION: 0, WATCH: 0 } });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    expect(screen.getByText("Approximately 18 hours · Estimated")).toBeInTheDocument();
  });

  it("identifies the hull, because vessel names are not unique", () => {
    renderCentre({ alerts: [presentation()], counts: { URGENT: 1, ATTENTION: 0, WATCH: 0 } });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    expect(screen.getByText("IMO SIM-0001")).toBeInTheDocument();
  });

  it("names the severity in words as well as in colour", () => {
    renderCentre({ alerts: [presentation()], counts: { URGENT: 1, ATTENTION: 0, WATCH: 0 } });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    // Colour alone is unreadable to a portion of officers, and invisible
    // to a screen reader.
    expect(screen.getByText(/Urgent/)).toBeInTheDocument();
  });

  it("selects through the caller's canonical path, by IMO", () => {
    const onView = vi.fn();
    renderCentre({
      alerts: [presentation()],
      counts: { URGENT: 1, ATTENTION: 0, WATCH: 0 },
      onView,
    });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    expect(onView).toHaveBeenCalledWith("SIM-0001");
  });

  it("offers acknowledge only while the domain would accept it", () => {
    renderCentre({
      /*
       * A coherent acknowledged alert: the lifecycle state and the
       * acknowledged flag must agree, because the row now reports the
       * state the domain holds rather than a derived boolean.
       */
      alerts: [
        presentation({
          actions: ["ADD_UPDATE", "RESOLVE"],
          acknowledged: true,
          lifecycleState: "ACKNOWLEDGED",
          visualState: "QUIET",
        }),
      ],
      counts: { URGENT: 1, ATTENTION: 0, WATCH: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    expect(screen.queryByRole("button", { name: /Acknowledge/ })).not.toBeInTheDocument();
    // Acknowledged is not gone: it is still the officer's open work, and
    // the row says which state it is in.
    expect(screen.getByText(/ACKNOWLEDGED/)).toBeInTheDocument();
  });

  it("reports unassessable vessels separately from alerts", () => {
    renderCentre({ unassessableCount: 5 });
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    const limitations = screen.getByTestId("assessment-limitations");
    expect(limitations).toHaveTextContent("5 vessels could not be assessed");
    // Five vessels nobody could assess are not five alerts, and must not
    // be added to the count.
    expect(screen.getByRole("button", { name: /No active alerts/ })).toBeInTheDocument();
  });

  it("does not imply the alerts are stored", () => {
    renderCentre();
    fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));

    expect(screen.getByText(/not stored/)).toBeInTheDocument();
  });
});
