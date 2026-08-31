/**
 * Port Digital Twin model (Phase 4B).
 *
 * The tests that matter here are honesty tests. A twin is allowed to hold
 * very little; it is not allowed to imply it holds more than it does, and
 * it is not allowed to draw a layer an officer switched off.
 */
import { describe, expect, it } from "vitest";

import {
  PORT_TWINS,
  PORT_TWIN_LAYERS,
  defaultTwinLayers,
  findPortTwinAsset,
  portTwin,
  portTwinFeatures,
  twinCoverage,
  type PortTwinLayerId,
} from "@/services/geospatial/port-twin";

const SPECIFIED_TWINS = ["NGAPAPA", "NGTIN", "NGONNE", "NGBON", "NGWARR", "NGCBQ"];

describe("port digital twins", () => {
  it("covers the six ports named in the specification", () => {
    expect(PORT_TWINS.map((twin) => twin.id).sort()).toEqual([...SPECIFIED_TWINS].sort());
  });

  it("gives every twin a camera preset and a position", () => {
    for (const twin of PORT_TWINS) {
      expect(twin.presetId).not.toBe("");
      const [lon, lat] = twin.position;
      // Nigeria's maritime envelope. A twin outside it is a data error,
      // not a rendering preference.
      expect(lon).toBeGreaterThan(2);
      expect(lon).toBeLessThan(9);
      expect(lat).toBeGreaterThan(3);
      expect(lat).toBeLessThan(7);
    }
  });

  it("declares all eleven specified layers", () => {
    expect(PORT_TWIN_LAYERS).toHaveLength(11);
    const ids = PORT_TWIN_LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(11);
  });

  it("names a custodian for every layer, so a gap is chaseable", () => {
    for (const layer of PORT_TWIN_LAYERS) {
      expect(layer.custodian.length).toBeGreaterThan(3);
    }
  });
});

describe("coverage honesty", () => {
  it("reports every layer for every twin, ready or pending", () => {
    for (const twin of PORT_TWINS) {
      const coverage = twinCoverage(twin.id);
      expect(coverage).toHaveLength(11);
    }
  });

  it("never claims a layer is ready while holding no asset for it", () => {
    for (const twin of PORT_TWINS) {
      for (const entry of twinCoverage(twin.id)) {
        if (entry.status === "ready") expect(entry.assetCount).toBeGreaterThan(0);
        else {
          expect(entry.assetCount).toBe(0);
          expect(entry.reason).toBeTruthy();
        }
      }
    }
  });

  it("reports an unknown twin as entirely pending rather than throwing", () => {
    const coverage = twinCoverage("NGNOPE");
    expect(coverage).toHaveLength(11);
    expect(coverage.every((entry) => entry.status === "pending-source")).toBe(true);
  });
});

describe("asset honesty", () => {
  it("leaves capacity and operator explicitly null rather than inventing them", () => {
    for (const twin of PORT_TWINS) {
      for (const asset of twin.assets) {
        expect(asset.capacity === null || asset.capacity.length > 0).toBe(true);
        expect(asset.operator === null || asset.operator.length > 0).toBe(true);
      }
    }
  });

  it("never asserts a compliance verdict no source supports", () => {
    for (const twin of PORT_TWINS) {
      for (const asset of twin.assets) {
        expect(asset.compliance.state).toBe("NOT_ASSESSED");
        expect(asset.compliance.note).toMatch(/separate|not/i);
      }
    }
  });

  it("carries provenance on every asset", () => {
    for (const twin of PORT_TWINS) {
      for (const asset of twin.assets) {
        expect(asset.provenance.source.length).toBeGreaterThan(3);
        expect(asset.provenance.note.length).toBeGreaterThan(3);
      }
    }
  });

  it("resolves an asset by id and returns null for an unknown one", () => {
    const asset = PORT_TWINS[0]?.assets[0];
    expect(asset).toBeDefined();
    expect(findPortTwinAsset(asset!.id)?.id).toBe(asset!.id);
    expect(findPortTwinAsset("twin:nonexistent")).toBeNull();
  });
});

describe("projection", () => {
  it("draws nothing when no twin is open", () => {
    expect(portTwinFeatures(null, defaultTwinLayers()).features).toHaveLength(0);
  });

  it("omits assets on a layer the officer switched off", () => {
    const apapa = portTwin("NGAPAPA");
    expect(apapa).toBeDefined();
    const berthsOnly = portTwinFeatures("NGAPAPA", ["berths"]);
    expect(berthsOnly.features.length).toBeGreaterThan(0);
    expect(berthsOnly.features.every((f) => f.properties.layer === "berths")).toBe(true);

    const none = portTwinFeatures("NGAPAPA", [] as PortTwinLayerId[]);
    expect(none.features).toHaveLength(0);
  });

  it("projects a colour and an asset id for every feature", () => {
    const features = portTwinFeatures("NGAPAPA", defaultTwinLayers());
    for (const feature of features.features) {
      expect(feature.properties.assetId).toContain("NGAPAPA");
      expect(feature.properties.colour).toMatch(/^#/);
      expect(feature.properties.twinId).toBe("NGAPAPA");
    }
  });

  it("carries an indicative extent only where the source gives one", () => {
    const features = portTwinFeatures("NGAPAPA", ["anchorage"]);
    expect(features.features.length).toBeGreaterThan(0);
    for (const feature of features.features) {
      expect(feature.properties.radiusKm).toBeGreaterThan(0);
    }
  });
});
