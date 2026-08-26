/**
 * Tin Can Island, from registry to placed label.
 *
 * Tin Can was never a missing port. It was in the canonical registry, in
 * the emitted GeoJSON, inside the opening camera and clickable — and it
 * drew an unlabelled symbol nine pixels from Apapa's, which reads as one
 * port rather than two.
 *
 * Two independent faults produced that, and both are pinned here.
 *
 * The first is a contract nobody was enforcing: the renderer reads
 * feature properties the feature pipeline never wrote. `labelPriority`
 * coalesced to a constant for every port, so the declared collision order
 * was inert and placement fell back to source order. The general form of
 * that bug — the renderer asking for a property the source does not emit
 * — is asserted below by reading both sides, so the next property added
 * to a port layer cannot quietly go unfed.
 *
 * The second is that sorting was the wrong instrument. A sort key decides
 * which label wins a contested position; what two ports 8.8 km apart need
 * is for both to be placed somewhere. That is variable anchoring, and a
 * test that only checked the sort key would have passed while Tin Can
 * stayed nameless.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { portFeatureCollection } from "@/services/geospatial/asset-features";
import {
  NIGERIAN_PORTS,
  canonicalPortId,
  findNigerianPort,
  hasDrawablePosition,
} from "@/services/geospatial/nigerian-ports";
import { MAP_DEFAULTS, NIMASA_PORTS } from "@/services/geospatial/constants";
import { createDefaultLayerRegistry } from "@/services/geospatial/layer-registry";

const RENDERER = readFileSync(
  resolve(process.cwd(), "src/services/geospatial/renderers/maplibre-renderer.ts"),
  "utf8",
);

const features = portFeatureCollection().features;
const tinCan = features.find((f) => f.id === "NGTIN");

/* ═══════ 1. Canonical identity ═══════ */

describe("Tin Can Island is one canonical port", () => {
  it("is registered under NGTIN", () => {
    expect(NIGERIAN_PORTS.NGTIN).toBeDefined();
    expect(NIGERIAN_PORTS.NGTIN!.locode).toBe("NGTIN");
  });

  it("resolves from every spelling in use", () => {
    for (const alias of ["NGTIN", "ngtin", "  TCT  ", "TIN", "TINCAN", "Tin Can"]) {
      expect(canonicalPortId(alias), `"${alias}" did not resolve`).toBe("NGTIN");
    }
  });

  it("carries NPA provenance rather than a bare coordinate", () => {
    const port = NIGERIAN_PORTS.NGTIN!;
    expect(port.provenance.source).toMatch(/Nigerian Ports Authority/i);
    // The note must record what kind of position this is. "NPA" alone
    // does not tell an officer whether it is a berth or a complex.
    expect(port.provenance.note.length).toBeGreaterThan(20);
  });

  it("sits at the NPA handbook position", () => {
    /*
     * 06°25.7'N 003°20.530'E, converted from degrees and decimal
     * minutes. Asserted as the arithmetic rather than as two literals so
     * the test states the source rather than restating the constant.
     */
    const port = NIMASA_PORTS.NGTIN!;
    expect(port.lat).toBeCloseTo(6 + 25.7 / 60, 5);
    expect(port.lon).toBeCloseTo(3 + 20.53 / 60, 5);
  });

  it("stays a different place from Apapa", () => {
    // Proximity is not identity. These are two complexes on one approach.
    expect(canonicalPortId("NGTIN")).not.toBe(canonicalPortId("NGAPAPA"));
    expect(NIMASA_PORTS.NGTIN!.lon).not.toBe(NIMASA_PORTS.NGAPAPA!.lon);
    expect(NIGERIAN_PORTS.NGTIN!.name).not.toBe(NIGERIAN_PORTS.NGAPAPA!.name);
  });
});

/* ═══════ 2. One drawable feature ═══════ */

describe("Tin Can reaches the renderer as exactly one feature", () => {
  it("appears once, never twice", () => {
    // A second Tin Can would draw two symbols on one quay and make the
    // click target ambiguous.
    expect(features.filter((f) => f.id === "NGTIN")).toHaveLength(1);
  });

  it("is a port, at the canonical position", () => {
    expect(tinCan).toBeDefined();
    expect(tinCan!.properties.assetKind).toBe("port");
    expect(tinCan!.geometry.coordinates).toEqual(NIGERIAN_PORTS.NGTIN!.position);
  });

  it("carries a label the officer will recognise", () => {
    expect(tinCan!.properties.shortName).toBe("TIN CAN");
    expect(String(tinCan!.properties.name)).toMatch(/Tin[- ]Can/i);
  });

  it("is drawn by a ready, on-by-default layer", () => {
    const ports = createDefaultLayerRegistry().get("ports");
    expect(ports?.status).toBe("ready");
    expect(ports?.defaultVisible).toBe(true);
  });
});

/* ═══════ 3. The property contract ═══════ */

describe("the renderer is fed every property it reads", () => {
  /*
   * The port layers, sliced out of the renderer so the assertion tracks
   * the real style rather than a copy of it.
   */
  const portLayers = (() => {
    const start = RENDERER.indexOf("id: LAYER_IDS.ports,");
    const end = RENDERER.indexOf("// ── Vessels ──");
    expect(start, "port layer block not found").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return RENDERER.slice(start, end);
  })();

  it("emits a value for every ['get', …] in the port layers", () => {
    /*
     * This is the bug in general form. `labelPriority` and `precision`
     * were both read here and written nowhere, and because
     * `symbol-sort-key` wraps its lookup in a `coalesce`, the missing
     * property produced a working map with a defeated rule rather than
     * an error.
     */
    const read = new Set([...portLayers.matchAll(/\["get", "([A-Za-z]+)"\]/g)].map((m) => m[1]!));
    expect(read.size).toBeGreaterThan(2);
    const emitted = new Set(Object.keys(tinCan!.properties));
    const unfed = [...read].filter((key) => !emitted.has(key));
    expect(unfed, `renderer reads ${unfed.join(", ")} but no port feature carries it`).toEqual([]);
  });

  it("gives every port a real collision priority", () => {
    // 9 is the renderer's coalesce fallback. A port arriving with it
    // means the canonical lookup missed.
    for (const feature of features) {
      expect(feature.properties.labelPriority, `${feature.id} has no priority`).not.toBe(9);
    }
  });

  it("ranks Apapa above Tin Can, and Tin Can above Lekki", () => {
    const priority = (id: string) =>
      Number(features.find((f) => f.id === id)!.properties.labelPriority);
    expect(priority("NGAPAPA")).toBeLessThan(priority("NGTIN"));
    expect(priority("NGTIN")).toBeLessThan(priority("NGLEK"));
  });

  it("states each position's precision so the glyph can be honest", () => {
    /*
     * The hollow diamond marks an approximate position. Without
     * `precision` every port drew the solid operator-reference glyph,
     * including Lekki — an approximate mark presented as a surveyed one.
     */
    expect(tinCan!.properties.precision).toBe("surveyed");
    expect(features.find((f) => f.id === "NGLEK")!.properties.precision).toBe("degree-minute");
  });

  it("draws Lekki where its own record says it is", () => {
    // Geometry and the claim about geometry come from one record, or the
    // mark is more precise than the provenance beside it.
    const lekki = features.find((f) => f.id === "NGLEK")!;
    expect(lekki.geometry.coordinates).toEqual(NIGERIAN_PORTS.NGLKK!.position);
    expect(lekki.properties.canonicalId).toBe("NGLKK");
  });
});

/* ═══════ 4. Placement ═══════ */

describe("both Lagos labels get placed", () => {
  const labelBlock = RENDERER.slice(
    RENDERER.indexOf("id: LAYER_IDS.portLabels,"),
    RENDERER.indexOf("// ── Vessels ──"),
  );

  it("offers the placement engine alternative anchors", () => {
    /*
     * Sorting alone cannot solve this. It picks a winner, and the
     * requirement is that neither loses.
     */
    expect(labelBlock).toContain('"text-variable-anchor"');
    for (const anchor of ["top", "bottom", "left", "right"]) {
      expect(labelBlock, `no ${anchor} anchor`).toContain(`"${anchor}"`);
    }
  });

  it("uses a radial offset, because a fixed offset would be ignored", () => {
    // MapLibre takes the distance from `text-radial-offset` when variable
    // anchoring is on; a leftover `text-offset` silently does nothing.
    expect(labelBlock).toContain('"text-radial-offset"');
    expect(labelBlock).not.toContain('"text-offset"');
  });

  it("keeps the port symbol out of the decluttering pass", () => {
    // An NPA port must not vanish because vessels are dense around it.
    expect(portFeatureCollection().features.length).toBeGreaterThan(0);
    expect(RENDERER).toContain('"icon-allow-overlap": true');
  });
});

/* ═══════ 5. The estate ═══════ */

describe("the Nigerian estate is complete and separable", () => {
  it("holds all seven port complexes", () => {
    for (const locode of ["NGAPAPA", "NGTIN", "NGLKK", "NGONNE", "NGPHC", "NGWARR", "NGCBQ"]) {
      expect(NIGERIAN_PORTS[locode], `${locode} is missing`).toBeDefined();
    }
  });

  it("gives each one a distinct identity", () => {
    const ids = Object.values(NIGERIAN_PORTS).map((p) => p.locode);
    expect(new Set(ids).size).toBe(ids.length);
    const names = Object.values(NIGERIAN_PORTS).map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves both Lekki keys to one port", () => {
    // `NGLEK` in the constants registry, `NGLKK` in the canonical model.
    expect(canonicalPortId("NGLEK")).toBe("NGLKK");
    expect(canonicalPortId("NGLKK")).toBe("NGLKK");
  });

  it("draws every port that has a position", () => {
    const drawable = Object.values(NIGERIAN_PORTS).filter(hasDrawablePosition);
    expect(features).toHaveLength(drawable.length);
  });

  it("still refuses to place Rivers Port", () => {
    /*
     * Not an oversight. UN/LOCODE publishes no coordinate for NGPHC, and
     * the canonical model declines to substitute one. It stays named,
     * selectable and undrawn until an authoritative position arrives.
     */
    expect(findNigerianPort("NGPHC")?.positionStatus).toBe("position-unavailable");
    expect(features.some((f) => f.id === "NGPHC")).toBe(false);
  });

  it("frames the whole estate at the opening camera", () => {
    /*
     * Longitude only: the estate spans five degrees east-west and barely
     * two north-south, so the horizontal fit is the binding constraint.
     * A camera that pushed Calabar or Tin Can out of frame would read as
     * a missing port, which is where this whole investigation started.
     */
    const [centreLon] = MAP_DEFAULTS.center;
    const halfSpan = (360 / (512 * 2 ** MAP_DEFAULTS.zoom)) * (1536 / 2);
    for (const feature of features) {
      const lon = feature.geometry.coordinates[0];
      expect(Math.abs(lon - centreLon), `${feature.id} is outside the frame`).toBeLessThan(
        halfSpan,
      );
    }
  });
});
