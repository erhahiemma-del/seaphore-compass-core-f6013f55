// @vitest-environment jsdom
/**
 * Two voyage panels must not contradict each other.
 *
 * The map-level snapshot reports "ETA — not reported by the source"
 * whenever it has no hours-to-go, and that was true until `vessel_pro`
 * started supplying a declared ETA. Stacked, the two panels said the ETA
 * was unavailable and then printed it, in that order — and a stated
 * absence read first is believed.
 *
 * So the register panel yields the rows the provider panel answers with
 * provenance behind them. Removing that yields the contradiction back.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VesselIntelligenceCard } from "@/features/maritime/VesselIntelligenceCard";
import { VesselVoyagePanel } from "@/features/maritime/VesselIntelligenceSections";
import type { VesselPresentation } from "@/features/maritime/vessel-presentation";
import type { Vessel } from "@/services/geospatial";
import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";

const presentation = {
  identity: [],
  snapshot: [],
  voyage: [
    { label: "Declared destination", value: "LAGOS", availability: "AVAILABLE" },
    { label: "ETA", availability: "UNAVAILABLE", reason: "Not reported by the source" },
    { label: "Origin", availability: "NOT_CONNECTED", reason: "No voyage record source" },
    { label: "Movement history", value: "Recorded track", availability: "AVAILABLE" },
  ],
  assessment: {
    risk: { label: "Risk", availability: "NOT_ASSESSED", reason: "n/a" },
    attention: { label: "Attention", availability: "NOT_ASSESSED", reason: "n/a" },
    confidence: { label: "Confidence", availability: "NOT_ASSESSED", reason: "n/a" },
    unresolved: true,
  },
  ownership: [],
  people: [],
  activity: [],
} as unknown as VesselPresentation;

// Each case renders the same panel; without this they accumulate in one DOM.
afterEach(cleanup);

describe("the register panel yields to the provider panel", () => {
  it("drops the rows the declared voyage answers", () => {
    render(
      <VesselVoyagePanel
        presentation={presentation}
        supersededLabels={new Set(["ETA", "Origin", "Declared destination"])}
      />,
    );

    // The contradiction: this panel must not assert the ETA is missing
    // while the declared-voyage panel below prints one.
    expect(screen.queryByText("Not reported by the source")).not.toBeInTheDocument();
    expect(screen.queryByText("ETA")).not.toBeInTheDocument();
    expect(screen.queryByText("Origin")).not.toBeInTheDocument();
  });

  it("keeps the rows the provider panel does not answer", () => {
    render(
      <VesselVoyagePanel
        presentation={presentation}
        supersededLabels={new Set(["ETA", "Origin", "Declared destination"])}
      />,
    );

    // Movement history is this panel's own, and must survive.
    // The label and the button both carry the phrase; the row is what matters.
    expect(screen.getAllByText("Movement history").length).toBeGreaterThan(0);
    expect(screen.getByText("Recorded track")).toBeInTheDocument();
  });

  /*
   * Without an enrichment there is no second panel, so nothing is
   * superseded and the honest absences must still be shown — otherwise
   * suppressing them would hide the fact that no ETA is known at all.
   */
  it("shows every row when no provider panel follows", () => {
    render(<VesselVoyagePanel presentation={presentation} />);

    expect(screen.getByText("ETA")).toBeInTheDocument();
    expect(screen.getByText("Not reported by the source")).toBeInTheDocument();
  });
});

/*
 * The wiring, which is where the defect actually lived.
 *
 * The cases above pass `supersededLabels` in by hand and prove the panel
 * honours it — but the panel was never wrong. What was wrong was the card
 * not passing it, and a mutation blanking that prop passed the whole file.
 * These drive the card, so the contradiction is asserted where it appears.
 */
describe("the card decides to supersede when it has a declared voyage", () => {
  const subject = (): Vessel =>
    ({
      identity: { imo: "9865714", mmsi: "245026000", name: "RIVER THAMES", flag: "NL" },
      position: {
        lon: 3.4,
        lat: 6.4,
        heading: 131,
        speed: 6.1,
        timestamp: "2026-08-29T14:41:00.000Z",
      },
      riskLevel: "UNKNOWN",
      attentionScore: 0,
    }) as Vessel;

  const declared: VesselEnrichment = {
    particulars: null,
    particularsProvenance: null,
    voyage: {
      departurePort: "KAMSAR",
      departureUnlocode: "GNKMR",
      departedAt: "2026-07-27T13:18:00.000Z",
      destinationText: "LAGOS",
      destinationLink: {
        state: "VERIFIED",
        unlocode: "NGLOS",
        providerPortUuid: "2cb375dd",
        name: "LAGOS",
        note: null,
      },
      eta: "2026-08-24T09:13:00.000Z",
      navigationStatus: "Restricted manoeuverability",
      currentDraught: 3.8,
      observedAt: "2026-08-29T14:41:00.000Z",
    },
    voyageProvenance: {
      provider: "Datalastic",
      endpoint: "vessel_pro",
      retrievedAt: "2026-08-29T14:42:00.000Z",
      observedAt: "2026-08-29T14:41:00.000Z",
    },
  };

  it("never says the ETA is missing while printing one", () => {
    render(
      <VesselIntelligenceCard
        vessel={subject()}
        onClose={() => {}}
        tab="voyage"
        enrichment={declared}
      />,
    );

    // The declared ETA is on screen...
    expect(screen.getByText("2026-08-24 09:13 UTC")).toBeInTheDocument();
    // ...so nothing above it may claim the source reported none.
    expect(screen.queryByText("Not reported by the source")).not.toBeInTheDocument();
  });

  /*
   * And with no enrichment the honest absence must survive — suppressing
   * it unconditionally would hide that no ETA is known at all.
   */
  it("keeps the absence when there is no declared voyage", () => {
    render(<VesselIntelligenceCard vessel={subject()} onClose={() => {}} tab="voyage" />);

    expect(screen.getByText("Not reported by the source")).toBeInTheDocument();
  });
});
