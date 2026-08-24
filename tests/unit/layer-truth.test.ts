/**
 * Declared capability must equal renderable capability.
 *
 * The Layer Panel reads `status` to decide whether a layer is offered as
 * operational. `resolveVisibility` does *not* consult `status`, so a
 * layer marked `ready` whose render layers nobody installs presents as a
 * working toggle and does nothing — and an officer reads an empty layer
 * as "no activity" rather than "not built". That is the same class of
 * error as drawing an unreported heading.
 *
 * The renderer's `installSourcesAndLayers` is WebGL-bound and cannot run
 * here, so the installed set is transcribed below and checked against
 * the source file. If the two disagree the test fails, which is the
 * point: the transcription cannot rot silently.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { INSTALLED_RENDER_LAYERS, LAYER_IDS, layerRegistry } from "@/services/geospatial";

/**
 * The renderer's own declaration of what it installs.
 *
 * Taken from the renderer rather than transcribed here, so this file
 * cannot drift from it. The renderer checks itself against the same
 * list at runtime — `verifyInstalledLayers` — which is what catches the
 * case this list cannot: an expression MapLibre rejects, leaving a
 * layer that the source adds and the engine never accepts.
 */
const INSTALLED = INSTALLED_RENDER_LAYERS;

const RENDERER_SOURCE = readFileSync(
  resolve(process.cwd(), "src/services/geospatial/renderers/maplibre-renderer.ts"),
  "utf8",
);

describe("the renderer's declared install list matches its code", () => {
  it("adds every layer the list names", () => {
    for (const id of INSTALLED) {
      const key = Object.entries(LAYER_IDS).find(([, value]) => value === id)?.[0];
      expect(RENDERER_SOURCE, `renderer never adds ${id}`).toContain(`id: LAYER_IDS.${key},`);
    }
  });

  it("adds no layer the list omits", () => {
    const added = [...RENDERER_SOURCE.matchAll(/id: LAYER_IDS\.(\w+),/g)].map(
      ([, key]) => LAYER_IDS[key as keyof typeof LAYER_IDS],
    );
    expect([...new Set(added)].sort()).toEqual([...INSTALLED].sort());
  });
});

describe("declared ready equals actually renderable", () => {
  it("every ready layer has all of its render layers installed", () => {
    const installed = new Set(INSTALLED);
    for (const layer of layerRegistry.list()) {
      if (layer.status !== "ready") continue;
      for (const renderId of layer.renderLayerIds) {
        expect(
          installed,
          `layer "${layer.id}" is declared ready but nothing installs "${renderId}"`,
        ).toContain(renderId);
      }
    }
  });

  it("every pending layer explains itself", () => {
    for (const layer of layerRegistry.list()) {
      if (layer.status !== "pending-source") continue;
      expect(layer.pendingReason, `layer "${layer.id}" is pending with no reason`).toBeTruthy();
    }
  });

  it("keeps observed tracks separate from voyage relationships", () => {
    // The M2 distinction, enforced. A voyage layer is renderable
    // because the voyages table is real; an observed track is not,
    // because no AIS history provider is connected. Marking the track
    // layer ready would make "no track drawn" read as "the vessel did
    // not move".
    const voyages = layerRegistry.require("voyages");
    expect(voyages.status).toBe("ready");
    expect(voyages.description).toMatch(/not an observed vessel track/i);
    // Points only. No line layer may connect two voyage endpoints —
    // a line between two ports reads as a route whatever it is called.
    expect(voyages.renderLayerIds).not.toContain("voyage-arcs-layer");

    const tracks = layerRegistry.require("aisTrack");
    expect(tracks.status).toBe("pending-source");
    expect(tracks.pendingReason).toBeTruthy();
  });

  it("keeps vessel clustering honest", () => {
    // It was `ready` and no renderer has ever drawn it. Clustering needs
    // a second source, because MapLibre clusters at the source and the
    // vessel source is promoteId-addressed for incremental updates.
    const clusters = layerRegistry.require("vesselClusters");
    expect(clusters.status).toBe("pending-source");
    expect(clusters.pendingReason).toMatch(/promoteId|second source/i);
  });

  it("names no render layer that does not exist", () => {
    const known = new Set(Object.values(LAYER_IDS));
    for (const layer of layerRegistry.list()) {
      for (const renderId of layer.renderLayerIds) {
        expect(known, `layer "${layer.id}" names unknown render layer "${renderId}"`).toContain(
          renderId,
        );
      }
    }
  });
});

describe("domain presets name only ready, installed layers", () => {
  it("holds for every domain", async () => {
    const { DOMAIN_PRESETS } = await import("@/services/geospatial");
    const installed = new Set(INSTALLED);
    for (const [domain, layers] of Object.entries(DOMAIN_PRESETS)) {
      for (const id of layers) {
        const definition = layerRegistry.get(id);
        expect(definition, `domain "${domain}" names unknown layer "${id}"`).toBeDefined();
        expect(definition?.status, `domain "${domain}" names pending layer "${id}"`).toBe("ready");
        for (const renderId of definition?.renderLayerIds ?? []) {
          expect(installed).toContain(renderId);
        }
      }
    }
  });
});
