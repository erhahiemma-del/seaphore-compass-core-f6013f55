// @vitest-environment jsdom
/**
 * Rendering a manifest against what Datalastic observed.
 *
 * The table is driven by the corroboration engine's real output rather
 * than hand-written rows, so what is asserted here is what an officer
 * would actually see for that manifest.
 *
 * Two properties matter more than the formatting. Every field appears,
 * including the ones that could not be checked — a table of discrepancies
 * alone makes thirteen unverifiable fields look identical to thirteen that
 * passed. And nothing computes a verdict: approval is recorded against an
 * officer's name, and a component that reached one would have them signing
 * off on arithmetic rather than evidence.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CorroborationTable } from "@/features/manifest/CorroborationTable";
import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";
import {
  corroborateAgainstDatalastic,
  type SubmittedVessel,
} from "@/services/manifest/datalastic-corroboration";

afterEach(cleanup);

/** The live RIVER THAMES enrichment, 29 Aug 2026. */
const SOURCE: VesselEnrichment = {
  particulars: {
    callSign: "PDSY",
    grossTonnage: 2494,
    deadweight: 2775,
    teu: null,
    length: 79.95,
    breadth: 15,
    yearBuilt: 2020,
    homePort: "FLUSHING",
    flagName: "Netherlands",
    aisNameDiffers: null,
    speedAvg: 1.9,
    speedMax: 12,
    isNavaid: false,
  },
  particularsProvenance: {
    provider: "Datalastic",
    endpoint: "vessel_info",
    retrievedAt: "2026-08-29T14:42:00.000Z",
    observedAt: null,
  },
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

const HONEST: SubmittedVessel = {
  name: "RIVER THAMES",
  callSign: "PDSY",
  flag: "Netherlands",
  length: 79.95,
  breadth: 15,
  grossTonnage: 2494,
  deadweight: 2775,
  departureUnlocode: "GNKMR",
  destinationUnlocode: "NGLOS",
  departureTime: "2026-07-27T13:18:00.000Z",
  eta: "2026-08-24T09:13:00.000Z",
};

function rowFor(field: string): HTMLElement {
  const cell = screen.getByText(field);
  return cell.closest("tr") as HTMLElement;
}

describe("an honest manifest", () => {
  it("shows the submitted and observed values side by side", () => {
    const rows = corroborateAgainstDatalastic(HONEST, SOURCE, "RIVER THAMES");
    render(<CorroborationTable rows={rows} />);

    const callSign = within(rowFor("Call sign"));
    expect(callSign.getAllByText("PDSY").length).toBe(2);
    expect(callSign.getByText("Match")).toBeInTheDocument();
  });

  it("attributes each value to the endpoint that supplied it", () => {
    const rows = corroborateAgainstDatalastic(HONEST, SOURCE, "RIVER THAMES");
    render(<CorroborationTable rows={rows} />);

    expect(within(rowFor("ETA")).getByText(/vessel_pro/)).toBeInTheDocument();
    expect(within(rowFor("Call sign")).getByText(/vessel_info/)).toBeInTheDocument();
  });
});

describe("discrepancies read differently from one another", () => {
  it("marks a large tonnage difference as a mismatch", () => {
    const rows = corroborateAgainstDatalastic(
      { ...HONEST, grossTonnage: 3400 },
      SOURCE,
      "RIVER THAMES",
    );
    render(<CorroborationTable rows={rows} />);

    expect(within(rowFor("Gross tonnage")).getByText("Mismatch")).toBeInTheDocument();
  });

  /*
   * A rounded figure is not a discrepancy, and the row says how close
   * "close" was — an officer disputing it is entitled to the number.
   */
  it("marks a rounded tonnage as a close match and gives the tolerance", () => {
    const rows = corroborateAgainstDatalastic(
      { ...HONEST, grossTonnage: 2500 },
      SOURCE,
      "RIVER THAMES",
    );
    render(<CorroborationTable rows={rows} />);

    const row = within(rowFor("Gross tonnage"));
    expect(row.getByText("Close match")).toBeInTheDocument();
    expect(row.getByText(/1%/)).toBeInTheDocument();
  });

  /*
   * A manifest contradicting itself is the declarant's problem, not a
   * disagreement with Datalastic, and needs a different conversation — so
   * it must not wear the same badge as a mismatch.
   */
  it("distinguishes a self-contradicting manifest from a mismatch", () => {
    const rows = corroborateAgainstDatalastic(
      { ...HONEST, destinationPort: "TEMA", destinationUnlocode: "NGLOS" },
      SOURCE,
      "RIVER THAMES",
    );
    render(<CorroborationTable rows={rows} />);

    expect(within(rowFor("Destination port")).getByText("Conflict")).toBeInTheDocument();
  });
});

describe("the table never shrinks to its findings", () => {
  /*
   * A list of discrepancies alone makes thirteen unverifiable fields look
   * exactly like thirteen that passed. Every field appears.
   */
  it("renders every field the engine returned", () => {
    const rows = corroborateAgainstDatalastic(HONEST, SOURCE, "RIVER THAMES");
    render(<CorroborationTable rows={rows} />);

    expect(screen.getAllByRole("row")).toHaveLength(rows.length + 1); // + header
  });

  it("shows unverifiable fields rather than hiding them", () => {
    const rows = corroborateAgainstDatalastic(
      { ...HONEST, destinationPort: "LAGOS" },
      SOURCE,
      "RIVER THAMES",
    );
    render(<CorroborationTable rows={rows} />);

    expect(within(rowFor("Destination port")).getByText("Not verifiable")).toBeInTheDocument();
  });

  it("says so plainly when nothing is linked", () => {
    render(<CorroborationTable rows={[]} />);

    expect(screen.queryByTestId("corroboration-table")).not.toBeInTheDocument();
    // And refuses the inference an empty table would otherwise invite.
    expect(
      screen.getByText(/says nothing about whether a manifest was filed/i),
    ).toBeInTheDocument();
  });
});

describe("no verdict is rendered", () => {
  /*
   * Approval is recorded against an officer's name. A summary badge or an
   * approve control here would have them signing off on arithmetic.
   */
  it("offers no approval, rejection or score", () => {
    const rows = corroborateAgainstDatalastic(HONEST, SOURCE, "RIVER THAMES");
    const { container } = render(<CorroborationTable rows={rows} />);

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(screen.queryByText(/approve/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verified overall|passed|failed/i)).not.toBeInTheDocument();
  });
});
