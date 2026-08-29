/**
 * Opening the port a vessel says it is heading for.
 *
 * Two failures must not look alike. A destination with no resolved
 * identifier is the vessel broadcasting free text; a destination outside
 * the Nigerian gazetteer is a perfectly good declaration that this
 * deployment holds no record for. Reporting the second as "no port link"
 * would blame the vessel for Seaphore's coverage.
 *
 * And the join is on UNLOCODE, never a name. "LAGOS" is a port in Nigeria
 * and a port in Portugal; opening a workspace on a name match could put a
 * vessel in the wrong country.
 */
import { describe, expect, it } from "vitest";

import {
  departurePortTarget,
  destinationPortTarget,
} from "@/services/geospatial/voyage-port-target";
import type { DeclaredVoyage } from "@/services/geospatial/vessel-enrichment";

/** Bound for Lagos out of Kamsar — the real live case. */
const BOUND_FOR_LAGOS: DeclaredVoyage = {
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
};

describe("a destination inside the register", () => {
  it("produces a selection the port panel can open", () => {
    const target = destinationPortTarget(BOUND_FOR_LAGOS);

    expect(target.state).toBe("AVAILABLE");
    expect(target.selection).not.toBeNull();
    expect(target.selection!.kind).toBe("port");
    expect(target.port).not.toBeNull();
    expect(target.note).toBeNull();
  });

  it("selects by identifier, not by the name the vessel broadcast", () => {
    const target = destinationPortTarget(BOUND_FOR_LAGOS);

    // The id must be resolvable from the UNLOCODE, never the free text.
    expect(target.unlocode).toBe("NGLOS");
    expect(target.selection!.id).not.toBe("LAGOS");
  });
});

describe("the two ways it fails are kept apart", () => {
  /*
   * No identifier: the vessel is broadcasting text. Nothing can be opened,
   * and the name must not be used to guess a port.
   */
  it("refuses to open a destination with no identifier", () => {
    const target = destinationPortTarget({
      ...BOUND_FOR_LAGOS,
      destinationLink: {
        state: "NO_VERIFIED_PORT_LINK",
        unlocode: null,
        providerPortUuid: null,
        name: "LAGOS",
        note: "unresolved",
      },
    });

    expect(target.state).toBe("NO_IDENTIFIER");
    expect(target.selection).toBeNull();
    // The name is still shown as what was broadcast...
    expect(target.declaredName).toBe("LAGOS");
    // ...and explicitly not treated as a port.
    expect(target.note).toMatch(/not unique/i);
  });

  /*
   * Outside coverage: KAMSAR is a real port with a real UNLOCODE. The
   * declaration is sound; the gazetteer is Nigerian. Blaming the vessel
   * here would be blaming it for Seaphore's own limits.
   */
  it("says a foreign port is outside coverage, not unlinked", () => {
    const target = destinationPortTarget({
      ...BOUND_FOR_LAGOS,
      destinationLink: {
        state: "VERIFIED",
        unlocode: "GNKMR",
        providerPortUuid: "05c6be2e",
        name: "KAMSAR",
        note: null,
      },
    });

    expect(target.state).toBe("OUTSIDE_COVERAGE");
    expect(target.selection).toBeNull();
    // The identifier is kept — it is valid, just not held here.
    expect(target.unlocode).toBe("GNKMR");
    expect(target.note).toMatch(/outside this deployment/i);
    expect(target.note).toMatch(/not in question/i);
  });

  it("distinguishes both from a vessel declaring nothing", () => {
    const target = destinationPortTarget({
      ...BOUND_FOR_LAGOS,
      destinationLink: {
        state: "NOT_DECLARED",
        unlocode: null,
        providerPortUuid: null,
        name: null,
        note: null,
      },
    });

    expect(target.state).toBe("NOT_DECLARED");
    expect(target.selection).toBeNull();
  });

  it("handles a vessel with no voyage loaded", () => {
    const target = destinationPortTarget(null);

    expect(target.state).toBe("NOT_DECLARED");
    expect(target.selection).toBeNull();
    expect(target.note).toMatch(/no voyage has been loaded/i);
  });
});

describe("every non-available state explains itself", () => {
  /*
   * A null selection with no sentence is a dead button with no reason,
   * which is how an officer concludes the software is broken rather than
   * that the data is limited.
   */
  it("never returns an unopenable target without a note", () => {
    const cases: Array<DeclaredVoyage | null> = [
      null,
      {
        ...BOUND_FOR_LAGOS,
        destinationLink: {
          state: "NOT_DECLARED",
          unlocode: null,
          providerPortUuid: null,
          name: null,
          note: null,
        },
      },
      {
        ...BOUND_FOR_LAGOS,
        destinationLink: {
          state: "NO_VERIFIED_PORT_LINK",
          unlocode: null,
          providerPortUuid: null,
          name: "SOMEWHERE",
          note: null,
        },
      },
      {
        ...BOUND_FOR_LAGOS,
        destinationLink: {
          state: "VERIFIED",
          unlocode: "GNKMR",
          providerPortUuid: "x",
          name: "KAMSAR",
          note: null,
        },
      },
    ];

    for (const voyage of cases) {
      const target = destinationPortTarget(voyage);
      if (target.selection === null) {
        expect(target.note, `${target.state} must explain itself`).toBeTruthy();
      }
    }
  });
});

/*
 * The departure end of the voyage.
 *
 * `vessel_pro` gives a departure name and UNLOCODE but no provider uuid,
 * so this resolves on the code alone. The states must mean exactly what
 * they mean for a destination, or an officer reads the two ends of one
 * voyage by different rules.
 */
describe("departure port", () => {
  it("resolves a departure inside the register", () => {
    const target = departurePortTarget({
      ...BOUND_FOR_LAGOS,
      departurePort: "LAGOS",
      departureUnlocode: "NGLOS",
    });

    expect(target.state).toBe("AVAILABLE");
    expect(target.selection).not.toBeNull();
  });

  /*
   * The real live case: Kamsar, Guinea. A valid UNLOCODE this deployment
   * does not hold — Seaphore's coverage, not a defect in the declaration.
   */
  it("says a foreign departure is outside coverage", () => {
    const target = departurePortTarget(BOUND_FOR_LAGOS);

    expect(target.state).toBe("OUTSIDE_COVERAGE");
    expect(target.unlocode).toBe("GNKMR");
    expect(target.note).toMatch(/outside this deployment/i);
  });

  it("refuses a departure declared by name alone", () => {
    const target = departurePortTarget({ ...BOUND_FOR_LAGOS, departureUnlocode: null });

    expect(target.state).toBe("NO_IDENTIFIER");
    expect(target.selection).toBeNull();
  });

  it("reports a vessel declaring no departure at all", () => {
    const target = departurePortTarget({
      ...BOUND_FOR_LAGOS,
      departurePort: null,
      departureUnlocode: null,
    });

    expect(target.state).toBe("NOT_DECLARED");
  });

  it("handles no voyage", () => {
    expect(departurePortTarget(null).state).toBe("NOT_DECLARED");
  });

  /*
   * The two ends must not be confused. A vessel from Kamsar to Lagos has
   * one openable port and one outside coverage, and swapping them would
   * send an officer to the wrong end of the voyage.
   */
  it("does not confuse the two ends of a voyage", () => {
    const destination = destinationPortTarget(BOUND_FOR_LAGOS);
    const origin = departurePortTarget(BOUND_FOR_LAGOS);

    expect(destination.unlocode).toBe("NGLOS");
    expect(origin.unlocode).toBe("GNKMR");
    expect(destination.state).toBe("AVAILABLE");
    expect(origin.state).toBe("OUTSIDE_COVERAGE");
  });
});
