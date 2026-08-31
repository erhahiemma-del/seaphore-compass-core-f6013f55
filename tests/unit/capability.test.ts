/**
 * Deriving what a layer can do, instead of declaring it.
 *
 * Layer status used to be a field somebody typed, and it lied twice: the
 * observed-tracks layer read "awaiting AIS history connector" long after
 * the connector shipped and started drawing, and the terminals layer read
 * "Unavailable" with ten terminals on screen. Neither was malice or even
 * carelessness — a declared status is a claim the system never checks,
 * and nothing reminded anyone to revisit it.
 *
 * So these tests are mostly about one thing: "Unavailable" must mean
 * "no source holds this", and nothing else. Three other conditions used
 * to render as Unavailable, and each of them hid something useful.
 */
import { describe, expect, it } from "vitest";

import {
  CAPABILITY_LABELS,
  hasUsableRecords,
  isDrawing,
  isExternallyBlocked,
  resolveCapability,
  type CapabilityInputs,
} from "@/services/geospatial/capability";

const base: CapabilityInputs = {
  hasRecords: true,
  hasDrawableGeometry: true,
  layerInstalled: true,
};

describe("what the map is actually doing", () => {
  it("reports a fed, installed, positioned layer as connected", () => {
    expect(resolveCapability(base)).toBe("CONNECTED");
  });

  it("distinguishes a derived layer from a fetched one", () => {
    expect(resolveCapability({ ...base, derived: true })).toBe("DERIVED");
    // Both are on the map; the difference is where the data came from.
    expect(isDrawing(resolveCapability({ ...base, derived: true }))).toBe(true);
  });
});

describe("the three conditions that used to read as Unavailable", () => {
  /*
   * The terminals case. 29 records, 10 with a facility-level position,
   * and no dedicated terminal layer — so the map does not draw them under
   * their own toggle, but every one is queryable.
   */
  it("says data is available when no layer draws it", () => {
    expect(resolveCapability({ ...base, layerInstalled: false })).toBe("DATA_AVAILABLE_NOT_DRAWN");
  });

  /*
   * The berths case. NPA names 525 and publishes a coordinate for none.
   * Nothing can draw them — and occupancy, vacancy and the vessel
   * alongside are all in the port panel regardless.
   */
  it("says geometry is missing when records carry no position", () => {
    expect(resolveCapability({ ...base, hasDrawableGeometry: false })).toBe("GEOMETRY_UNAVAILABLE");
  });

  it("keeps both usable by panels, search and Copilot", () => {
    expect(hasUsableRecords("DATA_AVAILABLE_NOT_DRAWN")).toBe(true);
    expect(hasUsableRecords("GEOMETRY_UNAVAILABLE")).toBe(true);
    // Which is exactly what "unavailable" must not claim.
    expect(hasUsableRecords("NOT_AVAILABLE")).toBe(false);
  });

  /*
   * The distinction that carries the whole design: a layer nobody has
   * built is not a layer that cannot exist.
   */
  it("never reports records as unavailable", () => {
    for (const inputs of [
      { ...base, layerInstalled: false },
      { ...base, hasDrawableGeometry: false },
      { ...base, hasDrawableGeometry: false, layerInstalled: false },
    ]) {
      expect(resolveCapability(inputs)).not.toBe("NOT_AVAILABLE");
    }
  });

  it("reserves unavailable for the case where nothing is held", () => {
    expect(resolveCapability({ ...base, hasRecords: false })).toBe("NOT_AVAILABLE");
  });
});

describe("obstacles no code can observe", () => {
  /*
   * A licence is an agreement between organisations. Nothing in the
   * repository can watch UNEP-WCMC grant commercial use of the WDPA, so
   * this one input stays declared — but it is an input, so it has to be
   * stated deliberately rather than being what a stale label decays into.
   */
  it("reports each declared blocker distinctly", () => {
    const blocked = (blocker: CapabilityInputs["blocker"]) =>
      resolveCapability({ ...base, hasRecords: false, hasDrawableGeometry: false, blocker });

    expect(blocked("LICENSE")).toBe("LICENSE_REQUIRED");
    expect(blocked("CREDENTIAL")).toBe("CREDENTIAL_REQUIRED");
    expect(blocked("AUTHORIZATION")).toBe("AUTHORIZATION_REQUIRED");
    expect(blocked("CONNECTOR")).toBe("READY_CONNECTOR_REQUIRED");
    expect(blocked("INGESTION")).toBe("READY_SOURCE_IDENTIFIED");
  });

  /*
   * Once the records are in Seaphore the obstacle has evidently been
   * cleared — they could not be here otherwise. Continuing to report
   * "licence required" over ingested data would be its own kind of stale,
   * which is the failure this whole module exists to prevent.
   */
  it("stops citing a blocker once the data has arrived", () => {
    expect(resolveCapability({ ...base, blocker: "LICENSE" })).toBe("CONNECTED");
    expect(resolveCapability({ ...base, layerInstalled: false, blocker: "INGESTION" })).toBe(
      "DATA_AVAILABLE_NOT_DRAWN",
    );
  });

  it("separates external obstacles from unbuilt work", () => {
    expect(isExternallyBlocked("LICENSE_REQUIRED")).toBe(true);
    expect(isExternallyBlocked("CREDENTIAL_REQUIRED")).toBe(true);
    expect(isExternallyBlocked("AUTHORIZATION_REQUIRED")).toBe(true);
    // A sprint can clear these; no amount of implementation buys a licence.
    expect(isExternallyBlocked("DATA_AVAILABLE_NOT_DRAWN")).toBe(false);
    expect(isExternallyBlocked("GEOMETRY_UNAVAILABLE")).toBe(false);
  });
});

describe("what an officer reads", () => {
  it("labels every status", () => {
    for (const status of Object.keys(CAPABILITY_LABELS)) {
      expect(CAPABILITY_LABELS[status as keyof typeof CAPABILITY_LABELS]).toBeTruthy();
    }
  });

  /*
   * Only one status may say "Unavailable". The others say what is
   * actually true, and the wording is the entire point of the change.
   */
  it("uses the word unavailable for exactly one status", () => {
    const exact = Object.entries(CAPABILITY_LABELS).filter(
      ([, label]) => label.toLowerCase() === "unavailable",
    );

    expect(exact.map(([status]) => status)).toEqual(["NOT_AVAILABLE"]);
  });

  it("tells an officer the data exists when it does", () => {
    expect(CAPABILITY_LABELS.DATA_AVAILABLE_NOT_DRAWN).toMatch(/data available/i);
    expect(CAPABILITY_LABELS.GEOMETRY_UNAVAILABLE).toMatch(/data available/i);
  });
});
