// @vitest-environment jsdom
/**
 * What the voyage drawer tells the officer.
 *
 * The panel is where the M2 truth contract meets a human being, so
 * these tests are about wording and prominence as much as data:
 *
 *   - the journey-intelligence state is stated, and says
 *     VOYAGE RELATIONSHIP rather than anything resembling a track;
 *   - an unresolved port is reported as unresolved, with no coordinate;
 *   - a voyage with no mappable geography is still a voyage;
 *   - an estimated time is never presented as an observed one.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { VoyagePanel } from "@/features/maritime/VoyagePanel";
import {
  LayeredPortGazetteer,
  NimasaPortGazetteer,
  UnLocodePortGazetteer,
  toVoyage,
  withObservedTrack,
  type GazetteerAsset,
  type PortGazetteer,
  type Voyage,
  type VoyageRowLike,
} from "@/services/geospatial";

afterEach(() => cleanup());

/** TEST_FIXTURE gazetteer: one located port, one real port with no position. */
const ASSET: GazetteerAsset = {
  metadata: {
    name: "TEST_FIXTURE",
    source: "test",
    licence: "PDDL",
    seaportCount: 2,
    locatedCount: 1,
    coordinatePrecision: "degree-and-minute",
    notice: "test",
  },
  ports: {
    NLRTM: { n: "Rotterdam", c: "NL", p: [4.5, 51.9167] },
    GBLON: { n: "London", c: "GB" },
  },
};

let gazetteer: PortGazetteer;

beforeAll(async () => {
  gazetteer = new LayeredPortGazetteer([
    new NimasaPortGazetteer(),
    new UnLocodePortGazetteer(async () => ASSET),
  ]);
  await gazetteer.load?.();
});

const ORIGIN_ID = "11111111-1111-4111-8111-111111111111";
const DESTINATION_ID = "22222222-2222-4222-8222-222222222222";

/**
 * A voyage built from a database-shaped row: UUID foreign keys plus the
 * embedded `ports` rows carrying the UN/LOCODEs.
 *
 * `origin`/`destination` take the *code*. Pass `null` to drop the
 * relationship, matching a voyage that names no port.
 */
function voyage(
  overrides: Partial<VoyageRowLike> & {
    origin?: string | null;
    destination?: string | null;
  } = {},
): Voyage {
  const { origin = "NGAPAPA", destination = "NLRTM", ...rest } = overrides;
  return toVoyage(
    {
      id: "v-1",
      voyage_number: "TEST-001",
      vessel_id: "vessel-1",
      origin_port_id: origin === null ? null : ORIGIN_ID,
      destination_port_id: destination === null ? null : DESTINATION_ID,
      origin_port: origin === null ? null : { id: ORIGIN_ID, unlocode: origin },
      destination_port: destination === null ? null : { id: DESTINATION_ID, unlocode: destination },
      status: "in_transit",
      etd: "2026-08-01T00:00:00.000Z",
      eta: "2026-08-21T00:00:00.000Z",
      ...rest,
    },
    gazetteer,
  );
}

describe("journey intelligence is stated before anything else", () => {
  it("names the state as a voyage relationship, not a track", () => {
    render(<VoyagePanel voyage={voyage()} />);
    const banner = screen.getByTestId("journey-intelligence-banner");
    expect(banner).toHaveTextContent(/voyage relationship/i);
    /*
     * The banner does mention an observed track — to say there is not
     * one — so the check has to be that it never *claims* to be one.
     * "No observed track is available" is the sentence we want; the
     * failure mode is a bare "Observed track" heading.
     */
    expect(banner.textContent ?? "").not.toMatch(/(^|[^t] )Observed track(?! is)/);
    expect(screen.getByTestId("voyage-panel")).toHaveAttribute(
      "data-journey-intelligence",
      "VOYAGE_RELATIONSHIP",
    );
  });

  it("says plainly that no observed track exists", () => {
    render(<VoyagePanel voyage={voyage()} />);
    expect(screen.getByTestId("no-observed-track-note")).toHaveTextContent(
      /no observed track is available/i,
    );
    expect(screen.getByTestId("no-observed-track-note")).toHaveTextContent(
      /no ais history provider connected/i,
    );
  });

  it("switches to observed track only when real positions exist", () => {
    const tracked = withObservedTrack(voyage(), [
      [3.42, 6.42],
      [4.5, 51.9],
    ]);
    render(<VoyagePanel voyage={tracked} />);
    expect(screen.getByTestId("journey-intelligence-banner")).toHaveTextContent(/observed track/i);
    expect(screen.queryByTestId("no-observed-track-note")).not.toBeInTheDocument();
  });
});

describe("endpoint resolution states", () => {
  it("case 1 — both endpoints resolved, with precision stated", () => {
    render(<VoyagePanel voyage={voyage()} />);
    // NIMASA origin is an operator reference position.
    expect(screen.getByTestId("voyage-endpoint-origin")).toHaveTextContent(/Apapa/);
    expect(screen.getByTestId("voyage-endpoint-origin")).toHaveTextContent(
      /operator reference position/i,
    );
    // UN/LOCODE destination is degree-minute, and says so.
    expect(screen.getByTestId("voyage-endpoint-destination")).toHaveTextContent(/Rotterdam/);
    expect(screen.getByTestId("voyage-endpoint-destination")).toHaveTextContent(/±1 km/);
  });

  it("case 2 — one endpoint known but unplaceable", () => {
    render(<VoyagePanel voyage={voyage({ destination: "GBLON" })} />);
    const unavailable = screen.getByTestId("endpoint-position-unavailable");
    // The port is named — it exists — and its absence from the map is
    // explained rather than left as a blank.
    expect(screen.getByTestId("voyage-endpoint-destination")).toHaveTextContent(/London/);
    expect(unavailable).toHaveTextContent(/publishes no coordinates/i);
    expect(unavailable).toHaveTextContent(/not drawn on the map/i);
  });

  it("case 3 — neither endpoint resolves, and the voyage still exists", () => {
    render(<VoyagePanel voyage={voyage({ origin: "ZZZZZ", destination: "QQQQQ" })} />);
    // The record survives its geography. Voyage number, vessel and
    // schedule are all still presented.
    expect(screen.getByTestId("voyage-panel")).toHaveTextContent(/TEST-001/);
    expect(screen.getByTestId("voyage-panel")).toHaveTextContent(/In transit/);
    expect(screen.getAllByTestId("endpoint-unresolved")).toHaveLength(2);
    for (const node of screen.getAllByTestId("endpoint-unresolved")) {
      expect(node).toHaveTextContent(/none has been inferred/i);
    }
  });

  /*
   * The database-side failures, each reported as itself.
   *
   * All four of these produce no marker on the map, and an officer who
   * cannot tell them apart cannot tell whether the fix is a data entry,
   * a broken join, a missing UN/LOCODE, or a gazetteer gap.
   */
  it("distinguishes a port that was never recorded", () => {
    render(<VoyagePanel voyage={voyage({ origin: null })} />);
    expect(screen.getByTestId("endpoint-link-not-recorded")).toHaveTextContent(
      /no port was recorded/i,
    );
  });

  it("distinguishes a port relationship that could not be retrieved", () => {
    render(
      <VoyagePanel
        voyage={toVoyage(
          {
            id: "v-2",
            origin_port_id: ORIGIN_ID,
            origin_port: null,
            destination_port_id: DESTINATION_ID,
            destination_port: { id: DESTINATION_ID, unlocode: "NLRTM" },
          },
          gazetteer,
        )}
      />,
    );
    expect(screen.getByTestId("endpoint-link-relationship-unavailable")).toHaveTextContent(
      /could not be retrieved/i,
    );
  });

  it("distinguishes a port record carrying no UN/LOCODE", () => {
    render(
      <VoyagePanel
        voyage={toVoyage(
          {
            id: "v-3",
            origin_port_id: ORIGIN_ID,
            origin_port: { id: ORIGIN_ID, unlocode: null, country: "NG" },
            destination_port_id: DESTINATION_ID,
            destination_port: { id: DESTINATION_ID, unlocode: "NLRTM" },
          },
          gazetteer,
        )}
      />,
    );
    const node = screen.getByTestId("endpoint-link-identifier-unavailable");
    expect(node).toHaveTextContent(/carries no UN\/LOCODE/i);
    // The country survives the failed lookup and is still shown.
    expect(node).toHaveTextContent(/NG/);
  });
});

describe("schedule wording keeps estimates apart from observations", () => {
  it("marks estimated and actual times differently", () => {
    render(<VoyagePanel voyage={voyage({ atd: "2026-08-01T06:00:00.000Z" })} />);
    const panel = screen.getByTestId("voyage-panel");
    expect(panel).toHaveTextContent(/ETD\s*\(est\.\)/i);
    expect(panel).toHaveTextContent(/ATD\s*\(actual\)/i);
    // Departure observed, arrival still only predicted.
    expect(panel).toHaveTextContent(/departure observed/i);
    expect(panel).toHaveTextContent(/arrival estimated only/i);
  });

  it("says not recorded rather than leaving a time blank", () => {
    render(<VoyagePanel voyage={voyage({ eta: null })} />);
    expect(screen.getByTestId("voyage-panel")).toHaveTextContent(/not recorded/i);
  });
});

describe("empty and loading states are distinguishable", () => {
  it("says loading while the feed is in flight", () => {
    render(<VoyagePanel voyage={null} loading />);
    expect(screen.getByTestId("voyage-panel")).toHaveTextContent(/loading voyage/i);
  });

  it("attributes an absent voyage to collection, not to the world", () => {
    render(<VoyagePanel voyage={null} />);
    expect(screen.getByTestId("voyage-panel")).toHaveTextContent(
      /reflects Seaphore.s collection, not the absence of a voyage/i,
    );
  });
});
