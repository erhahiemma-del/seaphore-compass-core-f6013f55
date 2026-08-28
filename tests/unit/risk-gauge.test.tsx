// @vitest-environment jsdom
/**
 * A gauge is a persuasive shape, so it must earn its needle.
 *
 * Every vessel on this map carries `riskLevel: "UNKNOWN"` because nothing
 * assigns risk yet. A needle resting in the green reads as "we checked,
 * it's fine" from across a room — and the natural default position, the
 * leftmost point of the arc, is exactly the lie, because the left of a
 * risk arc means LOW.
 *
 * These tests hold the distinction between "no risk" and "risk not
 * assessed", which are opposite operational conclusions drawn from the
 * same empty field.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RiskGauge } from "@/features/maritime/RiskGauge";
import type { Vessel } from "@/services/geospatial";

afterEach(cleanup);

const vessel = (riskLevel: Vessel["riskLevel"]): Vessel =>
  ({
    identity: { imo: "SIM-0001", name: "Opobo Pioneer" },
    position: { lat: 6, lon: 3, heading: 0, speed: 0, timestamp: new Date().toISOString() },
    riskLevel,
    attentionScore: 0,
  }) as Vessel;

describe("unassessed risk draws no needle", () => {
  it("says not assessed and never LOW", () => {
    render(<RiskGauge vessel={vessel("UNKNOWN")} />);
    const gauge = screen.getByTestId("risk-gauge");

    expect(gauge.dataset.assessed).toBe("false");
    expect(screen.getByText(/risk not assessed/i)).toBeTruthy();
    // The precise failure: the word LOW appearing for an unassessed vessel.
    expect(gauge.textContent).not.toMatch(/\blow\b/i);
  });

  it("labels itself honestly for a screen reader too", () => {
    render(<RiskGauge vessel={vessel("UNKNOWN")} />);
    expect(screen.getByLabelText(/risk not assessed/i)).toBeTruthy();
  });

  it("shows the reason it is unresolved when one is given", () => {
    render(<RiskGauge vessel={vessel("UNKNOWN")} reason="No assessment has been resolved" />);
    expect(screen.getByText(/no assessment has been resolved/i)).toBeTruthy();
  });
});

describe("a genuine band renders as itself", () => {
  it("draws the needle and names the band", () => {
    render(<RiskGauge vessel={vessel("HIGH")} />);
    const gauge = screen.getByTestId("risk-gauge");
    expect(gauge.dataset.assessed).toBe("true");
    expect(gauge.dataset.risk).toBe("HIGH");
    expect(screen.getByText("HIGH")).toBeTruthy();
  });

  it("distinguishes an assessed-clean vessel from an unassessed one", () => {
    /*
     * CLEAN is a real finding — somebody looked. UNKNOWN is the absence
     * of one. Rendering them alike would erase the work of assessing.
     */
    render(<RiskGauge vessel={vessel("CLEAN")} />);
    expect(screen.getByTestId("risk-gauge").dataset.assessed).toBe("true");
  });
});
