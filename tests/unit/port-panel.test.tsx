// @vitest-environment jsdom
/**
 * What the port drawer tells the officer.
 *
 * Two things are being tested. The obvious one is that each resolution
 * state renders its own words — a port that cannot be placed says so,
 * and says which of the several reasons applies.
 *
 * The load-bearing one is negative: this panel must never display an
 * operational figure, because Seaphore holds none. A panel is where an
 * invented number would look most authoritative, so the absence is
 * asserted directly against the rendered text rather than trusted to
 * code review.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PortPanel } from "@/features/maritime/PortPanel";
import {
  LayeredPortGazetteer,
  NimasaPortGazetteer,
  UnLocodePortGazetteer,
  portVoyageRelationships,
  resolvePort,
  toVoyage,
  type GazetteerAsset,
  type PortGazetteer,
  type Voyage,
} from "@/services/geospatial";

afterEach(() => cleanup());

const ASSET: GazetteerAsset = {
  metadata: {
    name: "TEST_FIXTURE",
    source: "test",
    licence: "PDDL",
    seaportCount: 3,
    locatedCount: 2,
    coordinatePrecision: "degree-and-minute",
    notice: "test",
  },
  ports: {
    NLRTM: { n: "Rotterdam", c: "NL", p: [4.5, 51.9167] },
    SGSIN: { n: "Singapore", c: "SG", p: [103.85, 1.2833] },
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

const PORT_A = "11111111-1111-4111-8111-111111111111";
const PORT_B = "22222222-2222-4222-8222-222222222222";

function voyage(origin: string, destination: string): Voyage {
  return toVoyage(
    {
      id: `v-${origin}-${destination}`,
      voyage_number: `VOY-${origin}`,
      origin_port_id: PORT_A,
      destination_port_id: PORT_B,
      origin_port: { id: PORT_A, unlocode: origin },
      destination_port: { id: PORT_B, unlocode: destination },
      status: "in_transit",
    },
    gazetteer,
  );
}

/** Render a port with its relationships resolved the same way the host does. */
function renderPort(
  id: string,
  voyages: readonly Voyage[] = [],
  status: "loading" | "unavailable" | "empty" | "ready" = "ready",
  extra: { country?: string; unlocode?: string } = {},
) {
  const port = resolvePort({ id, ...extra }, gazetteer);
  return render(
    <PortPanel port={port} relationships={portVoyageRelationships(port, voyages, status)} />,
  );
}

/* ═══════ Identity and location ═══════ */

describe("port identity and location", () => {
  it("renders a NIMASA port with its operator reference position", () => {
    renderPort("NGAPAPA");
    const panel = screen.getByTestId("port-panel");
    expect(panel).toHaveAttribute("data-identity-source", "nimasa");
    expect(panel).toHaveTextContent("Apapa (Lagos)");
    expect(panel).toHaveTextContent("NGAPP");
    expect(screen.getByTestId("port-precision")).toHaveTextContent(/operator reference position/i);
    expect(screen.getByTestId("port-reference")).toHaveTextContent(/14/);
  });

  it("renders a global port with its precision stated", () => {
    renderPort("NLRTM");
    expect(screen.getByTestId("port-panel")).toHaveTextContent("Rotterdam");
    expect(screen.getByTestId("port-precision")).toHaveTextContent(/±1 km/);
    // Reference figures belong to NIMASA ports only.
    expect(screen.queryByTestId("port-reference")).not.toBeInTheDocument();
  });

  it("says a known port has no published coordinates", () => {
    renderPort("GBLON");
    expect(screen.getByTestId("port-panel")).toHaveTextContent("London");
    const node = screen.getByTestId("port-position-unavailable");
    expect(node).toHaveTextContent(/publishes no coordinates/i);
    expect(node).toHaveTextContent(/not drawn on the map/i);
  });

  it("says an unrecognised port is unresolved and infers nothing", () => {
    renderPort("QQQQQ");
    expect(screen.getByTestId("port-position-unknown")).toHaveTextContent(
      /none have been inferred/i,
    );
  });

  it("surfaces conflicting identifiers instead of choosing one", () => {
    renderPort("NLRTM", [], "ready", { country: "NG", unlocode: "NLRTM" });
    expect(screen.getByTestId("port-ambiguity")).toHaveTextContent(/disagree/i);
    expect(screen.getByTestId("port-ambiguity")).toHaveTextContent(/NG/);
    expect(screen.getByTestId("port-ambiguity")).toHaveTextContent(/NL/);
    // And no coordinates are shown.
    expect(screen.queryByTestId("port-precision")).not.toBeInTheDocument();
  });

  it("says when no UN/LOCODE is recorded", () => {
    renderPort("QQQQQ");
    expect(screen.getByTestId("port-no-unlocode")).toBeInTheDocument();
  });
});

/* ═══════ Relationships ═══════ */

describe("relationship states are worded differently", () => {
  it("lists related voyages by the role the record states", () => {
    renderPort("NGAPAPA", [voyage("NGAPP", "NLRTM"), voyage("SGSIN", "NGAPP")]);
    const known = screen.getByTestId("port-voyages-known");
    expect(known).toHaveTextContent(/recorded as origin/i);
    expect(known).toHaveTextContent(/recorded as destination/i);
    expect(known).toHaveTextContent(/not an observation/i);
  });

  it("reports genuinely none differently from cannot-determine", () => {
    const { unmount } = renderPort("NGAPAPA", [voyage("SGSIN", "NLRTM")], "ready");
    const noneText = screen.getByTestId("port-voyages-none").textContent ?? "";
    expect(noneText).toMatch(/no voyage in the loaded records/i);
    unmount();

    renderPort("NGAPAPA", [], "unavailable");
    const unavailableText = screen.getByTestId("port-voyages-unavailable").textContent ?? "";
    expect(unavailableText).toMatch(/could not be read/i);
    expect(unavailableText).toMatch(/not the same as there being none/i);

    expect(noneText).not.toBe(unavailableText);
  });

  it("treats a still-loading register as undetermined, not as empty", () => {
    renderPort("NGAPAPA", [], "loading");
    expect(screen.getByTestId("port-voyages-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("port-voyages-none")).not.toBeInTheDocument();
  });

  it("opens a related voyage through the existing selection path", async () => {
    const onSelectVoyage = vi.fn();
    const port = resolvePort({ id: "NGAPAPA" }, gazetteer);
    const voyages = [voyage("NGAPP", "NLRTM")];
    render(
      <PortPanel
        port={port}
        relationships={portVoyageRelationships(port, voyages, "ready")}
        onSelectVoyage={onSelectVoyage}
      />,
    );
    screen.getByRole("button", { name: /VOY-NGAPP/ }).click();
    expect(onSelectVoyage).toHaveBeenCalledWith(voyages[0]);
  });
});

/* ═══════ Anti-fabrication ═══════ */

describe("the panel never shows operational intelligence", () => {
  /*
   * Seaphore holds no source for any of these. This asserts against
   * the rendered text across every port state, so a future well-meaning
   * addition has to break a test rather than slip past review.
   */
  const FORBIDDEN =
    /congestion|arrival|departure|berth occupan|berth availab|throughput|capacity|waiting time|dwell|traffic|vessels? (?:in|at) port|schedule/i;

  /*
   * Voyages are built lazily. Constructing them here, while the
   * `describe` body evaluates, would run before `beforeAll` has loaded
   * the gazetteer — the fixtures would resolve against `undefined`.
   */
  const CASES: ReadonlyArray<[string, string, () => readonly Voyage[], "ready" | "unavailable"]> = [
    ["NIMASA port with voyages", "NGAPAPA", () => [voyage("NGAPP", "NLRTM")], "ready"],
    ["global port", "NLRTM", () => [], "ready"],
    ["port with no coordinates", "GBLON", () => [], "ready"],
    ["unresolved port", "QQQQQ", () => [], "ready"],
    ["register unreadable", "NGAPAPA", () => [], "unavailable"],
  ];

  it.each(CASES)("shows no operational figures for a %s", (_label, id, voyages, status) => {
    renderPort(id, voyages(), status);
    let text = screen.getByTestId("port-panel").textContent ?? "";
    /*
     * The only permitted mentions are the caveats that exist precisely
     * to deny these figures — "live port operations unavailable", and
     * "berth count is not capacity, occupancy or throughput". Both are
     * stripped by test id rather than by loosening the pattern, so the
     * guard stays strict everywhere else.
     */
    for (const id of ["port-operations-unavailable", "port-reference-caveat"]) {
      const node = screen.queryByTestId(id);
      if (node?.textContent) text = text.replace(node.textContent, "");
    }
    expect(text).not.toMatch(FORBIDDEN);
  });

  it("states the operational gap explicitly rather than leaving it blank", () => {
    renderPort("NGAPAPA");
    expect(screen.getByTestId("port-operations-unavailable")).toHaveTextContent(
      /live port operations unavailable/i,
    );
  });

  it("never renders a numeric figure that no source published", () => {
    // A port with nothing known must carry no digits beyond its own
    // identifier — no zeroes standing in for counts.
    renderPort("QQQQQ");
    const text = screen.getByTestId("port-panel").textContent ?? "";
    expect(text).not.toMatch(/\b0\s*(vessels|calls|arrivals|berths)\b/i);
  });

  it("labels berth count as an estate figure, never as capacity", () => {
    renderPort("NGAPAPA");
    const reference = screen.getByTestId("port-reference");
    expect(reference).toHaveTextContent(/not capacity, occupancy or throughput/i);
  });
});

/* ═══════ Loading and absence ═══════ */

describe("loading and absence are distinguishable", () => {
  it("says loading while resolving", () => {
    render(<PortPanel port={null} relationships={null} loading />);
    expect(screen.getByTestId("port-panel")).toHaveTextContent(/loading port/i);
  });

  it("attributes an absent port to collection, not to the world", () => {
    render(<PortPanel port={null} relationships={null} />);
    expect(screen.getByTestId("port-panel")).toHaveTextContent(
      /reflects Seaphore.s collection, not the absence of a port/i,
    );
  });
});
