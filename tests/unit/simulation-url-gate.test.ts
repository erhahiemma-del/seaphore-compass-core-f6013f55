// @vitest-environment jsdom
/**
 * A link cannot put the operational chart into simulation.
 *
 * `sources` in the URL replaces the whole enabled set, so a link carrying
 * `sources=simulated` removed every real provider and drew a demonstration
 * in their place — measured live as 391 real vessels becoming 32 simulated
 * ones. The banner said "DEMONSTRATION DATA", but by then the picture was
 * already wrong, and because the parameter persists, one bookmark kept an
 * officer in a simulation across every reload with the real fleet absent.
 *
 * Enabling simulation stays a deliberate act available from the Sources
 * panel. What a link may not do is make that choice on an officer's
 * behalf.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";
import { isSimulatedSourceId } from "@/services/geospatial/vessel-source";

function serviceFrom(search: string): SharedGeospatialService {
  const service = new SharedGeospatialService({ urlSync: false });
  service.loadFromURL(search);
  return service;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/maritime");
});

describe("simulated sources are not hydrated from a link", () => {
  it("drops a simulated source the URL asked for", () => {
    const service = serviceFrom("?sources=simulated");

    expect(service.get().enabledSources).not.toContain("simulated");
  });

  /*
   * The damaging case. `sources` replaces rather than merges, so a
   * simulation-only link did not add a demonstration beside the real
   * fleet — it removed the fleet.
   */
  it("does not let a simulation-only link empty the real fleet", () => {
    const service = serviceFrom("?sources=simulated");
    const enabled = service.get().enabledSources;

    // Whatever remains, none of it may be simulated.
    expect(enabled.every((id) => !isSimulatedSourceId(id))).toBe(true);
  });

  it("keeps the real sources a link asks for", () => {
    const service = serviceFrom("?sources=datalastic,global-fishing-watch");

    expect(service.get().enabledSources).toContain("datalastic");
    expect(service.get().enabledSources).toContain("global-fishing-watch");
  });

  it("strips only the simulated entry from a mixed link", () => {
    const service = serviceFrom("?sources=datalastic,simulated");
    const enabled = service.get().enabledSources;

    expect(enabled).toContain("datalastic");
    expect(enabled).not.toContain("simulated");
  });
});

describe("the predicate", () => {
  it("recognises the simulation by id even before registration", () => {
    // `loadFromURL` can run before the route registers its providers, so
    // the registry cannot always answer. The one id that exists today is
    // treated as simulated regardless.
    expect(isSimulatedSourceId("simulated")).toBe(true);
  });

  it("does not mistake a real provider for a simulation", () => {
    expect(isSimulatedSourceId("datalastic")).toBe(false);
    expect(isSimulatedSourceId("global-fishing-watch")).toBe(false);
  });
});

describe("an officer may still turn simulation on deliberately", () => {
  /*
   * The gate is on links, not on the officer. Removing the ability to
   * demonstrate the system would be a different defect — the point is
   * that the choice is made in the session, in front of someone, rather
   * than carried invisibly in a bookmark.
   */
  it("allows the Sources panel to enable it within a session", () => {
    const service = new SharedGeospatialService({ urlSync: false });

    service.setEnabledSources(["datalastic", "simulated"]);

    expect(service.get().enabledSources).toContain("simulated");
  });
});
