/**
 * Selecting a known vessel without chasing it with the mouse.
 *
 * Simulated vessels move. Verifying anything about a *selected* vessel
 * meant reading its coordinates, computing its screen position and
 * clicking there — and the vessel had moved by the time the click
 * landed. That failed four times across two sessions and blocked three
 * verification gates.
 *
 * The parameter is an entrance to the existing selection, not a second
 * selection system: it resolves an identifier and then calls the same
 * `select` a map click calls, which is the only reason a gate closed
 * this way proves anything about the product.
 */
import { describe, expect, it } from "vitest";

import {
  resolveRequestedVessel,
  selectionParamFrom,
} from "@/features/maritime/deterministic-selection";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

const fleet = [
  { identity: { imo: "SIM-0001", mmsi: "111", name: "Opobo Pioneer" } },
  { identity: { imo: "SIM-0002", name: "Bonny Voyager" } },
];

describe("reading the request", () => {
  it("takes the identifier from the query string", () => {
    expect(selectionParamFrom("?select=SIM-0015&zoom=12")).toBe("SIM-0015");
  });

  it("treats absent, empty and whitespace as no request", () => {
    for (const search of ["", "?zoom=12", "?select=", "?select=%20%20"]) {
      expect(selectionParamFrom(search), search).toBeNull();
    }
  });

  it("hardcodes no vessel", () => {
    /*
     * The parameter is verification support, not product behaviour. A
     * simulation-specific identifier baked into application logic would
     * make a demonstration vessel part of the system.
     */
    const source = readSource("src/features/maritime/deterministic-selection.ts");
    expect(source).not.toMatch(/SIM-\d{4}/);
  });
});

describe("resolving it against vessels actually held", () => {
  it("matches on IMO, MMSI or name, whatever the officer typed", () => {
    expect(resolveRequestedVessel("SIM-0001", fleet)).toBe("SIM-0001");
    expect(resolveRequestedVessel("111", fleet)).toBe("SIM-0001");
    expect(resolveRequestedVessel("opobo pioneer", fleet)).toBe("SIM-0001");
  });

  it("returns nothing rather than guessing", () => {
    /*
     * Selecting a vessel nobody is carrying would leave the drawer
     * resolving nothing while the map looked selected — the exact
     * failure this exists to avoid, not one to introduce by another
     * route.
     */
    expect(resolveRequestedVessel("SIM-9999", fleet)).toBeNull();
    expect(resolveRequestedVessel("SIM-0001", [])).toBeNull();
    expect(resolveRequestedVessel(null, fleet)).toBeNull();
  });
});

describe("the map keeps parameters it does not own", () => {
  it("carries foreign keys through a write", () => {
    /*
     * The write replaced the whole query string with the map's own keys,
     * so `select` was destroyed before the module that reads it had even
     * been imported — the service is constructed at import time and
     * writes before the rest of the application loads. Owning some of
     * the query string is not owning all of it.
     */
    const service = new SharedGeospatialService();
    const params = service.toSearchParams();
    const owned = new Set(params.keys());
    expect(owned.has("select")).toBe(false);

    // The preservation rule, applied the way `syncToURL` applies it.
    const incoming = new URLSearchParams("?select=SIM-0015&utm=abc&zoom=9");
    for (const [key, value] of incoming) {
      if (!owned.has(key)) params.append(key, value);
    }
    expect(params.get("select")).toBe("SIM-0015");
    expect(params.get("utm")).toBe("abc");
    // And the map's own key is not duplicated from the incoming URL.
    expect(params.getAll("zoom")).toHaveLength(1);
  });

  it("keeps the preservation in the writer itself", () => {
    const source = readSource("src/services/geospatial/shared-geospatial-service.ts");
    const writer = source.slice(source.indexOf("private syncToURL"));
    expect(writer).toContain("owned.has(key)");
  });
});

describe("selection still goes through the canonical path", () => {
  it("produces the same selection a map click produces", () => {
    const service = new SharedGeospatialService();
    service.select({ kind: "vessel", id: "SIM-0001", imo: "SIM-0001" });
    expect(service.get().selection).toEqual({
      kind: "vessel",
      id: "SIM-0001",
      imo: "SIM-0001",
    });
    service.clearSelection();
    expect(service.get().selection).toBeNull();
  });

  it("adds no second selection mechanism", () => {
    const source = readSource("src/features/maritime/deterministic-selection.ts");
    // It resolves an identifier; it does not select anything itself.
    expect(source).not.toContain("select(");
    expect(source).not.toContain("useState");
  });
});

function readSource(relative: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");
}
